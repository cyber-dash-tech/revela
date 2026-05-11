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
    : `No ${DECKS_STATE_FILE} file exists yet. Create it through the revela-decks tool only when there is enough stable workspace or narrative context.`

  return `Initialize Revela narrative workspace state.

Goal:
- Build or update ${DECKS_STATE_FILE}, the workspace-level machine-readable state file for Revela narrative and artifact work.
- Use the \`revela-decks\` tool for state updates. Do not write or patch ${DECKS_STATE_FILE} directly.
- Capture stable narrative context first: primary audience, belief before, belief after, decision/action, thesis, central claims, evidence availability, objections, risks, available source materials, existing artifact history, and open questions.
- Do not treat initialization as permission to write a deck. Narrative readiness is reviewed later by \`/revela story\`; deck/artifact readiness is handled by \`/revela make --deck\` after story approval and deck-plan confirmation.
- Do not require slide count, visual style, design selection, output path, layout choices, or component choices during narrative initialization unless the user explicitly asks to render a deck now.
- ${DECKS_STATE_FILE} is the compatibility workspace-state file. Deck specs are render-target projections, not the center of initialization.

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
2. Separately search for existing artifact history, especially:
   - \`decks/**/*.html\`
   - \`slides/**/*.html\`
   - \`presentations/**/*.html\`
   - \`decks/**/*.pdf\`
   - \`slides/**/*.pdf\`
   Run these searches only inside the current workspace root. These are generated/output artifacts, not necessarily source materials. If \`decks/\` contains exactly one HTML file, record it as existing artifact history and possible current deck artifact. If \`decks/\` contains multiple HTML files, do not guess which one is canonical; ask the user which artifact belongs to this workspace or whether extra decks should move to separate workspaces.
3. Register or refresh source material records by passing the scan result's \`sourceMaterial\` objects to \`revela-decks\` action \`init\`. Preserve unchanged existing records; the tool will upsert by path and fingerprint.
4. Select the files that look most relevant for understanding the narrative problem. Prioritize source decks, PDFs, Word docs, spreadsheets, CSVs, Markdown, text notes, and relevant existing generated artifacts.
5. Do not automatically extract every PDF/PPTX/DOCX/XLSX during init. Call \`revela-extract-document-materials\` only for selected files that are clearly needed to form conservative narrative memory, or when the user explicitly asked to analyze the material now.
6. Before extracting or deeply reading a selected document, check \`DECKS.json.workspace.sourceMaterials\`. If the same path has the same fingerprint and valid extraction paths, reuse those paths instead of repeating extraction.
7. Read only the materials needed to form conservative narrative memory. Do not exhaustively read every file if the workspace is large.
8. If enough information is available, preserve canonical narrative intent through \`revela-decks\` action \`upsertNarrative\`: audience intent, decision intent, thesis, central claims, explicit evidence bindings where known, objections, and risks. This does not require deck rendering inputs.
9. If the workspace has explicit slide/deck information, existing HTML, or a user-requested deck task, you may also call \`upsertDeck\` and \`upsertSlides\` for explicit deck information. The tool projects canonical narrative state back to compatibility \`narrativeBrief\` when a deck record exists. Do not pass or ask for a deck key; the tool uses the workspace folder name internally. Do not mark deck readiness ready during init.
10. When adopting an existing HTML deck, analyze the artifact and create one conservative \`SlideSpec\` per identifiable slide/page only if the artifact is clearly the current workspace artifact. Record only visible source notes or explicit source information as evidence; do not infer original evidence that is not present in the artifact.
11. When a read or extracted source material clearly supports a specific narrative or slide claim, preserve compact evidence trace such as \`sourcePath\`, \`location\`, \`extractedTextPath\`, or \`extractedManifestPath\`. Attach extraction cache paths only when they support that specific claim, not to every claim or slide by default.
12. Treat \`workspace.sourceMaterials\` as a reusable candidate index, not proof by itself. A source material record alone is not narrative evidence or slide evidence.
13. Report what was initialized or updated and list the smallest open narrative questions needed to proceed.

Narrative questions to ask only when missing:
- Who is the primary audience?
- What do they believe before this communication?
- What should they believe after it?
- What decision or action is required?
- What is the working thesis or recommendation?
- Which central claims support the thesis?
- Which sources or findings support those claims?
- What objections, risks, assumptions, or caveats could break the argument?

Memory rules:
- Only write facts supported by workspace files or explicit user statements into ${DECKS_STATE_FILE} workspace state, source materials, narrative compatibility fields, deck memory, and open questions.
- Only write user preferences if the user explicitly stated that Revela should remember them.
- Do not infer personal preferences from one-off requests.
- Do not store secrets, credentials, API keys, tokens, account details, or sensitive personal information.
- Do not mark narrative approval, render override, or writeReadiness as ready during init.
- Treat this workspace as a single deck project. If the user wants another deck, guide them to create another workspace/folder rather than adding a second deck record.
- If new evidence conflicts with existing memory, preserve both briefly and add an Open Question instead of silently overwriting.

Start now by scanning the workspace.`
}
