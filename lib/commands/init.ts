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
    : `No ${DECKS_STATE_FILE} file exists yet. Initialize the Markdown narrative vault through the revela-decks tool before writing narrative meaning.`

  return `Initialize Revela narrative workspace state.

Goal:
- Build or refresh ${DECKS_STATE_FILE} and the Markdown narrative vault from local workspace evidence.
- Treat init as repeatable ingest: discover files, register source materials, follow returned ingest task hints, and distill stable narrative meaning.
- Capture primary audience, belief before/after, decision/action, thesis, central claims, evidence availability, objections, risks, source materials, artifact history, and open questions.
- Do not treat initialization as permission to write a deck. Do not require slide count, visual style, design selection, output path, layout choices, or component choices unless the user explicitly asks to render.

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

Required workflow:
1. If ${DECKS_STATE_FILE} exists, call \`revela-decks read\` with \`summary: true\`. If \`migration.available: true\`, prefer \`exportNarrativeVault\`; if no vault exists, call \`initNarrativeVault\` before recording narrative meaning.
2. Call \`revela-workspace-scan\` with no \`path\` and \`max_depth: 2\`. Scan deeper only when the user points to a workspace-relative folder or expected files are missing.
3. Search workspace-local generated artifact history only when useful: \`decks/**/*.html\`, \`slides/**/*.html\`, \`presentations/**/*.html\`, \`decks/**/*.pdf\`, and \`slides/**/*.pdf\`.
4. Register scan results with \`revela-decks init\`. Treat returned \`ingest.suggestedTasks\` as the authoritative init task list. Each task includes \`path\`, \`reason\`, \`materialType\`, \`needsExtraction\`, and \`suggestedAction\`.
5. For selected relevant tasks, read directly when \`suggestedAction: "read_directly"\`; call \`revela-extract-document-materials\` first when \`suggestedAction: "extract_then_read"\`. Do not extract every document by default.
6. Distill stable findings into \`revela-narrative/**/*.md\`. Completeness is not a gate: write partial claims, caveats, unsupported scope, and research gaps rather than waiting for a complete story.
7. After Markdown changes, rely on the vault write hook or call \`revela-decks compileNarrativeVault\`; fix blocker diagnostics. Do not use \`upsertNarrative\`.
8. If explicit deck/artifact information exists, record conservative deck specs only from visible information. Do not infer hidden evidence from generated artifacts.
9. Report initialized/updated/migrated state plus counts and paths for added, changed, newer-than-vault, unchanged, \`ingest.ingestCandidates\`, and \`ingest.suggestedTasks\`.

Evidence boundary:
- \`workspace.sourceMaterials\` and ingest task hints are candidate context, not proof.
- A finding becomes canonical only when a vault node preserves source trace, quote/snippet, support scope, unsupported scope, caveat, and strength.
- Preserve graph meaning with \`## Relations\` typed wikilinks only when the relation is explicit.

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
