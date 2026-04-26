import { DECKS_MEMORY_FILE, createDecksMemoryTemplate } from "../decks-memory"

export function buildInitPrompt({ exists }: { exists: boolean }): string {
  const mode = exists
    ? `A ${DECKS_MEMORY_FILE} file already exists. Read it first, preserve useful existing content, and update it conservatively.`
    : `No ${DECKS_MEMORY_FILE} file exists yet. Create one at the workspace root.`

  return `Initialize Revela workspace memory.

Goal:
- Build or update ${DECKS_MEMORY_FILE}, the workspace-level long-term memory for slide deck work.
- Capture stable project context, available source materials, audience/use-case context, deck history, and open questions for future sessions.
- Keep the file human-editable Markdown.

Current state:
- ${mode}

Workflow:
1. Use the \`revela-workspace-scan\` tool to inspect document and data files in the workspace.
2. Separately search for existing deck outputs and deck history, especially:
   - \`decks/**/*.html\`
   - \`slides/**/*.html\`
   - \`presentations/**/*.html\`
   - \`decks/**/*.pdf\`
   - \`slides/**/*.pdf\`
   These are generated/output decks, not necessarily source materials. Record stable history, themes, filenames, and obvious reuse opportunities without treating them as authoritative source data.
3. Select the files that look most relevant for future slide decks. Prioritize source decks, PDFs, Word docs, spreadsheets, CSVs, Markdown, text notes, and relevant existing generated decks.
4. For selected PDF/PPTX/DOCX/XLSX files, call \`revela-extract-document-materials\` before deciding what to summarize.
5. Read only the materials needed to form a conservative workspace memory. Do not exhaustively read every file if the workspace is large.
6. Write ${DECKS_MEMORY_FILE} at the workspace root using the structure below.
7. Report what was initialized or updated and list any open questions.

Memory rules:
- Only write facts supported by workspace files into Project Brief, Source Materials, Deck Memory, and Research Notes.
- Only write user preferences if the user explicitly stated that Revela should remember them.
- Do not infer personal preferences from one-off requests.
- Do not store secrets, credentials, API keys, tokens, account details, or sensitive personal information.
- If ${DECKS_MEMORY_FILE} already exists, do not delete User Preferences or Workflow Preferences.
- If new evidence conflicts with existing memory, preserve both briefly and add an Open Question instead of silently overwriting.

Use this template as the target structure:

\`\`\`md
${createDecksMemoryTemplate().trim()}
\`\`\`

Start now by scanning the workspace.`
}
