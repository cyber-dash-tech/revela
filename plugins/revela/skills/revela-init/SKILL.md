---
name: revela-init
description: Initialize or refresh a Revela narrative workspace in Codex from local source materials, preserving source traceability and file-native state.
---

# Revela Init

Use this skill when the user asks to start Revela, initialize the workspace, ingest local materials, or prepare a trusted narrative graph.

## Product Contract

- `revela-narrative/` is the editable source of truth for communication meaning when present.
- `NarrativeStateV1` is the compiled internal interface.
- `deck-plan/` is render planning, not canonical meaning.
- `decks/*.html` are artifacts.
- `DECKS.json` is compatibility/cache state, not workflow authority.
- Do not invent quotes, source paths, URLs, page references, caveats, claim ids, evidence ids, or artifact coverage.

## Workflow

1. Call `revela_prepare_local_materials` first. Treat scan results as an intake registry and task list, not as source content.
2. For any registry entry with `requiresExtraction: true`, do not read the original Office/PDF file directly for narrative intake. Use the returned `allowedReadPath` / `read_view_path`; if missing, call `revela_extract_document_materials` first.
3. Prefer local source materials first: Markdown, text, CSV, PDFs, Office files, existing `researches/`, existing `revela-narrative/`, `deck-plan/`, and `decks/`.
4. After reading extracted material views, call `revela_record_material_review` for each considered Office/PDF source. Record what was merged, deferred, ignored, or left as a gap.
5. Call `revela_domain_list` and `revela_domain_read` for active domain guidance before authoring narrative meaning. Treat domain guidance as framing guidance, never as evidence.
6. If `revela-narrative/` exists, call `revela_markdown_qa` and `revela_compile_narrative`.
7. If the narrative vault is missing, create the initial `revela-narrative/` Markdown nodes directly with valid frontmatter and plain wikilink relations.
8. Evidence nodes must preserve source, quote/snippet, support scope, unsupported scope, caveat, and strength before being treated as support.
9. After writing narrative Markdown, call `revela_markdown_qa` and `revela_compile_narrative` again.
10. Before the final report, call `revela_check_material_intake` and surface any warnings about scanned-but-unextracted, extracted-but-unreviewed, unsupported, failed, or text-only sources.
11. End with a concise init report: local materials found, active domain, narrative graph status, material intake status, open gaps, Markdown QA status, and next command/action.

## Material Intake Rules

- Scan results only prove that files exist; they do not prove file content.
- For `.docx`, `.pptx`, `.xlsx`, and `.pdf`, read the extracted `read_view_path` instead of using Codex/textutil/raw reads of the original file.
- Extracted images are candidate materials only. Do not interpret them as evidence unless image meaning is explicitly reviewed or supplied by the user.
- If a user explicitly asks for text-only inspection, report it as degraded intake and do not treat it as complete source review.

## Markdown Rules

- Use node types: `index`, `audience`, `decision`, `thesis`, `claim`, `evidence`, `objection`, `risk`, `research-gap`.
- Use one leading frontmatter block per file.
- Use `## Relations` with plain node-id wikilinks, such as `- supports: [[claim-recommendation]]`.
- Do not use typed wikilinks such as `[[claim:claim-recommendation]]`.
- Do not duplicate stable headings like `## Evidence`, `## Caveats`, `## Relations`, `## Response`, or `## Mitigation`.
