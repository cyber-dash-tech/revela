import { DECKS_STATE_FILE } from "../decks-state"

export type RememberParseResult =
  | { ok: true; memory: string }
  | { ok: false; error: string }

const USAGE =
  "**Usage:** `/revela remember <preference or workflow habit>`\n" +
  "Example: `/revela remember 我偏好中文、咨询风格、每页只表达一个核心观点`"

export function parseRememberArgs(input: string): RememberParseResult {
  const memory = input.trim()
  if (!memory) return { ok: false, error: USAGE }
  return { ok: true, memory }
}

export function buildRememberPrompt({ memory, exists }: { memory: string; exists: boolean }): string {
  const state = exists
    ? `Read the existing ${DECKS_STATE_FILE} through revela-decks before updating preferences.`
    : `Create ${DECKS_STATE_FILE} through revela-decks action init before recording this memory.`

  return `Record explicit Revela workspace memory.

The user explicitly asked Revela to remember this:

\`\`\`text
${memory}
\`\`\`

Task:
- ${state}
- Use the \`revela-decks\` tool with action \`remember\` to update ${DECKS_STATE_FILE}; do not write or patch the file directly.
- Use preferenceType \`user\` if it describes output style, visual taste, language, audience, narrative, or content constraints.
- Use preferenceType \`workflow\` if it describes how the user wants Revela to work.
- Keep the entry concise and faithful to the user's wording.
- Do not add inferred preferences or unrelated context.
- Do not duplicate an existing equivalent preference; merge or refine it instead.
- Do not store secrets, credentials, API keys, tokens, account details, or sensitive personal information.

After updating ${DECKS_STATE_FILE}, briefly report which preference type you changed.`
}
