import { DECKS_STATE_FILE } from "../decks-state"

export function buildResearchPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const state = exists
    ? `${DECKS_STATE_FILE} exists. Read it through the revela-decks tool before researching.`
    : `${DECKS_STATE_FILE} does not exist yet. Do not start broad internet research; initialize the workspace first with /revela init unless the user supplied a specific research question in chat.`

  return `Run Revela closed-loop research.

Goal:
- Reduce open gaps, unsupported scope, weak evidence, unattached findings, and overextended relation rationale for the current story.
- Drive research from canonical narrative gaps: unsupported central claims, objections, risks, decision questions, explicit researchGaps, and claim_chain_gap warnings.
- Treat /revela research as authorization to bind clearly supported findings into canonical evidence without asking for item-by-item user confirmation.
- Preserve evidence boundaries: eliminate caveats only when evidence or narrower wording actually resolves them; otherwise keep precise caveats visible.
- Do not write decks, briefs, or design artifacts during research.

Current state:
- ${state}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Closed-loop workflow:
1. Call \`revela-decks\` action \`read\`, then \`reviewNarrative\`.
2. If current research gaps are missing or stale, call \`deriveResearchGaps\` when useful. Do not invent gaps that are not tied to a claim, objection, risk, decision, or narrative issue.
3. Run up to 3 research loops unless the stop conditions below are met earlier.
4. At the start of each loop, choose the highest-value 2-3 targets: open/in-progress high-priority gaps, unattached saved findings, unsupported central claims, weak evidence, high-priority objections/risks, and claim_chain_gap relations. Prefer targets that can improve readiness or materially reduce caveats. Do not repeat searches for claims already strongly supported.
5. If a target already has saved findings, prioritize binding/narrowing before doing more external search.
6. For targets needing external evidence, mark matching gaps \`in_progress\` with \`revela-decks updateResearchGap\`, then delegate search to the \`revela-research\` subagent. Ask it for source URLs, quotes/snippets, dates or locations when available, caveats, remaining gaps, and a \`## Recommended evidence bindings\` section with claimId, quote, source, supportScope, unsupportedScope, caveat, and strength. Save findings with \`revela-research-save\` under \`researches/{topic}/{axis}.md\` using \`## Data\`, \`## Cases\`, \`## Images\`, and \`## Gaps\` sections as applicable.
7. After findings are saved or existing findings are selected, read or inspect the findings file. Attach it with \`revela-decks attachResearchFindings\` when it maps to an existing research axis.
8. Automatically bind evidence when all binding criteria are met. Use \`revela-decks applyEvidenceCandidates\` for concrete candidate ids when available, or \`upsertNarrative\` to preserve canonical evidence bindings with exact source, URL/path, quote/snippet, support scope, unsupported scope, caveat, and strength.
9. Binding criteria: claimId exists; quote/snippet is traceable to the source and is not invented; source URL or workspace source path is present; supportScope and unsupportedScope are explicit; strength is strong or useful partial; caveat is preserved; binding does not expand the claim beyond the evidence.
10. If a claim or relation is broader than the evidence, narrow the claim text, supportedScope, unsupportedScope, or relation rationale through \`upsertNarrative\` only when the narrower wording preserves the user's strategic meaning and source boundaries. Do not silently change the decision ask, central recommendation, or approval meaning.
11. Update matching gaps after binding: use \`evidence_bound\` when canonical evidence was added, \`closed\` when the gap is resolved or non-researchable, \`findings_saved\` only when findings exist but binding criteria are not met, and \`open\` with notes when more external research is still warranted.
12. Re-run \`reviewNarrative\` after each loop. Compare against the previous loop: fewer open gaps, fewer unattached findings, stronger evidence, narrower unsupported scope, or clearer internal-data caveats should count as progress.

Stop conditions:
- No open externally researchable gaps remain.
- All useful saved findings have been attached or evidence-bound.
- A full loop produces no new bindable evidence, narrower wording, or gap status improvement.
- Remaining gaps require internal user/company data, confidential sources, or strategic judgment.
- 3 loops have completed.

Report format:
- Start with \`Research loop completed after <n> round(s).\`
- List bound evidence by claim id and count.
- List gaps closed or moved to evidence_bound.
- List claims or relations narrowed, with the remaining unsupported scope.
- List remaining caveats only as one of: \`internal_data_needed\`, \`not_publicly_researchable\`, \`source_quality_limit\`, or \`still_open\`.
- If no binding happened, say why binding criteria failed and what exact source type is needed next.
- End with the next smallest story action, not a generic request for user confirmation.

Rules:
- Do not use primary-agent broad websearch. Use the \`revela-research\` subagent for external search.
- Do not invent quotes, source paths, URLs, page references, locations, or caveats.
- Do not treat \`researches/**/*.md\` as canonical evidence until attached or evidence-bound, but do not stop at findings_saved when binding criteria are met.
- Do not mutate canonical claims merely to fit a source; narrow only to preserve evidence boundaries and avoid overstated claims.
- Do not ask the user to approve each evidence binding. Ask only when binding would change strategic meaning, downgrade a central claim, rely on suspicious sources, or require narrative approval.
- Do not store secrets, credentials, tokens, or sensitive personal information.

Start now by reading ${DECKS_STATE_FILE} through \`revela-decks\`, reviewing current readiness, and running the first research/binding loop.`
}
