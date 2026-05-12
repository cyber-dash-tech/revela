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
- Do not call \`revela-decks\` action \`review\` here. That action is the deck/artifact gate inside \`/revela make --deck\` after the deck plan is confirmed.
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
- Keep deck/artifact readiness separate. If the user wants to write or review deck artifacts, tell them to run \`/revela make --deck\`.

Rules:
- Do not write or overwrite \`decks/*.html\` during narrative review.
- Do not call \`revela-decks review\` during narrative review.
- Do not apply evidence candidates, bind evidence, or rewrite slide text unless the user explicitly asks.
- Do not store secrets, credentials, tokens, or sensitive personal information.
- Do not add inferred user preferences to long-term preference state.

Start now by reading ${DECKS_STATE_FILE} through \`revela-decks\`, then call \`revela-decks\` action \`reviewNarrative\`.`
}

export function buildDeckPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const state = exists
    ? `${DECKS_STATE_FILE} exists. Read it through the revela-decks tool.`
    : `${DECKS_STATE_FILE} does not exist yet. Do not invent a deck; initialize narrative state first with /revela init.`

  return `Begin Revela deck plan handoff.

Goal:
- Treat this as the explicit transition from approved narrative state to user-confirmed deck planning.
- Use the deck-render prompt mode for design, layout, component, HTML, QA, and deck artifact rules.
- Default behavior is two-stage: first show the compiled deck plan with low-fidelity layout sketches, then stop for user confirmation before any artifact review or HTML writing.
- Every deck plan must include Cover, Table of Contents, and Closing slides. The TOC must show 3-5 chapter headings that match the deck's slide groups.
- Do not write or overwrite \`decks/*.html\` until the narrative handoff, explicit user deck-plan confirmation, and deck/artifact gate are all satisfied.
- Do not treat legacy \`writeReadiness.status\`, old review snapshots, or existing HTML decks as narrative approval.
- Do not bypass the deck HTML contract, review snapshot freshness, source-trace expectations, or export preflight protections.

Current state:
- ${state}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Workflow:
1. Call \`revela-decks\` action \`read\`.
2. Call \`revela-decks\` action \`reviewNarrative\` before planning deck slides.
3. If narrative readiness is \`approved\`, continue. If it is \`ready_for_approval\`, ask the user for explicit approval before continuing. If it is blocked, stale, or needs research, stop and report the smallest next action. Do not call \`approveNarrative\` unless the user explicitly approves or requests a render override.
4. After approval or explicit render override exists, call \`revela-decks\` action \`compileDeckPlan\`. This projects canonical narrative claims and evidence bindings into compatibility \`slides[]\` and \`slides[].evidence[]\`; it must not write HTML.
5. If \`compileDeckPlan\` returns \`skipped\`, stop and report the reason. Do not invent slide specs manually to bypass approval.
6. Present the compiled deck plan to the user and include a low-fidelity layout sketch for every slide. The plan must identify the chapter structure first: 3-5 chapter headings, each chapter's slide range, and which non-structural slides belong to each chapter. The sketch is ASCII/text structure only; do not generate visual images or HTML mockups.
7. Stop after presenting the plan. Ask the user to confirm or request changes. Do not call \`revela-decks review\`, do not fetch design context, and do not write HTML in the same turn unless the user had already explicitly confirmed the current plan before this command.
8. Only after explicit user confirmation of the current slide plan, call \`revela-decks\` action \`confirmDeckPlan\` with \`approvalBy=user\` and a compact \`approvalNote\`.
9. After confirmation is recorded, ask for or confirm visual design only after the narrative deck plan exists. Fetch required design layouts/components with \`revela-designs read\` as needed.
10. Update only deck/artifact metadata through \`revela-decks upsertDeck\` / \`upsertSlides\` when required by confirmed design/layout choices. Do not change canonical narrative claims unless the user asks to revise the narrative.
11. Call \`revela-decks\` action \`review\` as the artifact gate. It computes \`writeReadiness\` and review snapshots for deck HTML writing. If it reports \`slide_plan_unconfirmed\`, stop and ask for explicit deck-plan confirmation.
12. Write \`decks/*.html\` only if the deck/artifact gate is ready and all deck HTML contract requirements can be satisfied. Generate the artifact chapter by chapter instead of drafting all content slides in one broad pass. Keep the HTML file valid after every write, preserve already-written slides, and update one chapter's slide sections at a time.
13. For each chapter, make every content slide carry a distinct claim, evidence item, comparison, risk, or action. If a chapter lacks enough substance for its allocated slides, merge weak slides or reduce the slide count instead of creating sparse filler.
14. After each HTML write, the system automatically runs artifact QA before opening Review. If post-write artifact QA reports hard errors, fix them and let QA run again. Review opens only after hard errors pass. Density warnings about thin claim/evidence substance should be reported and improved when useful, but they do not block Review.

Deck plan report format:
- Start with \`Deck plan: awaiting confirmation\` when a plan was compiled and has not yet been confirmed.
- Include narrative readiness status and narrative hash when available.
- Include whether \`compileDeckPlan\` compiled or skipped.
- Include \`Required structure: Cover + Table of Contents + Closing\` and do not omit any of those slides.
- Include a \`Chapters\` section before the slide list. It must list 3-5 TOC headings, their slide ranges, and the non-structural slides assigned to each chapter.
- For every slide, include: slide index, title, purpose, narrative role, low-fidelity layout sketch, layout, components, primary/supporting claim ids, evidence binding ids or source summary, visual intent, and caveats/unsupported scope.
- Use this sketch style or similarly simple ASCII boxes:

\`\`\`text
Slide N: <title>

Purpose:
<one sentence>

Layout sketch:
┌──────────────────────────────────────────────┐
│ Headline                                     │
├──────────────────────┬───────────────────────┤
│ Main chart/media     │ Evidence boxes         │
│                      │ Source/caveat note     │
└──────────────────────┴───────────────────────┘

Layout:
Components:
Primary claim:
Supporting claims:
Evidence bindings:
Caveats / unsupported scope:
\`\`\`
- End by asking the user to confirm the deck plan or request changes.

Report format before any HTML write after confirmation:
- Start with \`Deck handoff: <status>\`.
- Include which user-confirmed plan, approved narrative hash, and deck review snapshot authorized the artifact work.
- Include the chapter currently being generated and confirm already-written slides are being preserved.
- If deck/artifact review is blocked, list blockers separately from narrative blockers.
- After writing HTML, read the appended \`Artifact QA\` report from the tool output. If it failed, fix hard errors before considering the deck ready for Review.

Rules:
- \`compileDeckPlan\` is the canonical narrative-to-deck planning path. Do not manually invent slide specs to avoid it.
- Deck slide specs are render-target projections. Canonical narrative remains the authority for audience, decision, claims, evidence boundaries, objections, risks, and approval.
- Cover, Table of Contents, and Closing are mandatory deck structure. TOC chapter headings must match the chapter grouping used for generation.
- Do not generate the complete deck content in one broad pass after confirmation. Work chapter by chapter while keeping the artifact valid after each write.
- Applying evidence candidates, rewriting canonical claims, or approving narratives requires explicit user instruction.
- If the user requests slide order, layout, component, or visual-intent changes that do not alter meaning, update only the deck projection through \`upsertSlides\` and present the revised plan for confirmation.
- If the user requests claim, evidence, caveat, decision, or recommendation meaning changes, update canonical narrative first and rerun narrative review/approval or explicit render override before compiling a new deck plan.
- Do not store secrets, credentials, tokens, or sensitive personal information.
- Artifact QA requires each slide to render exactly 1920x1080px, not merely any 16:9 ratio. It also checks component compliance, text overflow/clipping, page scrollbars, and whether normal QA-enabled content slides have enough claim/evidence/source substance.

Start now by reading ${DECKS_STATE_FILE}, reviewing narrative readiness, compiling the deck plan only if approval or explicit render override is current, then showing the deck plan with low-fidelity layout sketches and stopping for user confirmation.`
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
- Treat this as an artifact gate for deck rendering, not strategic narrative approval. Narrative readiness is reviewed through \`/revela story\`.
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
11. Briefly report whether the deck is ready. If blocked, list the exact blockers returned by the tool. If warnings exist, list them after blockers as residual risks; separate evidence/source warnings from narrative warnings when possible. If the review result includes \`diagnostics\`, include a \`Plan and coverage diagnostics\` section with plan quality blockers/warnings, artifact \`coverageStatus\`, \`missingClaimIds\`, \`affectedClaimIds\`, stale reasons, and \`nextActions\`. If the review result includes \`evidenceCandidates\`, add a separate \`Candidate evidence bindings\` section with candidateId, slide index/title, supported claim scope, sourceKind, findingsFile/sourcePath, quote/snippet, caveat, evidenceDraft summary, unsupportedScope, and recommendedRewrite. Tell the user they may explicitly ask to apply selected candidate IDs; do not apply them during review. If candidates are absent but \`evidenceCandidateSearch\` is present, briefly report searched file counts and the best near misses so the user can tell whether review failed to search or searched but did not find a bindable match. If the reviewer returned findings, include them in a separate \`Narrative reviewer notes\` section and label them advisory.

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
- Include coverage-driven make diagnostics when returned: whether the active deck artifact coverage is current/stale/partial/missing, which required claims are missing, which claims are affected, and the next command/action recommended by the tool.
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
