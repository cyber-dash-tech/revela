import { tool } from "@opencode-ai/plugin"
import {
  createDeckSpec,
  DECKS_STATE_FILE,
  normalizeWorkspaceDeckState,
  readOrCreateDecksState,
  reviewDeckState,
  upsertDeck,
  upsertSlides,
  writeDecksState,
  workspaceDeckSlug,
  type DeckSpec,
  type NarrativeBrief,
  type RequiredInputs,
  type ResearchAxis,
  type SourceMaterial,
  type SlideSpec,
} from "../lib/decks-state"
import { upsertSourceMaterial } from "../lib/source-materials"
import { recordWorkspaceAction } from "../lib/workspace-state/actions"
import { applyEvidenceBindings } from "../lib/workspace-state/evidence-status"
import { attachResearchFindings } from "../lib/workspace-state/research-attachments"
import { activeReviewTargetId, latestReviewSnapshotForTarget } from "../lib/workspace-state/review-snapshots"

export default tool({
  description:
    `Read and update ${DECKS_STATE_FILE}, Revela's workspace deck state file. ` +
    "Use this tool instead of writing or patching the state file directly. " +
    "It stores active deck specs, per-slide content/layout/components, and computes write readiness.",
  args: {
    action: tool.schema
      .enum(["read", "init", "upsertDeck", "upsertSlides", "review", "applyEvidenceCandidates", "attachResearchFindings", "remember"])
      .describe("Action to perform on DECKS.json."),
    summary: tool.schema.boolean().optional().describe("For read: return a compact summary instead of full state."),
    goal: tool.schema.string().optional().describe("For upsertDeck: deck goal."),
    audience: tool.schema.string().optional().describe("For upsertDeck: deck audience."),
    language: tool.schema.string().optional().describe("For upsertDeck: deck language."),
    outputPath: tool.schema.string().optional().describe("For upsertDeck: target output path, normally decks/{workspace-name}.html."),
    narrativeBrief: tool.schema.object({
      audienceBeliefBefore: tool.schema.string().optional().describe("What the audience currently believes, assumes, or does not yet understand."),
      audienceBeliefAfter: tool.schema.string().optional().describe("What the audience should believe or understand after the deck."),
      decisionOrAction: tool.schema.string().optional().describe("The decision, approval, action, or behavioral change the deck is meant to drive."),
      narrativeArc: tool.schema.string().optional().describe("Compact story arc, such as context -> tension -> evidence -> recommendation -> ask."),
      keyClaims: tool.schema.array(tool.schema.string()).optional().describe("Main claims the deck must prove or communicate."),
      objections: tool.schema.array(tool.schema.string()).optional().describe("Likely stakeholder objections or questions the narrative should handle."),
      risks: tool.schema.array(tool.schema.string()).optional().describe("Risks, assumptions, caveats, or tradeoffs that should travel with the narrative."),
    }).optional().describe("For upsertDeck: 0.9 Narrative Compiler brief used to review story intent before writing."),
    design: tool.schema.string().optional().describe("For upsertDeck: active design name."),
    domain: tool.schema.string().optional().describe("For upsertDeck: active domain name."),
    memory: tool.schema.string().optional().describe("For remember: explicit user or workflow preference to store."),
    preferenceType: tool.schema.enum(["user", "workflow"]).optional().describe("For remember: which preference list to update."),
    requiredInputs: tool.schema.object({
      topicClarified: tool.schema.boolean().optional(),
      audienceClarified: tool.schema.boolean().optional(),
      languageDecided: tool.schema.boolean().optional(),
      visualStyleSelected: tool.schema.boolean().optional(),
      sourceMaterialsIdentified: tool.schema.boolean().optional(),
      researchNeedAssessed: tool.schema.boolean().optional(),
      researchFindingsRead: tool.schema.boolean().optional(),
      slidePlanConfirmed: tool.schema.boolean().optional(),
      designLayoutsFetched: tool.schema.boolean().optional(),
    }).optional().describe("For upsertDeck: checklist state. Only set true for explicit completed prerequisites."),
    sourceMaterials: tool.schema.array(tool.schema.object({
      path: tool.schema.string().describe("Workspace-relative source material path."),
      type: tool.schema.string().optional().describe("File type such as pdf, pptx, docx, xlsx, csv, md, or txt."),
      size: tool.schema.number().optional().describe("File size in bytes."),
      fingerprint: tool.schema.string().optional().describe("File fingerprint for the current version."),
      status: tool.schema.enum(["discovered", "extracted", "summarized", "researched"]).optional().describe("How far this source has been processed."),
      summary: tool.schema.string().optional().describe("Conservative source summary if already known."),
      bestUsedFor: tool.schema.string().optional().describe("Short note on deck sections this material is best used for."),
      firstSeen: tool.schema.string().optional().describe("ISO timestamp when first seen."),
      lastChecked: tool.schema.string().optional().describe("ISO timestamp when last checked."),
      lastExtracted: tool.schema.string().optional().describe("ISO timestamp when last extracted."),
      lastSummarized: tool.schema.string().optional().describe("ISO timestamp when last summarized."),
      extraction: tool.schema.object({
        manifestPath: tool.schema.string().optional(),
        textPath: tool.schema.string().optional(),
        cacheDir: tool.schema.string().optional(),
      }).optional().describe("Reusable extraction output paths, if any."),
    })).optional().describe("For init/readiness refresh: source material records discovered in the workspace."),
    researchPlan: tool.schema.array(tool.schema.object({
      axis: tool.schema.string().describe("Research axis name."),
      needed: tool.schema.boolean().describe("Whether this research axis is needed for the deck."),
      status: tool.schema.enum(["pending", "in_progress", "done", "read", "skipped"]).describe("Research status."),
      findingsFile: tool.schema.string().optional().describe("Findings file path if available."),
      notes: tool.schema.string().optional().describe("Short notes."),
    })).optional().describe("For upsertDeck: research plan."),
    slides: tool.schema.array(tool.schema.object({
      index: tool.schema.number().describe("1-based slide index."),
      title: tool.schema.string().describe("Slide title."),
      purpose: tool.schema.string().optional().describe("Narrative purpose of this slide."),
      narrativeRole: tool.schema.enum(["context", "tension", "evidence", "recommendation", "risk", "ask", "appendix", "close"]).optional().describe("Lightweight narrative role for review guidance."),
      layout: tool.schema.string().describe("Design layout name."),
      qa: tool.schema.boolean().optional().describe("Whether the slide is marked QA-relevant deck metadata."),
      components: tool.schema.array(tool.schema.string()).describe("Design components used by this slide."),
      content: tool.schema.object({
        headline: tool.schema.string().optional(),
        body: tool.schema.array(tool.schema.string()).optional(),
        bullets: tool.schema.array(tool.schema.string()).optional(),
        speakerNotes: tool.schema.string().optional(),
      }).describe("Structured slide content."),
      evidence: tool.schema.array(tool.schema.object({
        source: tool.schema.string().describe("Source file, URL, or research note."),
        quote: tool.schema.string().optional().describe("Compact quote or snippet supporting the slide claim."),
        page: tool.schema.string().optional().describe("Legacy page reference; prefer location for new page/slide/sheet/section references."),
        url: tool.schema.string().optional().describe("Source URL when available."),
        sourcePath: tool.schema.string().optional().describe("Workspace source file path when the evidence came from a local material."),
        location: tool.schema.string().optional().describe("Generic page, slide, sheet, section, or other source location reference."),
        findingsFile: tool.schema.string().optional().describe("researches/{topic}/{axis}.md findings file that records the supporting evidence."),
        caveat: tool.schema.string().optional().describe("Scope, uncertainty, or limitation that should travel with this evidence."),
        extractedTextPath: tool.schema.string().optional().describe("Reusable extracted text cache path when this evidence came from extracted materials."),
        extractedManifestPath: tool.schema.string().optional().describe("Reusable extracted materials manifest path when available."),
      })).optional().describe("Compact evidence references and source trace for this slide."),
      visuals: tool.schema.array(tool.schema.object({
        id: tool.schema.string().optional(),
        purpose: tool.schema.string().optional(),
        brief: tool.schema.string().describe("Visual brief."),
        assetPath: tool.schema.string().optional(),
      })).optional().describe("Visual needs or assets for this slide."),
      status: tool.schema.enum(["planned", "ready", "written", "qa_passed", "qa_failed"]).optional().describe("Slide production status."),
      notes: tool.schema.string().optional().describe("Implementation notes for this slide."),
    })).optional().describe("For upsertSlides: complete or partial slide specs."),
    candidateIds: tool.schema.array(tool.schema.string()).optional().describe("For applyEvidenceCandidates: candidate IDs returned by revela-decks review to explicitly bind proposed evidenceDraft records into slide evidence."),
    findingsFile: tool.schema.string().optional().describe("For attachResearchFindings: workspace-relative researches/{topic}/{axis}.md file to attach to researchPlan."),
    researchAxis: tool.schema.string().optional().describe("For attachResearchFindings: researchPlan axis to attach the findings file to. Required when filename matching would be ambiguous."),
    researchStatus: tool.schema.enum(["done", "read"]).optional().describe("For attachResearchFindings: optional explicit status to set on the matched research axis."),
  },
  async execute(args, context) {
    try {
      const workspaceRoot = context.directory ?? process.cwd()
      let state = normalizeWorkspaceDeckState(readOrCreateDecksState(workspaceRoot), workspaceRoot)
      const defaultSlug = workspaceDeckSlug(workspaceRoot)

      if (args.action === "init") {
        const discovered: SourceMaterial[] = []
        for (const material of (args.sourceMaterials ?? []) as SourceMaterial[]) {
          upsertSourceMaterial(state, material, material.status ?? "discovered")
          discovered.push(material)
        }
        if (discovered.length > 0) {
          recordWorkspaceAction(state, {
            type: "source.discovered",
            actor: "revela-decks",
            inputs: { count: discovered.length },
            outputs: { paths: discovered.map((material) => material.path), statuses: discovered.map((material) => material.status ?? "discovered") },
            summary: `Registered ${discovered.length} discovered source material${discovered.length === 1 ? "" : "s"}.`,
            nodeIds: discovered.map((material) => `source:${material.path}`),
          })
        }
        writeDecksState(workspaceRoot, state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, state }, null, 2)
      }

      if (args.action === "read") {
        const deckKey = state.activeDeck
        if (args.summary) {
          const deck = deckKey ? state.decks[deckKey] : undefined
          return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, activeDeck: state.activeDeck, deck }, null, 2)
        }
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, state }, null, 2)
      }

      if (args.action === "upsertDeck") {
        const deckKey = defaultSlug
        const existing = state.decks[deckKey]
        const deckInput: Partial<DeckSpec> & { slug: string } = {
          ...existing,
          slug: deckKey,
          goal: args.goal ?? existing?.goal ?? "",
          audience: args.audience ?? existing?.audience,
          language: args.language ?? existing?.language,
          outputPath: args.outputPath ?? existing?.outputPath,
          narrativeBrief: (args.narrativeBrief as NarrativeBrief | undefined) ?? existing?.narrativeBrief,
          theme: {
            design: args.design ?? existing?.theme?.design,
            domain: args.domain ?? existing?.theme?.domain,
          },
          requiredInputs: {
            ...(existing?.requiredInputs ?? {}),
            ...((args.requiredInputs ?? {}) as Partial<RequiredInputs>),
          } as RequiredInputs,
          researchPlan: (args.researchPlan as ResearchAxis[] | undefined) ?? existing?.researchPlan,
        }
        const next = upsertDeck(state, deckInput)
        writeDecksState(workspaceRoot, next)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, deck: next.activeDeck ? next.decks[next.activeDeck] : undefined }, null, 2)
      }

      if (args.action === "upsertSlides") {
        const deckKey = state.activeDeck || defaultSlug
        if (!args.slides) return JSON.stringify({ ok: false, error: "slides are required for upsertSlides" })
        const next = upsertSlides(state, deckKey, args.slides as SlideSpec[])
        writeDecksState(workspaceRoot, next)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, deck: next.activeDeck ? next.decks[next.activeDeck] : undefined }, null, 2)
      }

      if (args.action === "review") {
        const reviewed = reviewDeckState(state, undefined, { workspaceRoot })
        const targetId = activeReviewTargetId(reviewed.state)
        const snapshot = latestReviewSnapshotForTarget(reviewed.state, targetId)
        recordWorkspaceAction(reviewed.state, {
          type: "review.performed",
          actor: "revela-decks",
          inputs: { activeDeck: state.activeDeck },
          outputs: {
            slug: reviewed.result.slug,
            status: reviewed.result.status,
            ready: reviewed.result.ready,
            blockerCount: reviewed.result.blockers.length,
            warningCount: reviewed.result.warnings.length,
            issueCount: reviewed.result.issues.length,
            evidenceCandidateCount: reviewed.result.evidenceCandidates?.length ?? 0,
            snapshotId: snapshot?.id,
            inputHash: snapshot?.inputHash,
            targetId: snapshot?.targetId,
          },
          status: "success",
          summary: `Reviewed deck readiness: ${reviewed.result.ready ? "ready" : "blocked"}.`,
          nodeIds: [`artifact:${reviewed.state.decks[reviewed.result.slug]?.outputPath ?? reviewed.result.slug}`, ...(snapshot ? [snapshot.id] : [])],
        })
        writeDecksState(workspaceRoot, reviewed.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: reviewed.result }, null, 2)
      }

      if (args.action === "applyEvidenceCandidates") {
        const candidateIds = args.candidateIds ?? []
        if (candidateIds.length === 0) return JSON.stringify({ ok: false, error: "candidateIds are required for applyEvidenceCandidates" })
        const result = applyEvidenceBindings(workspaceRoot, candidateIds)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result }, null, 2)
      }

      if (args.action === "attachResearchFindings") {
        if (!args.findingsFile?.trim()) return JSON.stringify({ ok: false, error: "findingsFile is required for attachResearchFindings" })
        const result = attachResearchFindings(workspaceRoot, {
          findingsFile: args.findingsFile,
          researchAxis: args.researchAxis,
          status: args.researchStatus,
        })
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result }, null, 2)
      }

      if (args.action === "remember") {
        const memory = args.memory?.trim()
        if (!memory) return JSON.stringify({ ok: false, error: "memory is required for remember" })
        const preferenceType = args.preferenceType ?? "user"
        const list = state.workspace.preferences[preferenceType]
        if (!list.some((entry) => entry.trim().toLowerCase() === memory.toLowerCase())) list.push(memory)
        writeDecksState(workspaceRoot, state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, preferenceType, memory }, null, 2)
      }

      return JSON.stringify({ ok: false, error: `Unsupported action: ${args.action}` })
    } catch (e: any) {
      return JSON.stringify({ ok: false, error: e.message || String(e) })
    }
  },
})
