import { tool } from "@opencode-ai/plugin"
import { hasDecksState, readDecksState } from "../lib/decks-state"
import { buildNarrativeMap } from "../lib/narrative-state/map"
import { validateNarrativeDisplayModel, type NarrativeDisplayModel, type NarrativeViewLanguage } from "../lib/narrative-state/display"
import { writeNarrativeMapHtml } from "../lib/commands/narrative"
import { openUrl } from "../lib/edit/open"

export default tool({
  description:
    "Render Revela's read-only narrative claim-flow UI from the current deterministic narrative map plus an optional localized display model. " +
    "This tool validates display IDs against DECKS.json, opens a local HTML view, and never mutates workspace state.",
  args: {
    language: tool.schema.string().describe("UI language request from /revela story or /revela narrative. May be any language tag or language name, such as en, zh-CN, fr, de, Korean, Arabic, or Portuguese-BR."),
    narrativeHash: tool.schema.string().optional().describe("Narrative hash from the prompt projection. Used to detect stale display prompts."),
    displayModel: tool.schema.object({
      version: tool.schema.number().describe("Must be 1."),
      language: tool.schema.string().describe("Must exactly match the top-level language request."),
      pageTitle: tool.schema.string().optional(),
      summaryLine: tool.schema.string().optional(),
      labels: tool.schema.object({
        eyebrow: tool.schema.string().optional(),
        claimFlow: tool.schema.string().optional(),
        flowNote: tool.schema.string().optional(),
        selectedClaim: tool.schema.string().optional(),
        selectedEvidence: tool.schema.string().optional(),
        evidenceList: tool.schema.string().optional(),
        gap: tool.schema.string().optional(),
        gaps: tool.schema.string().optional(),
        noEvidence: tool.schema.string().optional(),
        selectEvidencePrompt: tool.schema.string().optional(),
        sourceTrace: tool.schema.string().optional(),
        evidenceSource: tool.schema.string().optional(),
        whyThisSupports: tool.schema.string().optional(),
        linkedGaps: tool.schema.string().optional(),
        selectedGap: tool.schema.string().optional(),
        noLinkedGaps: tool.schema.string().optional(),
        claim: tool.schema.string().optional(),
        claimId: tool.schema.string().optional(),
        status: tool.schema.string().optional(),
        supportedScope: tool.schema.string().optional(),
        unsupportedScope: tool.schema.string().optional(),
        incomingRelations: tool.schema.string().optional(),
        outgoingRelations: tool.schema.string().optional(),
        evidence: tool.schema.string().optional(),
        objections: tool.schema.string().optional(),
        risks: tool.schema.string().optional(),
        researchGaps: tool.schema.string().optional(),
        coveredSlides: tool.schema.string().optional(),
        noClaims: tool.schema.string().optional(),
        none: tool.schema.string().optional(),
      }).optional(),
      claimCards: tool.schema.array(tool.schema.object({
        claimId: tool.schema.string().describe("Existing canonical claim id. Must match the deterministic map."),
        displayTitle: tool.schema.string().optional().describe("Display-only localized claim title in the requested language. For Chinese manufacturing/industrial AI context, translate autonomy as 自主化/自主能力, not 自治; convert slug-like claim text into a readable title."),
        roleLabel: tool.schema.string().optional(),
        narrativeJob: tool.schema.string().optional(),
        evidenceSummary: tool.schema.string().optional(),
        supportRationale: tool.schema.string().optional().describe("Display-only localized explanation of why the evidence supports this claim. Do not add new causal logic beyond canonical evidence, supported scope, and relation rationale."),
        supportedScope: tool.schema.string().optional().describe("Display-only localized version of the canonical supported scope."),
        unsupportedScope: tool.schema.string().optional().describe("Display-only localized version of the canonical unsupported scope or evidence boundary."),
        objectionsSummary: tool.schema.string().optional().describe("Display-only localized summary of objections tied to this claim."),
        risksSummary: tool.schema.string().optional().describe("Display-only localized summary of risks tied to this claim."),
        riskOrGapSummary: tool.schema.string().optional(),
        researchGapsSummary: tool.schema.string().optional().describe("Display-only localized summary of research gaps tied to this claim."),
      })).optional(),
      researchGapCards: tool.schema.array(tool.schema.object({
        gapId: tool.schema.string().describe("Existing canonical research gap id. Must match the deterministic map."),
        displayQuestion: tool.schema.string().optional().describe("Display-only localized gap question. Do not change source facts, ids, targets, or gap meaning."),
      })).optional(),
      relations: tool.schema.array(tool.schema.object({
        fromClaimId: tool.schema.string(),
        toClaimId: tool.schema.string(),
        relation: tool.schema.enum(["leads_to", "supports", "depends_on", "contrasts_with", "constrains", "answers"]),
        displayLabel: tool.schema.string().optional().describe("Display-only localization of an existing canonical relation label. Omit for inferred relations."),
        displayRationale: tool.schema.string().optional().describe("Display-only localization of an existing canonical rationale. Omit when canonical rationale is missing or the relation is inferred."),
      })).optional(),
    }).optional().describe("Localized and organized display-only projection. It must not add facts or alter IDs."),
  },
  async execute(args, context) {
    const workspaceRoot = context.directory ?? process.cwd()
    try {
      if (!hasDecksState(workspaceRoot)) {
        return JSON.stringify({ ok: false, error: "No DECKS.json found. Run /revela init first." })
      }
      const language = args.language as NarrativeViewLanguage
      const map = buildNarrativeMap(readDecksState(workspaceRoot))
      const stalePrompt = Boolean(args.narrativeHash && args.narrativeHash !== map.snapshot.narrativeHash)
      const display = validateNarrativeDisplayModel(map, args.displayModel as NarrativeDisplayModel | undefined, language)
      const htmlPath = writeNarrativeMapHtml(map, display)
      const url = `file://${htmlPath}`
      openUrl(url)
      return JSON.stringify({ ok: true, url, path: htmlPath, narrativeHash: map.snapshot.narrativeHash, stalePrompt, fallback: false }, null, 2)
    } catch (e: any) {
      try {
        const language = (args.language ?? "en") as NarrativeViewLanguage
        const map = buildNarrativeMap(readDecksState(workspaceRoot))
        const htmlPath = writeNarrativeMapHtml(map)
        const url = `file://${htmlPath}`
        openUrl(url)
        return JSON.stringify({ ok: false, fallback: true, url, path: htmlPath, error: e.message || String(e) }, null, 2)
      } catch (fallbackError: any) {
        return JSON.stringify({ ok: false, fallback: false, error: e.message || String(e), fallbackError: fallbackError.message || String(fallbackError) })
      }
    }
  },
})
