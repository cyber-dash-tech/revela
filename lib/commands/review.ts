import { DECKS_STATE_FILE } from "../decks-state"

export function buildReviewPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const state = exists
    ? `${DECKS_STATE_FILE} exists as legacy/cache state. Prefer file-native narrative sources.`
    : `${DECKS_STATE_FILE} does not exist. Do not create it for narrative review.`

  return `Review Revela narrative readiness.

Goal:
- Review canonical narrative state from \`revela-narrative/\` when present: audience, belief shift, decision/action, thesis, central claims, evidence boundaries, objections, and risks.
- Treat this as a narrative readiness review, not a deck HTML write-readiness review.
- Treat missing evidence, open research gaps, stale artifacts, and incomplete deck-plan links as diagnostics. They are not workflow permission gates.
- Do not call \`revela-decks\` action \`review\` here. That action is legacy deck/artifact diagnostics.
- Do not treat legacy \`writeReadiness.status\`, old review snapshots, or an existing HTML deck as narrative state.
- Do not write or overwrite \`decks/*.html\` during narrative review.
- Do not ask for narrative approval. Users decide whether to continue; report diagnostics and consequences.

Current state:
- ${state}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Workspace boundary rules:
- Stay strictly inside the current workspace root for every scan, glob, read, and write.
- Do not search parent directories, home directories, or unrelated absolute directories.
- Do not use \`~\`, \`..\`, or parent-directory traversal to discover files.
- For Glob/file searches, use the current workspace as the search root. Do not set the search root to a parent directory or home directory.

Workflow:
1. Read/compile \`revela-narrative/\` when present; use \`revela-decks\` read/reviewNarrative only as a compatibility helper while migration is in progress.
2. If canonical narrative is missing or thin, do not invent a deck plan, slide count, design, output path, or visual style. Report the smallest narrative inputs needed, usually audience, belief-before, belief-after, decision/action, thesis, central claims, evidence availability, objections, and risks.
3. If legacy deck state exists, treat it as cache/provenance only. Do not assume old deck readiness or approval fields are workflow authority.
4. Report \`status\`, \`warnings\`, \`issues\`, \`narrativeHash\`, and \`nextActions\` when returned. If the read summary returned \`markdownQa.repairCards\` or \`vaultDiagnostics\`, report Markdown QA repair cards and compile diagnostics with file/node/code/message plus smallest repair or suggested next action.
5. If research findings have been saved but not attached or evidence-bound, report them as unattached research state, not proof.
6. If central claims lack required evidence, report the named claim and the exact next action: attach findings, bind evidence, run targeted research, narrow unsupported scope, or rewrite the claim.
7. Do not report missing or stale approval as a problem. If artifacts or deck-plan files may not reflect current narrative, describe that alignment gap directly.

Report format:
- Start with \`Narrative readiness: <status>\`.
- Include \`Narrative hash: <hash>\` when returned.
- List diagnostics with issue type, claim text when available, and suggested next action. Keep Markdown QA repair cards separate from compiler diagnostics.
- If warnings exist, list them after blockers as residual risks.
- Keep deck/artifact readiness separate. If the user wants to write or review deck artifacts, tell them to run \`/revela make --deck\`.

Rules:
- Do not write or overwrite \`decks/*.html\` during narrative review.
- Do not call \`revela-decks review\` during narrative review.
- Do not apply evidence candidates, bind evidence, or rewrite slide text unless the user explicitly asks.
- Do not store secrets, credentials, tokens, or sensitive personal information.
- Do not add inferred user preferences to long-term preference state.

Start now by reading canonical narrative files and reporting diagnostics. Do not create ${DECKS_STATE_FILE} or request approval.`
}

export function buildDeckPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const state = exists
    ? `${DECKS_STATE_FILE} exists as legacy/cache state. Do not treat it as workflow authority.`
    : `${DECKS_STATE_FILE} does not exist. Continue from file-native narrative and deck-plan files.`

  return `Begin Revela deck plan handoff.

Goal:
- Treat this as the explicit transition from canonical narrative state to user-directed deck planning.
- Use the deck-render prompt mode for design, layout, component, HTML, QA, and deck artifact rules.
- Default behavior is two-stage: first generate or update \`deck-plan/index.md\` plus \`deck-plan/slides/*.md\` with low-fidelity layout sketches and narrative wikilinks, then proceed only when the user chooses to continue.
- Every deck plan must include Cover, Table of Contents, and Closing slides. The TOC must show 3-5 chapter headings that match the deck's slide groups.
- Do not write or overwrite \`decks/*.html\` until the user chooses to proceed from the current deck-plan projection.
- Do not treat legacy \`writeReadiness.status\`, old review snapshots, approval fields, or existing HTML decks as workflow permission.
- Do not bypass the deck HTML contract, source-trace expectations, or export preflight protections.

Current state:
- ${state}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Workflow:
1. Call \`revela-decks\` action \`read\` with \`summary: true\` when useful for vault diagnostics and canonical narrative projection.
2. Call \`revela-decks\` action \`reviewNarrative\` or compile narrative files to surface diagnostics before planning deck slides. Treat missing evidence, research gaps, and stale hashes as diagnostics, not permission blockers.
3. If the read summary returned \`markdownQa.blockers\` or \`vaultDiagnostics.blockers\`, report Markdown QA repair cards separately from compile diagnostics with file/node/code/message and smallest repair or suggested next action. These are data-integrity issues; ask the user whether to repair before proceeding.
4. Call \`revela-decks\` action \`compileDeckPlan\`. This returns a claim/evidence planning packet plus deck-plan authoring requirements; it must not write HTML and does not generate the final slide list. Do not infer render structure from \`DECKS.json.slides[]\`.
5. If \`compileDeckPlan\` returns \`skipped\`, report the reason and ask the user whether to continue manually, repair narrative files, or provide missing intent.
6. If target slide count, audience, language, output purpose, or visual style is unclear, ask the user for the smallest needed confirmation before writing the plan.
7. Write \`deck-plan/index.md\` and one file per planned slide under \`deck-plan/slides/*.md\` from the planning packet and requirements. The index must identify the chapter structure first: 3-5 chapter headings, each chapter's slide range, and which non-structural slides belong to each chapter. Each slide file must include frontmatter with positive 1-based \`slideIndex\` and \`## Narrative Links\` using plain wikilinks to canonical claim/evidence/risk/objection/gap ids. Include a low-fidelity ASCII/text layout sketch for every slide; do not generate visual images or HTML mockups.
8. Stop after presenting the plan unless the user already asked to proceed. Ask whether to continue, revise the plan, or run more research. Do not require an Approval block or \`confirmDeckPlan\` gate; \`confirmDeckPlan\` is compatibility/provenance only.
9. Ask for or confirm visual design only after the narrative deck plan exists. Fetch required design layouts/components with \`revela-designs read\` as needed.
10. Do not update cached \`DECKS.json\` slide specs for plan authoring. Use \`deck-plan/\` files and artifact files as the execution surface.
11. Call \`revela-decks\` action \`readDeckPlan\` before artifact review or HTML writing; use it to inspect the current deck-plan projection without regenerating it. Treat stale hashes, missing links, or incomplete coverage as advisory diagnostics unless the user asks to stop.
12. Run artifact diagnostics when useful, but do not treat \`writeReadiness\`, cached slide specs, unconfirmed plans, missing research, or stale coverage as workflow blockers.
13. Write \`decks/*.html\` when the user chooses to proceed and all deck HTML contract requirements can be satisfied. Generate the artifact chapter by chapter instead of drafting all content slides in one broad pass. Partial decks are allowed during chapter-by-chapter authoring when written slide sections have unique, increasing 1-based \`data-slide-index\` values and valid canvases; do not pad missing planned chapters with filler to match cached \`DECKS.json.slides[]\` length. Keep the HTML file valid after every write, preserve already-written slides, and update one chapter's slide sections at a time.
15. For each chapter, make every content slide carry a distinct claim, evidence item, comparison, risk, or action. If a chapter lacks enough substance for its allocated slides, merge weak slides or reduce the slide count instead of creating sparse filler.
16. After each HTML write, the system automatically runs artifact QA before opening Review. If post-write artifact QA reports hard errors, fix them and let QA run again. Review opens only after hard errors pass. Density warnings about thin claim/evidence substance should be reported and improved when useful, but they do not block Review.

Deck plan report format:
- Start with \`Deck plan: drafted\` when the deck-plan projection has been written, or \`Deck plan: diagnostics\` when reporting \`readDeckPlan\` warnings.
- Include narrative readiness status and narrative hash when available.
- Include Markdown QA repair cards and vault diagnostic warnings when returned by \`read(summary: true)\`; user decides whether to repair before planning unless the file is malformed or unsafe to write.
- Include whether \`compileDeckPlan\` prepared the planning packet or skipped.
- Include the plan artifact paths \`deck-plan/index.md\` and \`deck-plan/slides/*.md\`, and explain that the LLM-authored plan is advisory render-layer projection state.
- Include the required Source Authority and remind that \`DECKS.json.slides[]\` is cache/compatibility data, not the render contract.
- Include \`Required structure: Cover + Table of Contents + Closing\` and do not omit any of those slides.
- Include a \`Chapters\` section before the slide list. It must list 3-5 TOC headings, their slide ranges, and the non-structural slides assigned to each chapter.
- For every slide file, include: slide index, title, purpose, narrative role, low-fidelity layout sketch, layout, components, primary/supporting claim ids, evidence binding ids or source summary, visual intent, visual brief, caveats/unsupported scope, and \`## Narrative Links\`.
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
Visual intent:
Visual brief:
Caveats / unsupported scope:
\`\`\`
- End by asking the user whether to proceed to HTML, revise the plan, or run more research.

Report format before any HTML write:
- Start with \`Deck handoff: <status>\`.
- Include which deck-plan projection and narrative hash are guiding artifact work.
- State that \`revela-decks readDeckPlan\` was called and the current \`deck-plan/\` Chapter Writing Batches are being followed.
- Include the chapter currently being generated and confirm already-written slides are being preserved.
- If technical artifact checks cannot be satisfied, list those blockers separately from narrative/deck-plan diagnostics.
- After writing HTML, read the appended \`Artifact QA\` report from the tool output. If it failed, fix hard errors before considering the deck ready for Review.

Rules:
- \`compileDeckPlan\` prepares the canonical narrative claim/evidence packet and deck-plan requirements. The LLM authors \`deck-plan/index.md\` and \`deck-plan/slides/*.md\` from that packet and asks the user for page count, audience, language, output purpose, or visual style when unclear.
- \`deck-plan/\` is the execution blueprint for HTML generation when present. It must be read before writing HTML and followed chapter by chapter; \`DECKS.json.slides[]\` is compatibility/cache data, not the HTML slide-count authority.
- Visual intent is part of the deck-plan projection. During HTML generation, satisfy the planned component/visual brief using fetched design components; do not collapse planned visuals into prose-only bullets.
- Cached deck slide specs in \`DECKS.json\` are legacy projections only. Canonical narrative remains the authority for audience, decision, claims, evidence boundaries, objections, and risks.
- Cover, Table of Contents, and Closing are mandatory deck structure. TOC chapter headings must match the chapter grouping used for generation.
- Do not generate the complete deck content in one broad pass. Work chapter by chapter while keeping the artifact valid after each write.
- Applying evidence candidates or rewriting canonical claims requires explicit user instruction.
- If the user requests slide order, layout, component, or visual-intent changes that do not alter meaning, update only the \`deck-plan/\` projection or artifact-level plan content.
- If the user requests claim, evidence, caveat, decision, or recommendation meaning changes, update canonical narrative first, then report alignment diagnostics before compiling a new deck plan.
- Do not store secrets, credentials, tokens, or sensitive personal information.
- Artifact QA requires each slide to render exactly 1920x1080px, not merely any 16:9 ratio. It also checks component compliance, text overflow/clipping, page scrollbars, and whether normal QA-enabled content slides have enough claim/evidence/source substance.

Start now by reading canonical narrative files, reporting diagnostics, compiling the planning packet, then writing or updating the \`deck-plan/\` projection with low-fidelity layout sketches and narrative wikilinks. Do not create ${DECKS_STATE_FILE} as workflow state.`
}

export function buildDeckReviewPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const state = exists
    ? `${DECKS_STATE_FILE} exists as legacy/cache state. Do not treat it as workflow authority.`
    : `${DECKS_STATE_FILE} does not exist. Review artifacts directly from files.`

  return `Review Revela deck/artifact write readiness.

Goal:
- Review the current deck artifact and \`deck-plan/\` projection directly. ${DECKS_STATE_FILE}, when present, is legacy/cache state only.
- When \`deck-plan/\` exists, treat it as the deck execution blueprint for slide order, chapter batches, visual intent, and evidence trace.
- Treat this as artifact diagnostics, not workflow permission. Narrative, research, and deck-plan gaps are warnings unless they are malformed/unsafe files.
- Do not create or update ${DECKS_STATE_FILE}; use file-native sources and explicit artifact paths.
- Use technical blockers only for missing/ambiguous deck files, invalid HTML contract, invalid slide identity, canvas/overflow/export failures, malformed vault frontmatter, or unsafe writes.
- Treat this as an evidence and Narrative Compiler readiness review, not only a checklist review: unsupported numbers, market sizing, recommendations, competitor comparisons, technical assertions, investment conclusions, missing audience belief change, unclear decision/action, unproven key claims, unhandled objections, weak so-what, missing risk/assumption handling, or abrupt narrative transitions should be made visible before writing.
- For substantial decision decks, use the read-only Task subagent \`revela-narrative-reviewer\` for independent rubric-based critique of narrative brief and slide-plan alignment. Do not self-certify semantic narrative quality in the primary agent.
- Treat \`revela-narrative-reviewer\` findings as advisory critique only. Do not represent them as \`revela-decks\` readiness issues, blockers, or authoritative \`writeReadiness\`.
- Treat source trace mapping as part of evidence readiness: when research findings have been read, relevant findings should appear in slide-level \`slides[].evidence[]\` records rather than only in raw research files.
- When \`revela-decks review\` returns \`evidenceCandidates\`, treat them as conservative binding candidates only. They are not proof that the full slide is supported, and they are not automatically applied to \`slides[].evidence[]\`. If a candidate has \`sourceKind: "researchesFallback"\`, say it was discovered from workspace \`researches/\` files that are not currently referenced by \`researchPlan\`.
- When an evidence candidate includes \`evidenceDraft\`, report it as a proposed slide evidence record with its \`candidateId\`; it still requires explicit user/agent confirmation before binding. Binding canonical evidence means using \`initNarrativeVault\` if needed, writing \`revela-narrative/evidence/*.md\` with explicit source trace, and running \`compileNarrativeVault\`. Also report \`unsupportedScope\` and \`recommendedRewrite\` so partial evidence is not stretched to future-state claims.
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
1. Resolve the deck artifact from an explicit user path or discover \`decks/*.html\` when unambiguous.
2. Read \`deck-plan/\` with \`readDeckPlan\` when present and report stale hashes, missing links, missing coverage, or slide-index issues as diagnostics.
3. Run HTML contract and Artifact QA checks for the artifact when the user is preparing to write, review, or export.
4. Report evidence/source/narrative risks as diagnostics. Do not bind evidence, rewrite narrative, or update cached slide specs unless the user explicitly asks.
5. If a technical blocker exists, report the exact blocker and smallest repair. Otherwise say the user can proceed and list residual diagnostics.

Technical blockers only:
- Missing or ambiguous deck artifact path.
- Invalid HTML contract, slide identity, DOM order, canvas, overflow, or export failure.
- Malformed narrative/deck-plan Markdown/frontmatter or unsafe writes.

Report format:
- Start with \`Artifact diagnostics: <status>\`.
- If technically blocked, list each blocker with file/slide when available, issue type, and smallest repair.
- If warnings exist but no technical blocker exists, say the user can proceed and note residual risks.
- Include coverage-driven make diagnostics when returned: whether the active deck artifact coverage is current/stale/partial/missing, which required claims are missing, which claims are affected, and the next command/action recommended by the tool.
- Report \`narrative_gap\` warnings as story-structure risks such as weak so-what, missing risk/assumption handling, conclusion before support, missing audience framing, or abrupt transition.
- Do not invent evidence or silently downgrade blockers. Use the tool result as authoritative.
- Do not convert \`revela-narrative-reviewer\` advisory findings into tool readiness issues. Keep them separate from \`revela-decks review\` blockers and warnings, and preserve the reviewer's stable finding IDs when reporting them.
- When reporting weak evidence, say whether the missing trace is \`findingsFile\`, \`sourcePath\`, \`location\`, \`quote\`, \`url\`, or \`caveat\` if that is clear from the reviewed materials.
- When reporting candidate evidence bindings, distinguish partial support from full-slide support. Never say a candidate supports unrelated future-state, recommendation, roadmap, or product-vision claims unless the candidate explicitly supports those claims.
- Treat \`evidenceDraft\` as a proposed record, not a mutation. Do not call \`upsertSlides\` to bind it. If the user asks to apply candidate bindings, write \`revela-narrative/evidence/*.md\` directly with explicit source trace, then run \`compileNarrativeVault\`. Use \`upsertVaultEvidence\` only as a fallback helper when direct Markdown editing is unavailable or unsafe.
- When reporting candidate search diagnostics, do not present near misses as evidence. Say they are below binding threshold and use them only to explain why no candidate was returned.
- When reporting vault diagnostics, do not fill missing evidence, source trace, quotes, URLs, page references, or caveats from model memory. Preserve the blocker until the Markdown source is fixed and compiled.

Rules:
- Do not write or overwrite \`decks/*.html\` during review.
- Treat the workspace as one deck project. If the user wants another deck, tell them to use a separate workspace/folder.
- Do not write, patch, or create ${DECKS_STATE_FILE} as workflow state.
- Do not store secrets, credentials, tokens, or sensitive personal information.
- Do not add inferred user preferences to long-term preference state.

Start now by resolving the artifact path and reporting file-native artifact diagnostics.`
}
