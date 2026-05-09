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

  return `Run Revela gap-driven research.

Goal:
- Fill missing or external evidence for the current story, not generic background curiosity.
- Drive research from canonical narrative gaps: unsupported central claims, objections, risks, decision questions, and explicit researchGaps.
- Keep saved findings separate from evidence support until the primary workflow attaches findings or binds evidence through Revela state tools.
- Do not write decks, briefs, or design artifacts during research.

Current state:
- ${state}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Workflow:
1. Call \`revela-decks\` action \`read\`.
2. If narrative readiness has not produced current gaps, call \`revela-decks\` action \`reviewNarrative\`, then \`deriveResearchGaps\` when useful. Do not invent gaps that are not tied to a claim, objection, risk, decision, or narrative issue.
3. Prioritize open or in-progress high-priority research gaps, unsupported central claims, and high-priority objections/risks. Avoid researching claims already strongly supported by workspace evidence.
4. Mark selected gaps \`in_progress\` with \`revela-decks updateResearchGap\` before external research when a gap id exists.
5. Delegate external web research to the \`revela-research\` subagent. Ask it to return raw findings with source URLs, quotes/snippets, dates or locations when available, caveats, and remaining gaps. It should save findings with \`revela-research-save\` under \`researches/{topic}/{axis}.md\` using \`## Data\`, \`## Cases\`, \`## Images\`, and \`## Gaps\` sections as applicable.
6. After findings are saved, read or inspect the saved findings file. Attach it with \`revela-decks attachResearchFindings\` when it maps to an existing research axis, and update matching research gaps to \`findings_saved\` or \`attached\` with the findings file path.
7. Bind evidence only when the finding explicitly supports a canonical claim and the support scope is clear. Use \`revela-decks applyEvidenceCandidates\` only for selected candidate ids or preserve a new canonical evidence binding through \`upsertNarrative\` with exact source, URL/path, quote/snippet, support scope, unsupported scope, and caveat.
8. If findings partially support a claim, narrow the supported scope and keep unsupported scope visible. Do not stretch evidence to support recommendations, forecasts, or roadmap claims that the source does not cover.
9. Report what was researched, where findings were saved, what was attached or bound, what remains unsupported, and the next smallest story action.

Rules:
- Do not use primary-agent broad websearch. Use the \`revela-research\` subagent for external search.
- Do not invent quotes, source paths, URLs, page references, locations, or caveats.
- Do not treat \`researches/**/*.md\` as canonical evidence until attached or evidence-bound.
- Do not mutate canonical claims merely to fit a source unless the user asks to revise the story.
- Do not store secrets, credentials, tokens, or sensitive personal information.

Start now by reading ${DECKS_STATE_FILE} through \`revela-decks\` and identifying the highest-priority research gaps.`
}
