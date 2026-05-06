import { DECKS_STATE_FILE } from "../decks-state"

export function buildReviewPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const state = exists
    ? `${DECKS_STATE_FILE} exists. Read it through the revela-decks tool.`
    : `${DECKS_STATE_FILE} does not exist yet. Create or normalize it through the revela-decks tool only if there is enough workspace narrative context.`

  return `Review Revela narrative readiness.

Goal:
- Use ${DECKS_STATE_FILE} as the compatibility workspace-state file, but review the canonical narrative state first: audience, belief shift, decision/action, thesis, central claims, evidence boundaries, objections, risks, and approval state.
- Treat this as a narrative readiness review, not a deck HTML write-readiness review.
- Do not write, patch, or directly edit ${DECKS_STATE_FILE}. Use the \`revela-decks\` tool for all state changes.
- Call \`revela-decks\` action \`reviewNarrative\` as the authoritative deterministic readiness engine.
- Do not call \`revela-decks\` action \`review\` here. That action is the deck/artifact gate and belongs to \`/revela deck --review\`.
- Do not treat legacy \`writeReadiness.status\`, old review snapshots, or an existing HTML deck as narrative approval.
- Do not write or overwrite \`decks/*.html\` during narrative review.
- If the narrative is \`ready_for_approval\`, ask whether the user wants to approve it or revise it. Do not approve automatically.
- Only call \`revela-decks\` action \`approveNarrative\` when the user explicitly asks to approve or override.

Current state:
- ${state}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Workspace boundary rules:
- Stay strictly inside the current workspace root for every scan, glob, read, and write.
- Do not search parent directories, home directories, or unrelated absolute directories.
- Do not use \`~\`, \`..\`, or parent-directory traversal to discover files.
- For Glob/file searches, use the current workspace as the search root. Do not set the search root to a parent directory or home directory.

Workflow:
1. Call \`revela-decks\` with action \`read\` to inspect the current workspace state.
2. If ${DECKS_STATE_FILE} is missing or empty, do not invent a deck plan, slide count, design, output path, or visual style. Report the smallest narrative inputs needed, usually audience, belief-before, belief-after, decision/action, thesis, central claims, evidence availability, objections, and risks.
3. If legacy deck state exists, let the tool-normalized canonical narrative derived from \`narrativeBrief\`, slide roles, slide content, and slide evidence be reviewed. Do not assume old deck readiness means approval.
4. Call \`revela-decks\` action \`reviewNarrative\`. Use its returned \`status\`, \`blockers\`, \`warnings\`, \`issues\`, \`narrativeHash\`, \`approval\`, and \`nextActions\` as authoritative.
5. If research findings have been saved but not attached or evidence-bound, report them as unattached research state, not proof.
6. If central claims lack required evidence, report the named claim and the exact next action: attach findings, bind evidence, run targeted research, narrow unsupported scope, or rewrite the claim.
7. If approval is missing or stale, clearly distinguish \`ready_for_approval\`, \`approved\`, and render override.

Report format:
- Start with \`Narrative readiness: <status>\`.
- Include \`Narrative hash: <hash>\` when returned.
- If blocked or needs research, list each blocker with issue type, claim text when available, and suggested next action.
- If warnings exist, list them after blockers as residual risks.
- If approval is missing, ask whether the user wants to approve the narrative or revise it.
- If approval is stale, say the prior approval no longer matches the current narrative hash.
- Keep deck/artifact readiness separate. If the user wants to review slide-writing readiness, tell them to run \`/revela deck --review\`.

Rules:
- Do not write or overwrite \`decks/*.html\` during narrative review.
- Do not call \`revela-decks review\` during narrative review.
- Do not apply evidence candidates, bind evidence, or rewrite slide text unless the user explicitly asks.
- Do not store secrets, credentials, tokens, or sensitive personal information.
- Do not add inferred user preferences to long-term preference state.

Start now by reading ${DECKS_STATE_FILE} through \`revela-decks\`, then call \`revela-decks\` action \`reviewNarrative\`.`
}

export function buildDeckReviewPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const state = exists
    ? `${DECKS_STATE_FILE} exists. Read it through the revela-decks tool.`
    : `${DECKS_STATE_FILE} does not exist yet. Create it through the revela-decks tool if there is enough deck context.`

  return `Review Revela deck/artifact write readiness.

Goal:
- Use ${DECKS_STATE_FILE} as the source of truth for whether the current workspace deck is ready to be written to \`decks/*.html\`.
- Treat this as an artifact gate for deck rendering, not strategic narrative approval. Narrative readiness is reviewed by \`/revela review\`.
- Preserve the deck spec for future sessions: every slide's content, layout, components, evidence, visuals, production status, and the 0.9 narrative compiler brief when available.
- Do not write, patch, or directly edit ${DECKS_STATE_FILE}. Use the \`revela-decks\` tool for all state changes.
- Let \`revela-decks\` action \`review\` compute writeReadiness; do not manually set readiness to ready.
- Treat this as an evidence and Narrative Compiler readiness review, not only a checklist review: unsupported numbers, market sizing, recommendations, competitor comparisons, technical assertions, investment conclusions, missing audience belief change, unclear decision/action, unproven key claims, unhandled objections, weak so-what, missing risk/assumption handling, or abrupt narrative transitions should be made visible before writing.
- For substantial decision decks, use the read-only Task subagent \`revela-narrative-reviewer\` for independent rubric-based critique of narrative brief and slide-plan alignment. Do not self-certify semantic narrative quality in the primary agent.
- Treat \`revela-narrative-reviewer\` findings as advisory critique only. Do not represent them as \`revela-decks\` readiness issues, blockers, or authoritative \`writeReadiness\`.
- Treat source trace mapping as part of evidence readiness: when research findings have been read, relevant findings should appear in slide-level \`slides[].evidence[]\` records rather than only in raw research files.
- When \`revela-decks review\` returns \`evidenceCandidates\`, treat them as conservative binding candidates only. They are not proof that the full slide is supported, and they are not automatically applied to \`slides[].evidence[]\`. If a candidate has \`sourceKind: "researchesFallback"\`, say it was discovered from workspace \`researches/\` files that are not currently referenced by \`researchPlan\`.
- When an evidence candidate includes \`evidenceDraft\`, report it as a proposed slide evidence record with its \`candidateId\`; it still requires explicit user/agent confirmation before calling \`revela-decks\` action \`applyEvidenceCandidates\`. Also report \`unsupportedScope\` and \`recommendedRewrite\` so partial evidence is not stretched to future-state claims.
- When a missing-evidence issue has \`evidenceCandidateSearch\`, use it to explain search coverage: which \`researchPlan\` findings were searched, which fallback \`researches/**/*.md\` files were searched, and any near misses that were below binding threshold.

Current state:
- ${state}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Workspace boundary rules:
- Stay strictly inside the current workspace root for every scan, glob, read, and write.
- Do not search parent directories, home directories, or unrelated absolute directories.
- Do not use \`~\`, \`..\`, or parent-directory traversal to discover files.
- For Glob/file searches, use the current workspace as the search root. Do not set the search root to a parent directory or home directory.

Workflow:
1. Call \`revela-decks\` with action \`read\` for the current workspace deck.
2. If no current deck exists but the conversation contains enough deck context, call \`revela-decks\` action \`upsertDeck\` with goal, outputPath, theme, requiredInputs, researchPlan, and narrativeBrief if the story intent is clear. Do not invent or ask for a deck key; the tool uses the workspace folder name internally.
3. If \`researchPlan[].status\` is \`done\` or \`read\` and \`researchPlan[].findingsFile\` exists, verify that evidence-sensitive slide claims are backed by compact \`slides[].evidence[]\` records that reference the relevant findings file or source material where known. The review tool may surface conservative \`evidenceCandidates\` for missing evidence by matching slide text against those findings files, and may fall back to bounded workspace \`researches/**/*.md\` discovery when the research plan has no matching findings file; report these as candidate bindings, not as already-bound evidence.
4. If a user-confirmed slide plan is available, call \`revela-decks\` action \`upsertSlides\` with every slide's title, purpose, narrativeRole, layout, components, structured content, evidence, visuals, and status. Use only lightweight narrativeRole values that are clear from the plan: \`context\`, \`tension\`, \`evidence\`, \`recommendation\`, \`risk\`, \`ask\`, \`appendix\`, or \`close\`.
5. Prefer evidence records with \`findingsFile\`, \`sourcePath\`, \`location\`, \`quote\`, \`url\`, \`caveat\`, \`extractedTextPath\`, or \`extractedManifestPath\` when those fields are known from research files or extracted workspace materials.
6. Do not invent quotes, page references, locations, URLs, caveats, or extraction paths. If source trace is missing, preserve the blocker or warning and report exactly what trace is needed.
7. Only set requiredInputs fields true when explicit conversation state, files read, research findings read, selected design, fetched layouts/components, or user confirmation supports them. Do not infer completion.
8. For substantial decision decks, preserve a compact \`narrativeBrief\` through \`upsertDeck\` when the conversation or confirmed plan supports it. Do not invent stakeholder beliefs, objections, or risks; leave gaps visible if unknown.
9. For substantial decision decks, launch the Task subagent with \`subagent_type: "revela-narrative-reviewer"\` after deck/slides are up to date. Ask it to read the current \`DECKS.json\`, run only its fixed rubric, use stable finding IDs, return \`Findings: none\` when all checks pass, and avoid optional pre-write improvements. Do not ask it to write state, call \`revela-decks review\`, or produce HTML.
10. Call \`revela-decks\` action \`review\`. The tool computes and writes \`writeReadiness\` plus structured readiness issues for the current workspace deck.
11. Briefly report whether the deck is ready. If blocked, list the exact blockers returned by the tool. If warnings exist, list them after blockers as residual risks; separate evidence/source warnings from narrative warnings when possible. If the review result includes \`evidenceCandidates\`, add a separate \`Candidate evidence bindings\` section with candidateId, slide index/title, supported claim scope, sourceKind, findingsFile/sourcePath, quote/snippet, caveat, evidenceDraft summary, unsupportedScope, and recommendedRewrite. Tell the user they may explicitly ask to apply selected candidate IDs; do not apply them during review. If candidates are absent but \`evidenceCandidateSearch\` is present, briefly report searched file counts and the best near misses so the user can tell whether review failed to search or searched but did not find a bindable match. If the reviewer returned findings, include them in a separate \`Narrative reviewer notes\` section and label them advisory.

Minimum conditions for \`ready\`:
- Topic, audience, slide count, language, and visual style/design are decided.
- Source materials have been identified or explicitly deemed unnecessary.
- Research need has been assessed.
- If research is needed, all relevant findings have been read and reflected in the slide specs.
- Read or done research findings are mapped into \`slides[].evidence[]\` where they support evidence-sensitive slide claims.
- The user has confirmed the slide plan.
- ${DECKS_STATE_FILE} contains per-slide specs with content, layout, components, and evidence where applicable.
- Evidence-sensitive slide claims have compact evidence references with source trace where available. Numeric claims and strong recommendations should not be unsupported or source-only when trace exists.
- Multi-slide decision decks have a practical narrative flow: context/tension before evidence, recommendations after support, risk or assumption handling when recommending action, and a clear so-what or ask at the end. Narrative gaps are normally warnings, not hard blockers.
- Substantial decision decks should have a compact \`narrativeBrief\` that states the intended audience belief change, required decision/action, key claims, likely objections, and risks/assumptions. Missing fields are narrative warnings, not hard blockers.
- The needed design layouts and components have been fetched with \`revela-designs read\`.
- No unresolved blockers remain.

Report format:
- Start with \`Ready: yes/no\`.
- If blocked, list each blocker with slide index/title when the tool provides it, the issue type, and the suggested next action.
- If warnings exist but the deck is otherwise ready, say the deck can be written but note the residual risks.
- Report \`narrative_gap\` warnings as story-structure risks such as weak so-what, missing risk/assumption handling, conclusion before support, missing audience framing, or abrupt transition.
- Do not invent evidence or silently downgrade blockers. Use the tool result as authoritative.
- Do not convert \`revela-narrative-reviewer\` advisory findings into tool readiness issues. Keep them separate from \`revela-decks review\` blockers and warnings, and preserve the reviewer's stable finding IDs when reporting them.
- When reporting weak evidence, say whether the missing trace is \`findingsFile\`, \`sourcePath\`, \`location\`, \`quote\`, \`url\`, or \`caveat\` if that is clear from the reviewed materials.
- When reporting candidate evidence bindings, distinguish partial support from full-slide support. Never say a candidate supports unrelated future-state, recommendation, roadmap, or product-vision claims unless the candidate explicitly supports those claims.
- Treat \`evidenceDraft\` as a proposed record, not a mutation. Do not call \`upsertSlides\` to bind it. Only call \`revela-decks\` action \`applyEvidenceCandidates\` with explicit \`candidateIds\` if the user asks to apply candidate bindings.
- When reporting candidate search diagnostics, do not present near misses as evidence. Say they are below binding threshold and use them only to explain why no candidate was returned.

Rules:
- Do not write or overwrite \`decks/*.html\` during review.
- Treat the workspace as one deck project. If the user wants another deck, tell them to use a separate workspace/folder.
- Do not write, patch, or directly edit ${DECKS_STATE_FILE}; use \`revela-decks\`.
- Do not store secrets, credentials, tokens, or sensitive personal information.
- Do not add inferred user preferences to long-term preference state.

Start now by reading ${DECKS_STATE_FILE} through \`revela-decks\`.`
}
