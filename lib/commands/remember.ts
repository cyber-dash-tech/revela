import { DECKS_MEMORY_FILE, createDecksMemoryTemplate } from "../decks-memory"

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
    ? `Read the existing ${DECKS_MEMORY_FILE} first and update only the relevant preference section.`
    : `Create ${DECKS_MEMORY_FILE} at the workspace root before recording this memory.`

  return `Record explicit Revela workspace memory.

The user explicitly asked Revela to remember this:

\`\`\`text
${memory}
\`\`\`

Task:
- ${state}
- Add the memory to \`User Preferences\` if it describes output style, visual taste, language, audience, narrative, or content constraints.
- Add the memory to \`Workflow Preferences\` if it describes how the user wants Revela to work.
- Keep the entry concise and faithful to the user's wording.
- Do not add inferred preferences or unrelated context.
- Do not duplicate an existing equivalent preference; merge or refine it instead.
- Preserve all other ${DECKS_MEMORY_FILE} sections.
- Do not store secrets, credentials, API keys, tokens, account details, or sensitive personal information.

${exists ? "" : `Use this initial structure if you need to create the file:\n\n\`\`\`md\n${createDecksMemoryTemplate().trim()}\n\`\`\``}

After updating ${DECKS_MEMORY_FILE}, briefly report the section you changed.`
}
