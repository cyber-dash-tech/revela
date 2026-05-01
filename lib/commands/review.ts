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
    : `${DECKS_STATE_FILE} does not exist yet. Create it through the revela-decks tool if there is enough deck context.`

  return `Review Revela deck write readiness.

Goal:
- Use ${DECKS_STATE_FILE} as the source of truth for whether the current workspace deck is ready to be written to \`decks/*.html\`.
- Preserve the deck spec for future sessions: every slide's content, layout, components, evidence, visuals, and production status.
- Do not write, patch, or directly edit ${DECKS_STATE_FILE}. Use the \`revela-decks\` tool for all state changes.
- Let \`revela-decks\` action \`review\` compute writeReadiness; do not manually set readiness to ready.

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
2. If no current deck exists but the conversation contains enough deck context, call \`revela-decks\` action \`upsertDeck\` with goal, outputPath, theme, requiredInputs, and researchPlan. Do not invent or ask for a deck key; the tool uses the workspace folder name internally.
3. If a user-confirmed slide plan is available, call \`revela-decks\` action \`upsertSlides\` with every slide's title, purpose, layout, components, structured content, evidence, visuals, and status.
4. Only set requiredInputs fields true when explicit conversation state, files read, research findings read, selected design, fetched layouts/components, or user confirmation supports them. Do not infer completion.
5. Call \`revela-decks\` action \`review\`. The tool computes and writes \`writeReadiness\` for the current workspace deck.
6. Briefly report whether the deck is ready. If blocked, list the exact blockers returned by the tool.

Minimum conditions for \`ready\`:
- Topic, audience, slide count, language, and visual style/design are decided.
- Source materials have been identified or explicitly deemed unnecessary.
- Research need has been assessed.
- If research is needed, all relevant findings have been read and reflected in the slide specs.
- The user has confirmed the slide plan.
- ${DECKS_STATE_FILE} contains per-slide specs with content, layout, components, and evidence where applicable.
- The needed design layouts and components have been fetched with \`revela-designs read\`.
- No unresolved blockers remain.

Rules:
- Do not write or overwrite \`decks/*.html\` during review.
- Treat the workspace as one deck project. If the user wants another deck, tell them to use a separate workspace/folder.
- Do not write, patch, or directly edit ${DECKS_STATE_FILE}; use \`revela-decks\`.
- Do not store secrets, credentials, tokens, or sensitive personal information.
- Do not add inferred user preferences to long-term preference state.

Start now by reading ${DECKS_STATE_FILE} through \`revela-decks\`.`
}
