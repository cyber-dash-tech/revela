import { DECKS_STATE_FILE } from "../decks-state"

export function buildInitPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const mode = exists
    ? `A ${DECKS_STATE_FILE} file already exists. Read it first through the revela-decks tool and update it conservatively.`
    : `No ${DECKS_STATE_FILE} file exists yet. Create it through the revela-decks tool.`

  return `Initialize Revela workspace state and deck workboard.

Goal:
- Build or update ${DECKS_STATE_FILE}, the workspace-level machine-readable state file for slide deck work.
- Use the \`revela-decks\` tool for state updates. Do not write or patch ${DECKS_STATE_FILE} directly.
- Capture stable project context, professional/domain context, topic, audience, available source materials, the current deck artifact, slide specs, and open questions for future sessions.
- Do not treat initialization as permission to write a slide deck; the current deck must pass a later readiness review.
- ${DECKS_STATE_FILE} is the source of truth for the single current workspace deck.
- \`slides\` is the only slide-plan source of truth. Do not track or infer a separate slide count field.

Current state:
- ${mode}
${workspaceRoot ? `- Current workspace root: \`${workspaceRoot}\`` : ""}

Workspace boundary rules:
- Stay strictly inside the current workspace root for every scan, glob, read, and write.
- Do not search parent directories, home directories, or unrelated absolute directories.
- For \`revela-workspace-scan\`, omit \`path\` for the initial scan or use a workspace-relative path only.
- For Glob/file searches, use the current workspace as the search root. Do not set the search root to a parent directory or home directory.
- Do not use \`~\`, \`..\`, or parent-directory traversal to discover files.
- If the current workspace appears too broad, stop and ask the user which workspace subdirectory to initialize instead of scanning outside or deeply across everything.

Workflow:
1. Use the \`revela-workspace-scan\` tool to inspect document and data files in the workspace. Start with no \`path\` and \`max_depth: 2\`.
2. Separately search for existing deck outputs and deck history, especially:
   - \`decks/**/*.html\`
   - \`slides/**/*.html\`
   - \`presentations/**/*.html\`
   - \`decks/**/*.pdf\`
   - \`slides/**/*.pdf\`
   Run these searches only inside the current workspace root. These are generated/output decks, not necessarily source materials. If \`decks/\` contains exactly one HTML file, treat it as the current deck artifact. If \`decks/\` contains multiple HTML files, stop and ask the user to move extra decks to separate workspaces before adopting one.
3. Register or refresh source material records by passing the scan result's \`sourceMaterial\` objects to \`revela-decks\` action \`init\`. Preserve unchanged existing records; the tool will upsert by path and fingerprint.
4. Select the files that look most relevant for future slide decks. Prioritize source decks, PDFs, Word docs, spreadsheets, CSVs, Markdown, text notes, and relevant existing generated decks.
5. Do not automatically extract every PDF/PPTX/DOCX/XLSX during init. Call \`revela-extract-document-materials\` only for selected files that are clearly needed to form conservative workspace memory, or when the user explicitly asked to analyze the material now.
6. Before extracting or deeply reading a selected document, check \`DECKS.json.workspace.sourceMaterials\`. If the same path has the same fingerprint and valid extraction paths, reuse those paths instead of repeating extraction.
7. Read only the materials needed to form a conservative workspace memory. Do not exhaustively read every file if the workspace is large.
8. If this conversation or the workspace contains a concrete deck task or an existing deck artifact, call \`revela-decks\` with action \`upsertDeck\` and later \`upsertSlides\` for explicit deck information. Do not pass or ask for a deck key; the tool uses the workspace folder name internally. Do not mark readiness ready during init.
9. When adopting an existing HTML deck, analyze the artifact and create one conservative \`SlideSpec\` per identifiable slide/page. Record only visible source notes or explicit source information as evidence; do not infer original evidence that is not present in the artifact.
10. When a read or extracted source material clearly supports a specific slide claim, you may attach compact evidence fields such as \`sourcePath\`, \`location\`, \`extractedTextPath\`, or \`extractedManifestPath\`. Attach extraction cache paths only when they support that specific claim, not to every slide by default.
11. Treat \`workspace.sourceMaterials\` as a reusable candidate index, not proof by itself. A source material record alone is not slide evidence.
12. Report what was initialized or updated and list any open questions.

Memory rules:
- Only write facts supported by workspace files into ${DECKS_STATE_FILE} workspace state, source materials, deck memory, and open questions.
- Only write user preferences if the user explicitly stated that Revela should remember them.
- Do not infer personal preferences from one-off requests.
- Do not store secrets, credentials, API keys, tokens, account details, or sensitive personal information.
- Do not mark writeReadiness as ready during init unless the current deck has already passed an explicit \`revela-decks\` review.
- Treat this workspace as a single deck project. If the user wants another deck, guide them to create another workspace/folder rather than adding a second deck record.
- If new evidence conflicts with existing memory, preserve both briefly and add an Open Question instead of silently overwriting.

Start now by scanning the workspace.`
}
