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
  type DecksState,
  type NarrativeBrief,
  type RequiredInputs,
  type ResearchAxis,
  type SourceMaterial,
  type SlideSpec,
} from "../lib/decks-state"
import { classifySourceMaterialIngest, upsertSourceMaterial } from "../lib/source-materials"
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
import { validateDeckPlanApprovalFile, writeDeckPlanArtifact } from "../lib/narrative-state/deck-plan-artifact"
import { backfillSlideClaimRefsFromCoverage } from "../lib/narrative-state/coverage"
import { closeResearchGapInState, deriveResearchGapsFromReadiness, deriveResearchTargets, updateResearchGapInState, upsertResearchGapsInState } from "../lib/narrative-state/research-gaps"
import { evaluateResearchFindingsBinding } from "../lib/narrative-state/research-binding-eval"
import { stableEvidenceId } from "../lib/narrative-state/hash"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import { buildNarrativeVaultInventory, compileNarrativeVault, exportNarrativeStateToVault, formatVaultDiagnosticReport, getNarrativeVaultMigrationHint, hasNarrativeVault, initNarrativeVault, narrativeVaultAuthoringContract, narrativeVaultTimestampMs, removeVaultRelation, runNarrativeMarkdownQa, updateVaultCoreNodes, updateVaultResearchGapNode, upsertVaultClaimNode, upsertVaultEvidenceNode, upsertVaultObjectionNode, upsertVaultRelation, upsertVaultRiskNode, VAULT_MIGRATION_PRESERVED_IN_DECKS_JSON } from "../lib/narrative-vault"
import { compileCacheMirrorNarrativeVault } from "../lib/narrative-vault/compile-mirror"

function missingBindableEvidenceFields(input: Record<string, unknown>): string[] {
  const missing: string[] = []
  for (const key of ["id", "claimId", "source", "quote", "supportScope", "unsupportedScope", "caveat", "strength"] as const) {
    if (!String(input[key] ?? "").trim()) missing.push(key)
  }
  if (!String(input.sourcePath ?? "").trim() && !String(input.url ?? "").trim() && !String(input.findingsFile ?? "").trim()) missing.push("sourcePath|url|findingsFile")
  return missing
}

function exactResearchGapForBinding(state: DecksState, findingsFile: string, claimId: string) {
  const gaps = state.narrative?.researchGaps ?? []
  const exact = gaps.filter((gap) => gap.targetType === "claim" && gap.targetId === claimId && gap.findingsFile === findingsFile)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return undefined
  const byClaim = gaps.filter((gap) => gap.targetType === "claim" && gap.targetId === claimId && !gap.findingsFile)
  return byClaim.length === 1 ? byClaim[0] : undefined
}

function forbiddenVaultCompatibilityAction(action: string, replacement: string): string {
  return `${action} is a JSON-era compatibility action and is blocked in vault workspaces. Use ${replacement}, or patch the existing Markdown node only for a small read-before-edit repair.`
}

function researchGapHelperRecovery(action: "updateVaultResearchGap" | "upsertVaultResearchGap", missingFields?: string[]) {
  const missing = missingFields?.length ? ` Missing fields: ${missingFields.join(", ")}.` : ""
  return {
    nextActions: [
      "If the research gap already exists, read the matching revela-narrative/research-gaps/*.md file and patch only the lifecycle fields.",
      "If this is a new research gap, provide id, targetType, targetId, question, status, and priority, or create the Markdown node directly after checking narrativeInventory with a ## Relations depends_on wikilink.",
      "Rerun revela-decks markdownQa and compileNarrativeVault after the repair.",
    ],
    examples: {
      tool: {
        action,
        researchGaps: [{ id: "gap-market-size", targetType: "claim", targetId: "claim-market-context", question: "What source supports the market-size claim?", status: "open", priority: "high" }],
      },
      markdown: "---\ntype: research-gap\nid: gap-market-size\ntargetType: claim\ntargetId: claim-market-context\nquestion: What source supports the market-size claim?\nstatus: open\npriority: high\n---\nWhat source supports the market-size claim?\n\n## Relations\n\n- depends_on: [[claim-market-context]]\n",
    },
    message: `Research gap helper could not complete.${missing}`,
  }
}

function relationHelperRecovery(action: "upsertVaultRelation" | "removeVaultRelation", missingFields?: string[]) {
  const missing = missingFields?.length ? ` Missing fields: ${missingFields.join(", ")}.` : ""
  return {
    message: `Relation registry helper is disabled in Markdown vault workspaces.${missing}`,
    nextActions: [
      "Run narrativeInventory before adding or removing relation edges; reuse existing node ids exactly.",
      "Patch the source node's ## Relations section with a plain wikilink relation line; do not hand-write relation ids.",
      "Rerun markdownQa and compileNarrativeVault so compiler-generated relation ids and diagnostics refresh.",
    ],
    examples: {
      tool: { action, note: "Deprecated compatibility action; edit Markdown instead." },
      markdown: "## Relations\n\n- supports: [[claim-execution-readiness]] - Pilot recommendation is supported by execution framing.\n",
    },
  }
}

function strictVaultMarkdownQaGate(workspaceRoot: string, strictness: "readiness" | "render", action: string) {
  if (!hasNarrativeVault(workspaceRoot)) return undefined
  const markdownQa = runNarrativeMarkdownQa(workspaceRoot, { scope: "full", strictness })
  if (markdownQa.ok) return undefined
  return {
    ok: false,
    skipped: true,
    action,
    reason: `Markdown QA ${strictness} blockers must be repaired before ${action}.`,
    markdownQa,
    narrativeInventory: buildNarrativeVaultInventory(workspaceRoot),
    authoringContract: narrativeVaultAuthoringContract(),
  }
}

export default tool({
  description:
    `Read and update ${DECKS_STATE_FILE}, Revela's workspace deck state file. ` +
    "Use this tool instead of writing or patching the state file directly. " +
    "It stores workspace narrative state, active deck specs, per-slide content/layout/components, and computes narrative or deck readiness.",
  args: {
    action: tool.schema
      .enum(["read", "init", "initNarrativeVault", "narrativeInventory", "vaultInventory", "markdownQa", "upsertDeck", "upsertSlides", "upsertNarrative", "compileNarrativeVault", "exportNarrativeVault", "upsertVaultEvidence", "bindResearchFindings", "updateVaultResearchGap", "upsertVaultResearchGap", "upsertVaultClaim", "upsertVaultObjection", "upsertVaultRisk", "upsertVaultRelation", "removeVaultRelation", "updateVaultCoreNarrative", "compileDeckPlan", "confirmDeckPlan", "backfillClaimRefs", "review", "reviewNarrative", "approveNarrative", "deriveResearchGaps", "deriveResearchTargets", "evaluateResearchFindings", "upsertResearchGaps", "updateResearchGap", "closeResearchGap", "applyEvidenceCandidates", "attachResearchFindings", "remember"])
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
        claimId: tool.schema.string().describe("Compatibility fallback claim id this evidence supports; helpers also write a ## Relations supports wikilink."),
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
    }).optional().describe("For initNarrativeVault and targeted vault actions: canonical narrative fields to write into Markdown nodes. upsertNarrative is deprecated."),
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
    evidence: tool.schema.object({
      id: tool.schema.string().describe("For upsertVaultEvidence or bindResearchFindings: canonical evidence binding id."),
      claimId: tool.schema.string().describe("For upsertVaultEvidence: canonical claim id this evidence supports."),
      source: tool.schema.string().describe("For upsertVaultEvidence: source name, file, URL, or research finding label."),
      sourcePath: tool.schema.string().optional(),
      findingsFile: tool.schema.string().optional(),
      quote: tool.schema.string().describe("For upsertVaultEvidence: exact quote or snippet supporting the claim."),
      location: tool.schema.string().optional(),
      url: tool.schema.string().optional(),
      caveat: tool.schema.string().describe("For upsertVaultEvidence: evidence limitation that must travel with the claim."),
      supportScope: tool.schema.string().describe("For upsertVaultEvidence: scope explicitly supported by the evidence."),
      unsupportedScope: tool.schema.string().describe("For upsertVaultEvidence: scope not supported by the evidence."),
      strength: tool.schema.enum(["strong", "partial", "weak"]).describe("For upsertVaultEvidence: support strength."),
    }).optional().describe("For upsertVaultEvidence: canonical evidence node to write under revela-narrative/evidence/*.md. For bindResearchFindings, only id is used as an optional override."),
    relation: tool.schema.object({
      id: tool.schema.string().describe("For upsertVaultRelation/removeVaultRelation: stable relation edge id."),
      from: tool.schema.string().optional().describe("For upsertVaultRelation: source node id, e.g. claim:pilot or evidence:pilot."),
      to: tool.schema.string().optional().describe("For upsertVaultRelation: target node id, e.g. claim:execution."),
      type: tool.schema.enum(["leads_to", "supports", "depends_on", "contrasts_with", "constrains", "answers"]).optional().describe("For upsertVaultRelation: canonical relation type."),
      rationale: tool.schema.string().optional().describe("Optional relation rationale. Do not invent; only preserve explicit semantic rationale."),
    }).optional().describe("For deprecated upsertVaultRelation/removeVaultRelation compatibility actions. Inline ## Relations in node Markdown are canonical."),
    relationId: tool.schema.string().optional().describe("For deprecated removeVaultRelation compatibility action."),
    findingsFile: tool.schema.string().optional().describe("For attachResearchFindings, evaluateResearchFindings, or bindResearchFindings: workspace-relative researches/{topic}/{axis}.md findings file."),
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
    })).optional().describe("For upsertVaultResearchGap or legacy upsertResearchGaps: explicit canonical research gaps to create or update."),
    gapStatus: tool.schema.enum(["open", "in_progress", "findings_saved", "attached", "evidence_bound", "closed"]).optional().describe("For updateResearchGap: lifecycle status."),
    gapNotes: tool.schema.string().optional().describe("For updateResearchGap/closeResearchGap: notes or close reason."),
    evidenceBindingIds: tool.schema.array(tool.schema.string()).optional().describe("For updateResearchGap: canonical narrative evidence binding ids associated with the gap."),
    markdownQaScope: tool.schema.enum(["touched", "affected", "full"]).optional().describe("For markdownQa: relation sync scope. Hook usage should stay touched; manual checks usually use full."),
    markdownQaStrictness: tool.schema.enum(["authoring", "readiness", "render"]).optional().describe("For markdownQa: relation sync strictness. Render/readiness can upgrade relation sync gaps to blockers."),
  },
  async execute(args, context) {
    try {
      const workspaceRoot = context.directory ?? process.cwd()
      let state = normalizeWorkspaceDeckState(readOrCreateDecksState(workspaceRoot), workspaceRoot)
      const defaultSlug = workspaceDeckSlug(workspaceRoot)

      if (args.action === "init") {
        const discovered: SourceMaterial[] = []
        const ingest = classifySourceMaterialIngest(state, (args.sourceMaterials ?? []) as SourceMaterial[], workspaceRoot, narrativeVaultTimestampMs(workspaceRoot))
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
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, ingest, state }, null, 2)
      }

      if (args.action === "read") {
        const deckKey = state.activeDeck
        if (args.summary) {
          const deck = deckKey ? state.decks[deckKey] : undefined
          const vaultDiagnostics = hasNarrativeVault(workspaceRoot)
            ? formatVaultDiagnosticReport(compileNarrativeVault(workspaceRoot, { fallbackApprovals: state.narrative?.approvals ?? [] }).diagnostics)
            : undefined
          const migration = getNarrativeVaultMigrationHint(workspaceRoot, state)
          const authoringContract = hasNarrativeVault(workspaceRoot) || migration.available ? narrativeVaultAuthoringContract() : undefined
          const narrativeInventory = hasNarrativeVault(workspaceRoot) ? buildNarrativeVaultInventory(workspaceRoot) : undefined
          const markdownQa = hasNarrativeVault(workspaceRoot) ? runNarrativeMarkdownQa(workspaceRoot) : undefined
          return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, activeDeck: state.activeDeck, deck, vaultDiagnostics, markdownQa, migration, authoringContract, narrativeInventory }, null, 2)
        }
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, state }, null, 2)
      }

      if (args.action === "narrativeInventory" || args.action === "vaultInventory") {
        if (!hasNarrativeVault(workspaceRoot)) {
          const migration = getNarrativeVaultMigrationHint(workspaceRoot, state)
          return JSON.stringify({ ok: false, path: "revela-narrative", error: "narrativeInventory requires revela-narrative/ to exist. Use initNarrativeVault or exportNarrativeVault first.", migration, authoringContract: migration.available ? narrativeVaultAuthoringContract() : undefined }, null, 2)
        }
        const inventory = buildNarrativeVaultInventory(workspaceRoot)
        return JSON.stringify({ ok: inventory.ok, path: inventory.path, narrativeInventory: inventory, authoringContract: narrativeVaultAuthoringContract() }, null, 2)
      }

      if (args.action === "markdownQa") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, path: "revela-narrative", error: "markdownQa requires revela-narrative/ to exist. Use initNarrativeVault or exportNarrativeVault first." }, null, 2)
        const markdownQa = runNarrativeMarkdownQa(workspaceRoot, { scope: args.markdownQaScope ?? "full", strictness: args.markdownQaStrictness ?? "authoring" })
        return JSON.stringify({ ok: markdownQa.ok, path: "revela-narrative", markdownQa, narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract() }, null, 2)
      }

      if (args.action === "compileNarrativeVault") {
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        const { result, diagnosticReport } = compiled
        const markdownQa = hasNarrativeVault(workspaceRoot) ? runNarrativeMarkdownQa(workspaceRoot) : undefined
        const narrativeInventory = hasNarrativeVault(workspaceRoot) ? buildNarrativeVaultInventory(workspaceRoot) : undefined
        return JSON.stringify({ ok: result.ok, path: DECKS_STATE_FILE, result, diagnosticReport, markdownQa, narrativeInventory }, null, 2)
      }

      if (args.action === "exportNarrativeVault") {
        if (hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "revela-narrative/ already exists. Edit Markdown nodes directly or move the existing vault before exporting." })
        const narrative = state.narrative ?? normalizeNarrativeState(state)
        const result = exportNarrativeStateToVault(workspaceRoot, narrative)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state, fallbackApprovals: narrative.approvals })
        return JSON.stringify({
          ok: compiled.result.ok,
          path: "revela-narrative",
          result,
          files: result.files,
          diagnostics: compiled.result.diagnostics,
          diagnosticReport: compiled.diagnosticReport,
          migrationNote: "Exported canonical narrative nodes to revela-narrative/. Approvals, render targets, reviews, artifact coverage, actions, deck specs, and source material records remain in DECKS.json.",
          preservedInDecksJson: VAULT_MIGRATION_PRESERVED_IN_DECKS_JSON,
          nextActions: [
            "Review diagnosticReport for any source trace, evidence, relation, or approval warnings.",
            "Edit narrative meaning through targeted vault actions or Markdown nodes, then run compileNarrativeVault.",
            "Keep approvals, render targets, reviews, artifact coverage, actions, deck specs, and source material records in DECKS.json.",
          ],
        }, null, 2)
      }

      if (args.action === "initNarrativeVault") {
        if (hasNarrativeVault(workspaceRoot)) {
          const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
          return JSON.stringify({ ok: true, path: "revela-narrative", created: false, files: [], diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract(), nextActions: ["Inspect narrativeInventory before authoring; reuse existing ids and relation targets.", "Maintain Markdown nodes directly when useful, then run compileNarrativeVault. Use structured vault helpers only when they reduce schema risk."], narrative: compiled.result.narrative }, null, 2)
        }
        const result = initNarrativeVault(workspaceRoot, {
          id: `narrative:${defaultSlug}`,
          status: args.narrative?.status as any ?? "draft",
          audience: args.narrative?.audience as any,
          decision: args.narrative?.decision as any,
          thesis: args.narrative?.thesis as any,
        })
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: result.path, created: result.created, files: result.files, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract(), nextActions: ["Inspect narrativeInventory before adding claims, evidence, relations, or research gaps; reuse existing ids where possible.", "Maintain Markdown nodes directly when useful. Use structured vault helpers for evidence binding or when they reduce schema risk.", "Treat workspace source material records as candidates until explicit evidence trace is written."], narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "upsertVaultEvidence") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "upsertVaultEvidence requires revela-narrative/ to exist. Use initNarrativeVault first, then write explicit evidence source trace." })
        if (!args.evidence) return JSON.stringify({ ok: false, error: "evidence is required for upsertVaultEvidence" })
        const mutation = upsertVaultEvidenceNode(workspaceRoot, args.evidence as any)
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation }, null, 2)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutation.file, mutation, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "bindResearchFindings") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "bindResearchFindings requires revela-narrative/ to exist. Use initNarrativeVault first, then evaluateResearchFindings." })
        if (!args.findingsFile?.trim()) return JSON.stringify({ ok: false, error: "findingsFile is required for bindResearchFindings" })
        const bindingEval = evaluateResearchFindingsBinding(state, workspaceRoot, args.findingsFile)
        if (bindingEval.status !== "bindable" || !bindingEval.claimId || !bindingEval.recommendedEvidenceDraft) {
          return JSON.stringify({ ok: false, skipped: true, reason: "findings are not safely bindable", bindingEval }, null, 2)
        }
        const draft = bindingEval.recommendedEvidenceDraft
        const evidence = {
          id: args.evidence?.id?.trim() || stableEvidenceId(bindingEval.claimId, `${bindingEval.findingsFile}:${draft.quote ?? ""}`),
          claimId: bindingEval.claimId,
          source: draft.source,
          sourcePath: draft.sourcePath,
          findingsFile: draft.findingsFile ?? bindingEval.findingsFile,
          quote: draft.quote,
          location: draft.location,
          url: draft.url,
          caveat: draft.caveat,
          supportScope: draft.supportScope,
          unsupportedScope: draft.unsupportedScope,
          strength: draft.strength,
        }
        const missing = missingBindableEvidenceFields(evidence)
        if (missing.length > 0) return JSON.stringify({ ok: false, skipped: true, reason: "recommended evidence draft is incomplete", missingFields: missing, bindingEval }, null, 2)

        const mutation = upsertVaultEvidenceNode(workspaceRoot, evidence as any)
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation, bindingEval }, null, 2)
        const gap = exactResearchGapForBinding(state, bindingEval.findingsFile, bindingEval.claimId)
        const gapMutation = gap
          ? updateVaultResearchGapNode(workspaceRoot, {
            id: gap.id,
            status: "evidence_bound",
            findingsFile: bindingEval.findingsFile,
            evidenceBindingIds: [...new Set([...(gap.evidenceBindingIds ?? []), evidence.id])],
            notes: gap.notes,
          })
          : undefined
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({
          ok: compiled.result.ok,
          path: mutation.file,
          bindingEval,
          mutation,
          gapMutation: gapMutation ?? { ok: true, skipped: true, reason: "no exact single research gap matched this findings file and claim" },
          evidence,
          diagnostics: compiled.result.diagnostics,
          diagnosticReport: compiled.diagnosticReport,
          narrative: compiled.result.narrative,
        }, null, 2)
      }

      if (args.action === "updateVaultResearchGap") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "updateVaultResearchGap requires revela-narrative/ to exist. Use updateResearchGap only in compatibility JSON workspaces." })
        if (!args.gapId?.trim()) return JSON.stringify({ ok: false, error: "gapId is required for updateVaultResearchGap" })
        const mutation = updateVaultResearchGapNode(workspaceRoot, {
          ...(args.researchGaps?.[0] as any ?? {}),
          id: args.gapId,
          status: args.gapStatus as any,
          findingsFile: args.findingsFile,
          evidenceBindingIds: args.evidenceBindingIds,
          notes: args.gapNotes,
        })
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation, recovery: researchGapHelperRecovery("updateVaultResearchGap", mutation.missingFields), narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract() }, null, 2)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutation.file, mutation, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "upsertVaultResearchGap") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "upsertVaultResearchGap requires revela-narrative/ to exist. Use initNarrativeVault first." })
        const gaps = args.researchGaps?.length ? (args.researchGaps as any[]) : [undefined]
        const mutations = []
        for (const gap of gaps) {
          const rawId = gap?.id ?? (gaps.length === 1 ? args.gapId : undefined)
          const id = typeof rawId === "string" ? rawId.trim() : ""
          if (!id) return JSON.stringify({ ok: false, error: "gapId or every researchGaps[].id is required for upsertVaultResearchGap", recovery: researchGapHelperRecovery("upsertVaultResearchGap"), narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract() }, null, 2)
          const mutation = updateVaultResearchGapNode(workspaceRoot, {
            ...gap,
            id,
            status: args.gapStatus as any ?? gap?.status,
            findingsFile: args.findingsFile ?? gap?.findingsFile,
            evidenceBindingIds: args.evidenceBindingIds ?? gap?.evidenceBindingIds,
            notes: args.gapNotes ?? gap?.notes,
          })
          if (!mutation.ok) return JSON.stringify({ ok: false, mutation, recovery: researchGapHelperRecovery("upsertVaultResearchGap", mutation.missingFields), narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract() }, null, 2)
          mutations.push(mutation)
        }
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutations[0]?.file, mutation: mutations[0], mutations, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, authoringContract: narrativeVaultAuthoringContract(), narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "upsertVaultRelation") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "upsertVaultRelation requires revela-narrative/ to exist. Use initNarrativeVault first." })
        const relation = args.relation as any
        if (!relation?.id) return JSON.stringify({ ok: false, error: "relation.id is required for upsertVaultRelation", recovery: relationHelperRecovery("upsertVaultRelation"), narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract() }, null, 2)
        const mutation = upsertVaultRelation(workspaceRoot, {
          id: relation.id,
          fromId: relation.from,
          toId: relation.to,
          relation: relation.type,
          rationale: relation.rationale,
        })
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation, recovery: relationHelperRecovery("upsertVaultRelation", mutation.missingFields), narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract() }, null, 2)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutation.file, mutation, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract(), narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "removeVaultRelation") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "removeVaultRelation requires revela-narrative/ to exist. Use initNarrativeVault first." })
        const relationId = args.relationId?.trim() || (args.relation as any)?.id?.trim()
        if (!relationId) return JSON.stringify({ ok: false, error: "relationId or relation.id is required for removeVaultRelation", recovery: relationHelperRecovery("removeVaultRelation"), narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract() }, null, 2)
        const mutation = removeVaultRelation(workspaceRoot, relationId)
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation, recovery: relationHelperRecovery("removeVaultRelation", mutation.missingFields), narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract() }, null, 2)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutation.file, mutation, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrativeInventory: buildNarrativeVaultInventory(workspaceRoot), authoringContract: narrativeVaultAuthoringContract(), narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "upsertVaultClaim") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "upsertVaultClaim requires revela-narrative/ to exist. Use initNarrativeVault first." })
        const claim = (args.narrative?.claims?.[0] as any) ?? undefined
        if (!claim?.id) return JSON.stringify({ ok: false, error: "narrative.claims[0].id is required for upsertVaultClaim" })
        const relationHint = args.narrative?.claimRelations?.length
          ? "upsertVaultClaim does not write graph edges. Add explicit ## Relations lines in the source node after checking narrativeInventory; compileNarrativeVault will generate relation ids."
          : undefined
        const mutation = upsertVaultClaimNode(workspaceRoot, claim)
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation }, null, 2)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutation.file, mutation, relationHint, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "upsertVaultObjection") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "upsertVaultObjection requires revela-narrative/ to exist. Use initNarrativeVault first." })
        const objection = (args.narrative?.objections?.[0] as any) ?? undefined
        if (!objection?.id) return JSON.stringify({ ok: false, error: "narrative.objections[0].id is required for upsertVaultObjection" })
        const mutation = upsertVaultObjectionNode(workspaceRoot, objection)
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation }, null, 2)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutation.file, mutation, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "upsertVaultRisk") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "upsertVaultRisk requires revela-narrative/ to exist. Use initNarrativeVault first." })
        const risk = (args.narrative?.risks?.[0] as any) ?? undefined
        if (!risk?.id) return JSON.stringify({ ok: false, error: "narrative.risks[0].id is required for upsertVaultRisk" })
        const mutation = upsertVaultRiskNode(workspaceRoot, risk)
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation }, null, 2)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutation.file, mutation, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrative: compiled.result.narrative }, null, 2)
      }

      if (args.action === "updateVaultCoreNarrative") {
        if (!hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: "updateVaultCoreNarrative requires revela-narrative/ to exist. Use initNarrativeVault first." })
        const mutation = updateVaultCoreNodes(workspaceRoot, args.narrative as any ?? {})
        if (!mutation.ok) return JSON.stringify({ ok: false, mutation }, null, 2)
        const compiled = compileCacheMirrorNarrativeVault(workspaceRoot, { state })
        return JSON.stringify({ ok: compiled.result.ok, path: mutation.file, mutation, diagnostics: compiled.result.diagnostics, diagnosticReport: compiled.diagnosticReport, narrative: compiled.result.narrative }, null, 2)
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
        return JSON.stringify({ ok: false, deprecated: true, error: "upsertNarrative is deprecated. Use initNarrativeVault to create revela-narrative/, then update canonical narrative meaning through structured vault actions such as updateVaultCoreNarrative, upsertVaultClaim, upsertVaultEvidence, upsertVaultObjection, upsertVaultRisk, upsertVaultResearchGap, updateVaultResearchGap, or bindResearchFindings.", authoringContract: narrativeVaultAuthoringContract() })
      }

      if (args.action === "review") {
        const qaGate = strictVaultMarkdownQaGate(workspaceRoot, "render", "review")
        if (qaGate) return JSON.stringify(qaGate, null, 2)
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
        const qaGate = strictVaultMarkdownQaGate(workspaceRoot, "render", "compileDeckPlan")
        if (qaGate) return JSON.stringify(qaGate, null, 2)
        const compiled = compileDeckPlanFromNarrative(state)
        let planArtifact: { path: string; absolutePath: string } | undefined
        if (compiled.result.compiled && compiled.state.activeDeck && compiled.result.planHash) {
          planArtifact = writeDeckPlanArtifact(workspaceRoot, {
            deck: compiled.state.decks[compiled.state.activeDeck],
            narrativeHash: compiled.result.narrativeHash,
            planHash: compiled.result.planHash,
            chapters: compiled.result.chapters ?? [],
            qualityChecks: compiled.result.qualityChecks ?? [],
            compiledAt: new Date().toISOString(),
          })
          compiled.result.planArtifactPath = planArtifact.path
        }
        if (compiled.result.compiled) {
          recordWorkspaceAction(compiled.state, {
            type: "deck.plan_compiled",
            actor: "revela-decks",
            inputs: { narrativeId: compiled.state.narrative?.id, activeDeck: compiled.state.activeDeck },
            outputs: {
              narrativeHash: compiled.result.narrativeHash,
              planHash: compiled.result.planHash,
              planArtifactPath: planArtifact?.path,
              slideCount: compiled.result.slideCount,
              outputPath: compiled.state.activeDeck ? compiled.state.decks[compiled.state.activeDeck]?.outputPath : undefined,
            },
            status: "success",
            summary: `Compiled deck plan from canonical narrative with ${compiled.result.slideCount} slide${compiled.result.slideCount === 1 ? "" : "s"}.`,
            nodeIds: [compiled.state.narrative?.id, compiled.state.activeDeck ? `artifact:${compiled.state.decks[compiled.state.activeDeck]?.outputPath ?? compiled.state.activeDeck}` : undefined].filter((item): item is string => Boolean(item)),
          })
        }
        writeDecksState(workspaceRoot, compiled.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, planArtifact, result: compiled.result, deck: compiled.state.activeDeck ? compiled.state.decks[compiled.state.activeDeck] : undefined, narrative: compiled.state.narrative }, null, 2)
      }

      if (args.action === "confirmDeckPlan") {
        if (args.approvalBy && args.approvalBy !== "user") return JSON.stringify({ ok: false, error: "confirmDeckPlan requires approvalBy=user" })
        const deck = state.activeDeck ? state.decks[state.activeDeck] : undefined
        const pending = deck?.planReview
        if (!deck || !pending) return JSON.stringify({ ok: false, result: { confirmed: false, skipped: true, reason: "Cannot confirm because no compiled deck plan is pending. Run compileDeckPlan first." } }, null, 2)
        const approval = validateDeckPlanApprovalFile(workspaceRoot, { narrativeHash: pending.narrativeHash, planHash: pending.planHash })
        if (!approval.ok) return JSON.stringify({ ok: false, result: { confirmed: false, skipped: true, slug: deck.slug, narrativeHash: pending.narrativeHash, planHash: pending.planHash, reason: approval.reason }, approval: approval.approval }, null, 2)
        const confirmed = confirmDeckPlan(state, {
          approvedBy: "user",
          approvedAt: approval.approval?.approvedAt,
          note: args.approvalNote ?? approval.approval?.approvalNote,
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
        const qaGate = strictVaultMarkdownQaGate(workspaceRoot, "readiness", "reviewNarrative")
        if (qaGate) return JSON.stringify(qaGate, null, 2)
        const reviewed = reviewNarrativeState(state)
        recordNarrativeReviewAction(reviewed.state, reviewed.result)
        writeDecksState(workspaceRoot, reviewed.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: reviewed.result, narrative: reviewed.state.narrative }, null, 2)
      }

      if (args.action === "approveNarrative") {
        const qaGate = strictVaultMarkdownQaGate(workspaceRoot, "readiness", "approveNarrative")
        if (qaGate) return JSON.stringify(qaGate, null, 2)
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
        if (hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: forbiddenVaultCompatibilityAction("deriveResearchGaps", "deriveResearchTargets for read-only target selection, then upsertVaultResearchGap for canonical gap nodes"), authoringContract: narrativeVaultAuthoringContract() })
        const derived = deriveResearchGapsFromReadiness(state)
        writeDecksState(workspaceRoot, derived.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: derived.result, narrative: derived.state.narrative }, null, 2)
      }

      if (args.action === "deriveResearchTargets") {
        const result = deriveResearchTargets(state, { workspaceRoot })
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result }, null, 2)
      }

      if (args.action === "evaluateResearchFindings") {
        if (!args.findingsFile?.trim()) return JSON.stringify({ ok: false, error: "findingsFile is required for evaluateResearchFindings" })
        const bindingEval = evaluateResearchFindingsBinding(state, workspaceRoot, args.findingsFile)
        const targets = deriveResearchTargets(state, { workspaceRoot })
        const vaultDiagnostics = hasNarrativeVault(workspaceRoot)
          ? formatVaultDiagnosticReport(compileNarrativeVault(workspaceRoot, { fallbackApprovals: state.narrative?.approvals ?? [] }).diagnostics)
          : undefined
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: { bindingEval, selected: targets.selected, vaultDiagnostics } }, null, 2)
      }

      if (args.action === "upsertResearchGaps") {
        if (hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: forbiddenVaultCompatibilityAction("upsertResearchGaps", "upsertVaultResearchGap for new or updated research gap nodes"), authoringContract: narrativeVaultAuthoringContract() })
        if (!args.researchGaps?.length) return JSON.stringify({ ok: false, error: "researchGaps are required for upsertResearchGaps" })
        const upserted = upsertResearchGapsInState(state, args.researchGaps as any[])
        writeDecksState(workspaceRoot, upserted.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: upserted.result, narrative: upserted.state.narrative }, null, 2)
      }

      if (args.action === "updateResearchGap") {
        if (hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: forbiddenVaultCompatibilityAction("updateResearchGap", "updateVaultResearchGap or upsertVaultResearchGap"), authoringContract: narrativeVaultAuthoringContract() })
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
        if (hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: forbiddenVaultCompatibilityAction("closeResearchGap", "updateVaultResearchGap with gapStatus=closed"), authoringContract: narrativeVaultAuthoringContract() })
        if (!args.gapId?.trim()) return JSON.stringify({ ok: false, error: "gapId is required for closeResearchGap" })
        const closed = closeResearchGapInState(state, args.gapId, args.gapNotes)
        writeDecksState(workspaceRoot, closed.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: closed.result, narrative: closed.state.narrative }, null, 2)
      }

      if (args.action === "applyEvidenceCandidates") {
        if (hasNarrativeVault(workspaceRoot)) return JSON.stringify({ ok: false, error: forbiddenVaultCompatibilityAction("applyEvidenceCandidates", "bindResearchFindings for bindable findings or upsertVaultEvidence for explicit evidence source trace"), authoringContract: narrativeVaultAuthoringContract() })
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
