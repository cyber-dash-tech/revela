import { DECKS_STATE_FILE } from "../decks-state"

export function buildInitPrompt({
  exists,
  workspaceRoot,
}: {
  exists: boolean
  workspaceRoot?: string
}): string {
  const mode = exists
    ? `A ${DECKS_STATE_FILE} file already exists as legacy/cache state. Read it first through the revela-decks tool and update it conservatively only for compatibility metadata.`
    : `No ${DECKS_STATE_FILE} file exists yet. Keep this workspace file-native: initialize the Markdown narrative vault before writing narrative meaning and do not create ${DECKS_STATE_FILE}.`

  return `Start Revela on the current workspace.

Goal:
- Initialize or refresh the Markdown narrative vault and file-native source inventory from local workspace evidence.
- Treat init as repeatable ingest: discover files, register source materials, follow returned ingest task hints, and distill stable narrative meaning.
- Capture primary audience, belief before/after, decision/action, thesis, central claims, evidence availability, objections, risks, source materials, artifact history, and open questions.
- End init with a guided completion report: what local discovery found, what the narrative graph currently contains, what gaps remain, what user clarification is needed, and which command should run next.
- Do not treat initialization as permission to write a deck. Do not require slide count, visual style, design selection, output path, layout choices, or component choices unless the user explicitly asks to render.
- Treat central claims as chapter-ready claims, not evidence fragments: a central claim should be able to support framing/context, proof/evidence, decision implication, and explicit boundary/gap/risk material. If local material only supports a narrow fact, record it as supporting evidence or a supporting claim instead of promoting it to central importance.

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

Expected tool use during init:
- \`revela-decks init\` and \`revela-decks initNarrativeVault\` are expected controlled file-native/vault boundaries. In fresh workspaces they must not create ${DECKS_STATE_FILE}; if legacy state already exists, they may update compatibility metadata conservatively. Empty-looking optional fields in tool UI are a schema display artifact, not user-provided evidence.
- Treat \`authoringContract\` returned by \`read(summary: true)\`, \`initNarrativeVault\`, or \`narrativeInventory\` as the Markdown authoring guide: valid node types, plain id convention, inline relation syntax, forbidden compatibility actions, and optional helper templates.
- Treat \`markdownQa\` returned by \`read(summary: true)\`, \`compileNarrativeVault\`, or \`revela-decks markdownQa\` as post-authoring repair feedback that is separate from compiler diagnostics. Fix \`repairCards\` by smallest repair; do not invent missing claims, evidence, source paths, URLs, quotes, or caveats just to clear QA. If \`compileNarrativeVault\` output does not visibly include \`markdownQa\`, call \`revela-decks markdownQa\` before final reporting.
- Before authoring claims, evidence, relations, objections, risks, or research gaps, inspect \`narrativeInventory\` from \`read(summary: true)\` or call \`revela-decks narrativeInventory\`. Reuse existing ids and relation targets. Do not invent evidence ids, claim ids, or relation targets before checking inventory unless you are intentionally creating the missing node in Markdown.
- Create/update content nodes first. Add graph edges afterward in the source node's \`## Relations\` section with plain node-id wikilinks. Do not use \`relations.md\`, typed wikilinks, or hand-written relation ids.
- You may directly maintain \`revela-narrative/**/*.md\` knowledge nodes. Use structured vault helpers only when they reduce schema risk or express a narrow lifecycle/evidence-binding action: \`bindResearchFindings\`, \`upsertVaultEvidence\`, \`upsertVaultResearchGap\`, \`updateVaultResearchGap\`, or similar targeted helpers.
- Use targeted vault helpers only when you have a complete payload for that node/action. If a helper returns missing fields, report the gap or repair Markdown directly; do not invent fields.
- Do not use JSON-era compatibility actions such as \`upsertResearchGaps\`, \`deriveResearchGaps\`, \`updateResearchGap\`, \`closeResearchGap\`, \`applyEvidenceCandidates\`, or \`upsertNarrative\` in vault workspaces. Follow the tool error and \`authoringContract\` replacement action.
- Direct Markdown patches must update existing sections in place. Do not duplicate stable headings such as \`## Evidence\`, \`## Caveats\`, \`## Relations\`, \`## Response\`, or \`## Mitigation\`.
- Do not append a second frontmatter block. A vault Markdown file must have one leading \`---\` frontmatter block only.

Minimum vault authoring contract:
- Supported \`type\` values are \`index\`, \`audience\`, \`decision\`, \`thesis\`, \`claim\`, \`evidence\`, \`objection\`, \`risk\`, and \`research-gap\`. Use \`research-gap\`, not \`researchGap\` or \`research_gap\`.
- New graph relations belong in node-local \`## Relations\` sections, for example \`- supports: [[claim-belief-change-purpose]] - Optional rationale.\` Compiler-generated ids are deterministic; never hand-write relation ids.
- Relation wikilinks reference plain frontmatter node ids directly. Do not write typed targets such as \`[[claim:claim-belief-change-purpose]]\`.
- Evidence nodes require source trace (\`source\`, \`sourcePath\` or \`url\` when known, \`location\` when known), \`supportScope\`, \`unsupportedScope\`, \`caveat\`, \`strength\`, a quoted/snippet body, and a \`## Relations\` line such as \`- supports: [[claim-id]]\` when the supported claim is explicit. Keep \`claimId\` only as compatibility fallback for existing vaults or helper outputs.
- When fixing a new node created earlier in the same turn, patch the broken line or section. Do not delete and recreate existing nodes just to fix \`type\`, frontmatter, or relation syntax.

Required workflow:
1. If ${DECKS_STATE_FILE} exists, call \`revela-decks read\` with \`summary: true\`. If \`migration.available: true\`, prefer \`exportNarrativeVault\`; if no vault exists, call \`initNarrativeVault\` before recording narrative meaning.
2. Call \`revela-workspace-scan\` with no \`path\` and \`max_depth: 2\`. Scan deeper only when the user points to a workspace-relative folder or expected files are missing.
3. Search workspace-local generated artifact history only when useful: \`decks/**/*.html\`, \`slides/**/*.html\`, \`presentations/**/*.html\`, \`decks/**/*.pdf\`, and \`slides/**/*.pdf\`.
4. Register scan results with \`revela-decks init\`. Treat returned \`ingest.suggestedTasks\` as the authoritative init task list. Each task includes \`path\`, \`reason\`, \`materialType\`, \`needsExtraction\`, and \`suggestedAction\`.
5. For selected relevant tasks, read directly when \`suggestedAction: "read_directly"\`; call \`revela-extract-document-materials\` first when \`suggestedAction: "extract_then_read"\`. Do not extract every document by default.
6. Before writing narrative meaning, inspect \`narrativeInventory\` from the latest \`read(summary: true)\` result or call \`revela-decks narrativeInventory\`. Then distill stable findings into \`revela-narrative/**/*.md\` using the Markdown authoring guide. Completeness is not a gate: write partial claims, caveats, unsupported scope, and research gaps rather than waiting for a complete story. Use optional helpers such as \`upsertVaultResearchGap\`, \`upsertVaultEvidence\`, or \`bindResearchFindings\` only when they fit the exact update. Preserve frontmatter ids and existing section headings when editing Markdown. Write nodes first; add inline \`## Relations\` edges afterward only when explicit.
7. After Markdown changes, rely on the vault write hook or call \`revela-decks markdownQa\`, then \`revela-decks compileNarrativeVault\`; keep \`markdownQa.repairCards\` separate from compiler blockers and fix both before treating the narrative as usable. If no explicit \`markdownQa\` result is visible after compile, call \`revela-decks markdownQa\` as a manual fallback. Do not use \`upsertNarrative\`.
8. If explicit deck/artifact information exists, record conservative artifact context in file-native outputs or existing compatibility state only from visible information. Do not infer hidden evidence from generated artifacts.
9. Complete an Init Completion Report before ending. Do not end with only a technical success message. Include local discovery counts and paths for added, changed, newer-than-vault, unchanged, \`ingest.ingestCandidates\`, and \`ingest.suggestedTasks\`; a narrative graph summary; open evidence/research gaps; any Markdown QA status; user clarification questions; and recommended next commands. Always include \`Markdown QA: clean\` or \`Markdown QA blockers:\` in the final report. If Markdown QA blockers remain, do not say the workspace initialized cleanly; say the vault was initialized but Markdown repairs remain.

Evidence boundary:
- \`workspace.sourceMaterials\` and ingest task hints are candidate context, not proof.
- A finding becomes canonical only when a vault node preserves source trace, quote/snippet, support scope, unsupported scope, caveat, and strength.
- Preserve graph meaning by writing explicit edges in node-local \`## Relations\` sections after nodes exist. Use plain node-id wikilinks and optional inline rationale.
- Intent briefs, proposals, and user-authored plans may support audience, decision, thesis, stakeholder framing, and stated internal intent. They do not by themselves prove market size, competitor performance, product-market fit, operating-model effectiveness, or external factual claims.
- If a source states an intended strategy but not its external factual basis, record the strategy as a claim with partial or missing support and add a research gap instead of binding it as strong evidence.
- If a central claim cannot yet sustain a future claim-led chapter, keep the insufficiency visible through evidence status, unsupported scope, caveats, or a research gap rather than padding the future deck with generic slides.
- A successful vault compile means the vault is structurally valid. It is not evidence readiness, narrative approval, or permission to make a deck/brief.

Narrative questions to ask only when missing:
- Who is the primary audience?
- What do they believe before this communication?
- What should they believe after it?
- What decision or action is required?
- What is the working thesis or recommendation?
- Which central claims support the thesis?
- Which sources or findings support those claims?
- What objections, risks, assumptions, or caveats could break the argument?

Init completion rules:
- Before ending \`/revela init\`, either use the question tool (AskQuestion) for at least one useful clarification or explicitly state that no clarification is needed now.
- Ask only narrative-startup questions during init: audience, decision/action, scope, source priority, missing internal data, or whether external research is allowed for public evidence gaps.
- Do not ask for slide count, design choice, layout choice, visual style, output path, PDF/PPTX export, or component preferences during init.
- Always surface open gaps. Classify them as evidence gaps, research gaps, internal-data-needed, source-quality limits, or user-intent questions when possible.
- Always recommend the next command: \`/revela research\` when evidence gaps need support, \`/revela story\` when the graph is ready to inspect, and \`/revela make --deck\` only when the user is ready to render from the current story.

Memory rules:
- Only write facts supported by workspace files or explicit user statements into file-native narrative/source files or, when ${DECKS_STATE_FILE} already exists, conservative compatibility metadata such as source materials, deck memory, and open questions.
- Only write user preferences if the user explicitly stated that Revela should remember them.
- Do not infer personal preferences from one-off requests.
- Do not store secrets, credentials, API keys, tokens, account details, or sensitive personal information.
- Do not create or update approval, render override, or writeReadiness workflow state during init.
- Treat this workspace as a single deck project. If the user wants another deck, guide them to create another workspace/folder rather than adding a second deck record.
- If new evidence conflicts with existing memory, preserve both briefly and add an Open Question instead of silently overwriting.

Start now by scanning the workspace.`
}
