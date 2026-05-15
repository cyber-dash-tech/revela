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
1. Call \`revela-decks\` action \`read\`, then \`reviewNarrative\`, then \`deriveResearchTargets\`. Treat the returned \`selected\` target as the deterministic first target unless it is clearly blocked by user-only information.
2. If current research gaps are missing or stale, call \`revela-decks updateVaultResearchGap\` for explicit gap nodes when a Markdown vault exists; otherwise call \`deriveResearchGaps\` when useful. Then call \`deriveResearchTargets\` again. Do not invent gaps that are not tied to a claim, objection, risk, decision, or narrative issue.
3. Run up to 3 research loops unless the stop conditions below are met earlier.
4. At the start of each loop, use \`deriveResearchTargets\` as the target order. Work the \`selected\` target first, then the next 1-2 highest-priority targets only when they are related. Do not repeat searches for claims already strongly supported.
5. If a target has \`findingsFile\` or \`kind: "unattached_findings"\`, inspect \`bindingDiagnostic\` before doing external search. Prefer existing findings before external research.
6. When \`bindingDiagnostic.bindable\` is false, do not bind or package the findings as strong evidence. Report the exact \`failureReasons\` such as \`missing_quote\`, \`unclear_source\`, \`unsupported_scope\`, \`caveat_conflict\`, \`weak_source\`, \`source_mismatch\`, or \`context_only_finding\`, then either narrow the claim safely or run targeted research for the missing fields.
7. For targets needing external evidence, mark matching gaps \`in_progress\` with \`revela-decks updateVaultResearchGap\` when a Markdown vault exists; otherwise use \`revela-decks updateResearchGap\`. Then delegate search to the \`revela-research\` subagent. Ask it for source URLs, quotes/snippets, dates or locations when available, caveats, remaining gaps, and a \`## Recommended evidence bindings\` section with claimId, quote, source, supportScope, unsupportedScope, caveat, and strength. Save findings with \`revela-research-save\` under \`researches/{topic}/{axis}.md\` using \`## Data\`, \`## Cases\`, \`## Images\`, and \`## Gaps\` sections as applicable.
8. After findings are saved or existing findings are selected, read or inspect the findings file. Attach it with \`revela-decks attachResearchFindings\` when it maps to an existing research axis. Re-run \`deriveResearchTargets\` so the next loop sees updated \`bindingDiagnostic\` and target order.
9. Automatically bind evidence only when all binding criteria are met and the diagnostic is \`bindable: true\` or the same fields are explicit in the findings. When a Markdown vault exists, call \`revela-decks upsertVaultEvidence\` to write \`revela-narrative/evidence/*.md\` with explicit source trace; the vault mutation action compiles the vault, and \`compileNarrativeVault\` remains the explicit compile action after manual Markdown edits. Otherwise use \`revela-decks applyEvidenceCandidates\` for concrete candidate ids when available. Do not use \`upsertNarrative\` during research to add evidence or update narrative arrays.
10. Binding criteria: claimId exists; quote/snippet is traceable to the source and is not invented; source URL or workspace source path is present; supportScope and unsupportedScope are explicit; strength is strong or useful partial; caveat is preserved; binding does not expand the claim beyond the evidence.
11. If a claim or relation is broader than the evidence, do not mutate canonical claims during research. Report the needed claim/relation narrowing in \`Narrative changes\`, keep unsupported scope visible, and make \`/revela story\` or explicit user confirmation the next action when strategic wording must change.
12. Update matching gaps after binding: use \`evidence_bound\` when canonical evidence was added, \`closed\` when the gap is resolved or non-researchable, \`findings_saved\` only when findings exist but binding criteria are not met, and \`open\` with notes when more external research is still warranted.
13. Re-run \`reviewNarrative\` and \`deriveResearchTargets\` after each loop. Compare against the previous loop: fewer open gaps, fewer unattached findings, stronger evidence, narrower unsupported scope, or clearer internal-data caveats should count as progress.

Stop conditions:
- No open externally researchable gaps remain.
- All useful saved findings have been attached or evidence-bound.
- A full loop produces no new bindable evidence, narrower wording, or gap status improvement.
- Remaining gaps require internal user/company data, confidential sources, or strategic judgment.
- 3 loops have completed.

Report format:
- Start with \`Research loop completed after <n> round(s).\`
- Then use these exact sections in order:
  - \`Selected target\`: report \`kind\`, \`priority\`, \`reason\`, \`question\`, \`targetId\`, \`claimId\`, and any \`findingsFile\`.
  - \`Existing findings inspected\`: for each file, report \`findingsFile\`, \`bindingDiagnostic.bindable\`, \`failureReasons\`, and which explicit fields were present: \`source\`, \`quoteOrSnippet\`, \`supportScope\`, \`unsupportedScope\`, \`caveat\`, \`strength\`. If none were inspected, write \`none\`.
  - \`Attachments\`: list findings attached with axis/status, or \`none\`.
  - \`Evidence bound\`: list evidence bindings by claim id, source, quote/snippet, supportScope, unsupportedScope, caveat, and strength, or \`none\`.
  - \`Unbound findings\`: list every inspected but unbound findings file with structured failure reasons such as \`missing_quote\`, \`unclear_source\`, \`unsupported_scope\`, \`caveat_conflict\`, \`weak_source\`, \`source_mismatch\`, or \`context_only_finding\`. If none, write \`none\`.
  - \`Gap updates\`: list gaps moved to \`in_progress\`, \`findings_saved\`, \`attached\`, \`evidence_bound\`, \`closed\`, or still \`open\` with notes.
  - \`Narrative changes\`: list claims or relations narrowed, with remaining unsupported scope. If none, write \`none\`.
  - \`Remaining caveats\`: use only \`internal_data_needed\`, \`not_publicly_researchable\`, \`source_quality_limit\`, or \`still_open\`.
  - \`Next smallest story action\`: end with one concrete next command or action, not a generic request for confirmation.
- If no binding happened, the \`Unbound findings\` or \`Remaining caveats\` section must say why binding criteria failed and what exact source type is needed next.

Rules:
- Do not use primary-agent broad websearch. Use the \`revela-research\` subagent for external search.
- Do not invent quotes, source paths, URLs, page references, locations, or caveats.
- Do not treat \`researches/**/*.md\` as canonical evidence until attached or evidence-bound, but do not stop at findings_saved when binding criteria are met.
- Do not bypass \`deriveResearchTargets\`; target selection, \`selected\`, and \`bindingDiagnostic\` are deterministic inputs, not LLM judgement.
- Do not mutate canonical claims merely to fit a source; narrow only to preserve evidence boundaries and avoid overstated claims.
- Do not call \`upsertNarrative\` during research. In vault workspaces, research may update gap nodes with \`updateVaultResearchGap\` and bind evidence with \`upsertVaultEvidence\`; in compatibility JSON workspaces, research may update gaps, attach findings, and apply explicit evidence candidates. Broader narrative rewrites must be reported for Story/user confirmation.
- Do not ask the user to approve each evidence binding. Ask only when binding would change strategic meaning, downgrade a central claim, rely on suspicious sources, or require narrative approval.
- Do not store secrets, credentials, tokens, or sensitive personal information.

Start now by reading ${DECKS_STATE_FILE} through \`revela-decks\`, reviewing current readiness, deriving research targets, and running the first research/binding loop from the selected target.`
}
