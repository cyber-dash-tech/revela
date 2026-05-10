import { tool } from "@opencode-ai/plugin"
import {
  createDeckSpec,
  confirmDeckPlan,
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
import {
  approveNarrativeState,
  recordNarrativeApprovalAction,
  recordNarrativeReviewAction,
  reviewNarrativeState,
} from "../lib/narrative-state/readiness"
import { compileDeckPlanFromNarrative } from "../lib/narrative-state/render-plan"
import { backfillSlideClaimRefsFromCoverage } from "../lib/narrative-state/coverage"
import { closeResearchGapInState, deriveResearchGapsFromReadiness, updateResearchGapInState, upsertResearchGapsInState } from "../lib/narrative-state/research-gaps"
import { normalizeCanonicalNarrativeState, normalizeNarrativeState } from "../lib/narrative-state/normalize"
import { narrativeToBrief } from "../lib/narrative-state/project-compat"
import type { NarrativeStateV1 } from "../lib/narrative-state/types"

function mergeNarrativeInput(current: NarrativeStateV1, input: Partial<NarrativeStateV1>): Partial<NarrativeStateV1> {
  return {
    ...current,
    ...input,
    id: current.id,
    version: 1,
    audience: {
      ...current.audience,
      ...(input.audience ?? {}),
    },
    decision: {
      ...current.decision,
      ...(input.decision ?? {}),
    },
    thesis: input.thesis ? { ...current.thesis, ...input.thesis } as NarrativeStateV1["thesis"] : current.thesis,
    claims: input.claims ?? current.claims,
    claimRelations: input.claimRelations ?? current.claimRelations,
    evidenceBindings: input.evidenceBindings ?? current.evidenceBindings,
    objections: input.objections ?? current.objections,
    risks: input.risks ?? current.risks,
    researchGaps: input.researchGaps ?? current.researchGaps,
    approvals: current.approvals,
    updatedAt: new Date().toISOString(),
  }
}

export default tool({
  description:
    `Read and update ${DECKS_STATE_FILE}, Revela's workspace deck state file. ` +
    "Use this tool instead of writing or patching the state file directly. " +
    "It stores workspace narrative state, active deck specs, per-slide content/layout/components, and computes narrative or deck readiness.",
  args: {
    action: tool.schema
      .enum(["read", "init", "upsertDeck", "upsertSlides", "upsertNarrative", "compileDeckPlan", "confirmDeckPlan", "backfillClaimRefs", "review", "reviewNarrative", "approveNarrative", "deriveResearchGaps", "upsertResearchGaps", "updateResearchGap", "closeResearchGap", "applyEvidenceCandidates", "attachResearchFindings", "remember"])
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
    narrative: tool.schema.object({
      status: tool.schema.enum(["draft", "needs_research", "needs_user_confirmation", "ready_for_approval", "approved"]).optional(),
      audience: tool.schema.object({
        primary: tool.schema.string().optional(),
        secondary: tool.schema.array(tool.schema.string()).optional(),
        beliefBefore: tool.schema.string().optional(),
        beliefAfter: tool.schema.string().optional(),
        decisionContext: tool.schema.string().optional(),
        successCriteria: tool.schema.array(tool.schema.string()).optional(),
      }).optional(),
      decision: tool.schema.object({
        action: tool.schema.string().optional(),
        owner: tool.schema.string().optional(),
        deadline: tool.schema.string().optional(),
        decisionType: tool.schema.enum(["approve", "invest", "prioritize", "align", "choose", "understand", "other"]).optional(),
        consequenceOfNoDecision: tool.schema.string().optional(),
      }).optional(),
      thesis: tool.schema.object({
        id: tool.schema.string().optional(),
        statement: tool.schema.string().optional(),
        confidence: tool.schema.enum(["high", "medium", "low"]).optional(),
        caveat: tool.schema.string().optional(),
      }).optional(),
      claims: tool.schema.array(tool.schema.object({
        id: tool.schema.string().optional(),
        kind: tool.schema.enum(["context", "problem", "opportunity", "evidence", "recommendation", "risk", "assumption", "ask"]).optional(),
        text: tool.schema.string().describe("Claim text."),
        importance: tool.schema.enum(["central", "supporting", "background"]).optional(),
        evidenceRequired: tool.schema.boolean().optional(),
        evidenceStatus: tool.schema.enum(["supported", "partial", "weak", "missing", "not_required"]).optional(),
        supportedScope: tool.schema.string().optional(),
        unsupportedScope: tool.schema.string().optional(),
        caveats: tool.schema.array(tool.schema.string()).optional(),
      })).optional(),
      claimRelations: tool.schema.array(tool.schema.object({
        id: tool.schema.string().optional(),
        fromClaimId: tool.schema.string().describe("Canonical claim id the relation starts from."),
        toClaimId: tool.schema.string().describe("Canonical claim id the relation points to."),
        relation: tool.schema.enum(["leads_to", "supports", "depends_on", "contrasts_with", "constrains", "answers"]).optional(),
        rationale: tool.schema.string().optional().describe("Short explanation of why this narrative relation exists."),
      })).optional().describe("Canonical claim-to-claim narrative progression relationships. These affect narrative approval hash."),
      evidenceBindings: tool.schema.array(tool.schema.object({
        id: tool.schema.string().optional(),
        claimId: tool.schema.string().describe("Canonical claim id this evidence supports."),
        source: tool.schema.string().describe("Source file, URL, research finding, or material name."),
        sourcePath: tool.schema.string().optional(),
        findingsFile: tool.schema.string().optional(),
        quote: tool.schema.string().optional(),
        location: tool.schema.string().optional(),
        url: tool.schema.string().optional(),
        caveat: tool.schema.string().optional(),
        supportScope: tool.schema.string().optional(),
        unsupportedScope: tool.schema.string().optional(),
        strength: tool.schema.enum(["strong", "partial", "weak"]).optional(),
      })).optional(),
      objections: tool.schema.array(tool.schema.object({
        id: tool.schema.string().optional(),
        text: tool.schema.string().describe("Objection text."),
        claimId: tool.schema.string().optional(),
        priority: tool.schema.enum(["high", "medium", "low"]).optional(),
        response: tool.schema.string().optional(),
      })).optional(),
      risks: tool.schema.array(tool.schema.object({
        id: tool.schema.string().optional(),
        text: tool.schema.string().describe("Risk, assumption, caveat, or tradeoff text."),
        claimId: tool.schema.string().optional(),
        severity: tool.schema.enum(["high", "medium", "low"]).optional(),
        mitigation: tool.schema.string().optional(),
      })).optional(),
      researchGaps: tool.schema.array(tool.schema.object({
        id: tool.schema.string().optional(),
        targetType: tool.schema.enum(["claim", "objection", "risk", "decision", "narrative"]).optional(),
        targetId: tool.schema.string().optional(),
        question: tool.schema.string().describe("Research question or gap to resolve."),
        status: tool.schema.enum(["open", "in_progress", "findings_saved", "attached", "evidence_bound", "closed"]).optional(),
        priority: tool.schema.enum(["high", "medium", "low"]).optional(),
        findingsFile: tool.schema.string().optional(),
        evidenceBindingIds: tool.schema.array(tool.schema.string()).optional(),
        createdFromIssueType: tool.schema.string().optional(),
        notes: tool.schema.string().optional(),
      })).optional(),
    }).optional().describe("For upsertNarrative: canonical narrative state fields to merge into DECKS.json. Replaces provided arrays, preserves approvals."),
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
      claimIds: tool.schema.array(tool.schema.string()).optional().describe("Canonical narrative claim ids directly expressed by this slide."),
      claimRefs: tool.schema.array(tool.schema.object({
        claimId: tool.schema.string().describe("Canonical narrative claim id referenced by this slide."),
        role: tool.schema.enum(["primary", "supporting", "evidence", "risk", "objection"]).describe("How the slide uses this claim."),
        note: tool.schema.string().optional().describe("Optional short rationale for this claim-slide relationship."),
      })).optional().describe("Structured canonical claim references for this slide; preferred over flat claimIds when available."),
      evidenceBindingIds: tool.schema.array(tool.schema.string()).optional().describe("Canonical narrative evidence binding ids used by this slide."),
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
    approvalNote: tool.schema.string().optional().describe("For approveNarrative or confirmDeckPlan: optional note explaining the approval, override, or deck plan confirmation."),
    approvalBy: tool.schema.enum(["user", "override"]).optional().describe("For approveNarrative or confirmDeckPlan: use override only for explicit render overrides, not normal strategic approval or deck plan confirmation."),
    approvalScope: tool.schema.enum(["narrative", "render_override"]).optional().describe("For approveNarrative: narrative approval or explicit render override scope."),
    gapId: tool.schema.string().optional().describe("For updateResearchGap/closeResearchGap: canonical research gap id."),
    researchGaps: tool.schema.array(tool.schema.object({
      id: tool.schema.string().optional(),
      targetType: tool.schema.enum(["claim", "objection", "risk", "decision", "narrative"]).optional(),
      targetId: tool.schema.string().optional(),
      question: tool.schema.string().describe("Research question or gap to resolve."),
      status: tool.schema.enum(["open", "in_progress", "findings_saved", "attached", "evidence_bound", "closed"]).optional(),
      priority: tool.schema.enum(["high", "medium", "low"]).optional(),
      findingsFile: tool.schema.string().optional(),
      evidenceBindingIds: tool.schema.array(tool.schema.string()).optional(),
      createdFromIssueType: tool.schema.string().optional(),
      notes: tool.schema.string().optional(),
    })).optional().describe("For upsertResearchGaps: explicit canonical research gaps to create or update."),
    gapStatus: tool.schema.enum(["open", "in_progress", "findings_saved", "attached", "evidence_bound", "closed"]).optional().describe("For updateResearchGap: lifecycle status."),
    gapNotes: tool.schema.string().optional().describe("For updateResearchGap/closeResearchGap: notes or close reason."),
    evidenceBindingIds: tool.schema.array(tool.schema.string()).optional().describe("For updateResearchGap: canonical narrative evidence binding ids associated with the gap."),
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

      if (args.action === "upsertNarrative") {
        if (!args.narrative) return JSON.stringify({ ok: false, error: "narrative is required for upsertNarrative" })
        const current = state.narrative ?? normalizeNarrativeState(state)
        const merged = mergeNarrativeInput(current, args.narrative as Partial<NarrativeStateV1>)
        const normalized = normalizeCanonicalNarrativeState(merged, state.activeDeck ?? defaultSlug)
        if (!normalized) return JSON.stringify({ ok: false, error: "narrative could not be normalized" })
        state.narrative = normalized

        const deckKey = state.activeDeck
        if (deckKey && state.decks[deckKey]) {
          state = upsertDeck(state, {
            ...state.decks[deckKey],
            slug: deckKey,
            audience: normalized.audience.primary || state.decks[deckKey].audience,
            narrativeBrief: narrativeToBrief(normalized),
          })
        }

        recordWorkspaceAction(state, {
          type: "narrative.upserted",
          actor: "revela-decks",
          inputs: { hadExistingNarrative: Boolean(current), providedFields: Object.keys(args.narrative as object) },
          outputs: {
            narrativeId: normalized.id,
            status: normalized.status,
            claimCount: normalized.claims.length,
            evidenceBindingCount: normalized.evidenceBindings.length,
            objectionCount: normalized.objections.length,
            riskCount: normalized.risks.length,
          },
          status: "success",
          summary: `Updated canonical narrative state with ${normalized.claims.length} claim${normalized.claims.length === 1 ? "" : "s"}.`,
          nodeIds: [normalized.id],
        })

        writeDecksState(workspaceRoot, state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, narrative: state.narrative, deck: state.activeDeck ? state.decks[state.activeDeck] : undefined }, null, 2)
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

      if (args.action === "compileDeckPlan") {
        const compiled = compileDeckPlanFromNarrative(state)
        if (compiled.result.compiled) {
          recordWorkspaceAction(compiled.state, {
            type: "deck.plan_compiled",
            actor: "revela-decks",
            inputs: { narrativeId: compiled.state.narrative?.id, activeDeck: compiled.state.activeDeck },
            outputs: {
              narrativeHash: compiled.result.narrativeHash,
              slideCount: compiled.result.slideCount,
              outputPath: compiled.state.activeDeck ? compiled.state.decks[compiled.state.activeDeck]?.outputPath : undefined,
            },
            status: "success",
            summary: `Compiled deck plan from canonical narrative with ${compiled.result.slideCount} slide${compiled.result.slideCount === 1 ? "" : "s"}.`,
            nodeIds: [compiled.state.narrative?.id, compiled.state.activeDeck ? `artifact:${compiled.state.decks[compiled.state.activeDeck]?.outputPath ?? compiled.state.activeDeck}` : undefined].filter((item): item is string => Boolean(item)),
          })
        }
        writeDecksState(workspaceRoot, compiled.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: compiled.result, deck: compiled.state.activeDeck ? compiled.state.decks[compiled.state.activeDeck] : undefined, narrative: compiled.state.narrative }, null, 2)
      }

      if (args.action === "confirmDeckPlan") {
        if (args.approvalBy && args.approvalBy !== "user") return JSON.stringify({ ok: false, error: "confirmDeckPlan requires approvalBy=user" })
        const confirmed = confirmDeckPlan(state, {
          approvedBy: "user",
          note: args.approvalNote,
        })
        if (confirmed.result.confirmed) {
          recordWorkspaceAction(confirmed.state, {
            type: "deck.plan_confirmed",
            actor: "revela-decks",
            inputs: { activeDeck: state.activeDeck, approvalBy: "user" },
            outputs: {
              slug: confirmed.result.slug,
              narrativeHash: confirmed.result.narrativeHash,
              planHash: confirmed.result.planHash,
            },
            status: "success",
            summary: args.approvalNote?.trim() || "User confirmed the compiled deck plan.",
            nodeIds: [confirmed.state.narrative?.id, confirmed.result.slug ? `deck:${confirmed.result.slug}` : undefined].filter((item): item is string => Boolean(item)),
          })
        }
        writeDecksState(workspaceRoot, confirmed.state)
        return JSON.stringify({ ok: confirmed.result.confirmed, path: DECKS_STATE_FILE, result: confirmed.result, deck: confirmed.state.activeDeck ? confirmed.state.decks[confirmed.state.activeDeck] : undefined }, null, 2)
      }

      if (args.action === "backfillClaimRefs") {
        const backfilled = backfillSlideClaimRefsFromCoverage(state)
        writeDecksState(workspaceRoot, backfilled.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: backfilled.result, deck: backfilled.state.activeDeck ? backfilled.state.decks[backfilled.state.activeDeck] : undefined, narrative: backfilled.state.narrative }, null, 2)
      }

      if (args.action === "reviewNarrative") {
        const reviewed = reviewNarrativeState(state)
        recordNarrativeReviewAction(reviewed.state, reviewed.result)
        writeDecksState(workspaceRoot, reviewed.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: reviewed.result, narrative: reviewed.state.narrative }, null, 2)
      }

      if (args.action === "approveNarrative") {
        const approved = approveNarrativeState(state, {
          approvedBy: args.approvalBy,
          scope: args.approvalScope,
          note: args.approvalNote,
        })
        recordNarrativeApprovalAction(approved.state, approved.result)
        writeDecksState(workspaceRoot, approved.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: approved.result, narrative: approved.state.narrative }, null, 2)
      }

      if (args.action === "deriveResearchGaps") {
        const derived = deriveResearchGapsFromReadiness(state)
        writeDecksState(workspaceRoot, derived.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: derived.result, narrative: derived.state.narrative }, null, 2)
      }

      if (args.action === "upsertResearchGaps") {
        if (!args.researchGaps?.length) return JSON.stringify({ ok: false, error: "researchGaps are required for upsertResearchGaps" })
        const upserted = upsertResearchGapsInState(state, args.researchGaps as any[])
        writeDecksState(workspaceRoot, upserted.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: upserted.result, narrative: upserted.state.narrative }, null, 2)
      }

      if (args.action === "updateResearchGap") {
        if (!args.gapId?.trim()) return JSON.stringify({ ok: false, error: "gapId is required for updateResearchGap" })
        const updated = updateResearchGapInState(state, {
          id: args.gapId,
          status: args.gapStatus as any,
          findingsFile: args.findingsFile,
          evidenceBindingIds: args.evidenceBindingIds,
          notes: args.gapNotes,
        })
        writeDecksState(workspaceRoot, updated.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: updated.result, narrative: updated.state.narrative }, null, 2)
      }

      if (args.action === "closeResearchGap") {
        if (!args.gapId?.trim()) return JSON.stringify({ ok: false, error: "gapId is required for closeResearchGap" })
        const closed = closeResearchGapInState(state, args.gapId, args.gapNotes)
        writeDecksState(workspaceRoot, closed.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: closed.result, narrative: closed.state.narrative }, null, 2)
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
