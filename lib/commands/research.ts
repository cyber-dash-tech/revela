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

  return `Run Revela research from deterministic state.

Goal:
- Reduce open gaps, unsupported scope, weak evidence, unattached findings, and overextended relation rationale for the current story.
- Drive research from canonical narrative gaps: unsupported central claims, objections, risks, decision questions, explicit researchGaps, and claim_chain_gap warnings.
- Treat /revela research as authorization to bind clearly supported findings through the safe \`bindResearchFindings\` boundary without asking for item-by-item user confirmation.
- Preserve evidence boundaries: eliminate caveats only when evidence or narrower wording actually resolves them; otherwise keep precise caveats visible.
- Do not write decks, briefs, or design artifacts during research.

Current state:
- ${state}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Required first calls:
1. Call \`revela-decks read\` with \`summary: true\`.
2. If the workspace has a Markdown narrative vault, inspect \`narrativeInventory\` from the read summary or call \`revela-decks narrativeInventory\` before editing claims, gaps, evidence, or relations. If \`markdownQa.repairCards\` are present, fix structural repair cards before binding or research mutations unless the selected target is the exact repair.
3. Call \`revela-decks reviewNarrative\`.
4. Call \`revela-decks deriveResearchTargets\` and treat \`selected\`, \`bindingDiagnostic\`, and target order as deterministic inputs, not LLM judgement.

Tool-driven research contract:
- If \`selected\` or any high-priority target references a \`findingsFile\`, call \`revela-decks evaluateResearchFindings\` before external search.
- If \`bindingEval.status === "bindable"\`, call \`revela-decks bindResearchFindings\` with that \`findingsFile\`. Do not hand-author evidence Markdown for bindable findings.
- If findings are not bindable, report \`missingFields\` and \`failureReasons\`; then run only targeted research for those missing fields.
- Treat \`markdownQa\` as structural authoring feedback only. It does not prove evidence strength; \`bindingEval\`, \`bindingDiagnostic\`, and compiled claim \`evidenceStatus\` remain the trust/evidence boundary.
- For external research, use the \`revela-research\` subagent and save findings with \`revela-research-save\`. Ask for source URLs/paths, quotes/snippets, supportScope, unsupportedScope, caveat, strength, and claimId when available.
- Re-run \`deriveResearchTargets\` after attachment, binding, or explicit vault edits. Stop after at most 3 rounds.
- After explicit Markdown edits, rely on the write hook feedback or call \`revela-decks markdownQa\`, then \`compileNarrativeVault\`; keep Markdown QA repair cards separate from compiler diagnostics and repair both before treating the edit as usable research state.
- For relation changes, update content nodes first, then add explicit edges through \`revela-narrative/relations.md\` or a relation helper when available. Do not add new inline \`## Relations\` sections to claim/evidence/risk/objection/gap node files.

Allowed mutations:
- Canonical evidence: use \`bindResearchFindings\` for bindable saved findings; the safe boundary writes \`revela-narrative/evidence/*.md\` and compiles the vault.
- Research gap lifecycle: after checking inventory and reading the target node, edit \`revela-narrative/research-gaps/*.md\` or use \`updateVaultResearchGap\` when the update is explicit.
- Safe claim narrowing: after checking inventory and reading the target node, edit \`revela-narrative/claims/*.md\` only when it preserves strategic meaning and evidence boundaries.
- Relation rewrites must use \`relations.md\`/relation helpers and be reported in \`Narrative changes\`; broader strategic claim changes require Story/user confirmation.
- Initialize the vault with \`initNarrativeVault\` if a canonical vault is needed and missing.
- Never call \`upsertNarrative\` during research.

Binding criteria:
- claimId exists; quote/snippet is traceable and not invented; source URL/path/findingsFile is present; supportScope and unsupportedScope are explicit; caveat is preserved; strength is strong or useful partial; binding does not expand the claim.

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
  - \`Vault diagnostics\`: if \`vaultDiagnostics\` or a mutation \`diagnosticReport\` was returned, list blockers first with file/node/code/message and the suggested next action; otherwise write \`clean\` or \`not a vault workspace\`. If blockers exist, pause binding and research mutations unless the selected target is the exact diagnostic fix.
  - \`Markdown QA\`: if \`markdownQa.repairCards\` was returned, list repair cards by severity, file, nodeId, issueCode, message, and smallestRepair. If no cards were returned, write \`clean\` or \`not checked\`.
  - \`Evidence trust\`: report \`bindingEval.status\`, \`bindingDiagnostic.bindable\`, and compiled claim \`evidenceStatus\` separately from Markdown QA so structurally valid weak/partial evidence remains visible as weak/partial/missing support.
  - \`Existing findings inspected\`: for each file, report \`findingsFile\`, \`bindingEval.status\` when available, \`bindingDiagnostic.bindable\`, \`missingFields\`, \`failureReasons\`, and which explicit fields were present: \`source\`, \`quoteOrSnippet\`, \`supportScope\`, \`unsupportedScope\`, \`caveat\`, \`strength\`. If none were inspected, write \`none\`.
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
- Do not invent \`claimId\`, evidence ids, research-gap ids, or relation targets before checking \`narrativeInventory\` unless you are intentionally creating the missing node in Markdown.
- Do not treat \`researches/**/*.md\` as canonical evidence until attached or evidence-bound, but do not stop at findings_saved when binding criteria are met.
- Do not bypass \`deriveResearchTargets\` or \`evaluateResearchFindings\`; target selection, \`selected\`, \`bindingDiagnostic\`, and \`bindingEval\` are deterministic inputs, not LLM judgement.
- Do not mutate canonical claims merely to fit a source; narrow only to preserve evidence boundaries and avoid overstated claims.
- Do not call \`upsertNarrative\` during research. Initialize the Markdown vault with \`initNarrativeVault\` if needed; research should author bindable canonical evidence through \`bindResearchFindings\`, then use explicit Markdown edits for \`research-gaps/*.md\` and safe \`claims/*.md\` when needed. Targeted vault actions are fallback helpers, not the primary writing path. Broader narrative rewrites must be reported for Story/user confirmation.
- Do not ask the user to approve each evidence binding. Ask only when binding would change strategic meaning, downgrade a central claim, rely on suspicious sources, or require narrative approval.
- Do not store secrets, credentials, tokens, or sensitive personal information.

Start now by reading ${DECKS_STATE_FILE} through \`revela-decks\`, inspecting narrative inventory when a vault exists, reviewing current readiness, deriving research targets, and running the first research/binding loop from the selected target.`
}
