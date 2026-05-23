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

1. Inspect the workspace with normal Codex file tools. Stay inside the current workspace root.
2. Prefer local source materials first: Markdown, text, CSV, PDFs, Office files, existing `researches/`, existing `revela-narrative/`, `deck-plan/`, and `decks/`.
3. If `revela-narrative/` exists, call `revela_markdown_qa` and `revela_compile_narrative`.
4. If the narrative vault is missing, create the initial `revela-narrative/` Markdown nodes directly with valid frontmatter and plain wikilink relations.
5. Evidence nodes must preserve source, quote/snippet, support scope, unsupported scope, caveat, and strength before being treated as support.
6. After writing narrative Markdown, call `revela_markdown_qa` and `revela_compile_narrative` again.
7. End with a concise init report: local materials found, narrative graph status, open gaps, Markdown QA status, and next command/action.

## Markdown Rules

- Use node types: `index`, `audience`, `decision`, `thesis`, `claim`, `evidence`, `objection`, `risk`, `research-gap`.
- Use one leading frontmatter block per file.
- Use `## Relations` with plain node-id wikilinks, such as `- supports: [[claim-recommendation]]`.
- Do not use typed wikilinks such as `[[claim:claim-recommendation]]`.
- Do not duplicate stable headings like `## Evidence`, `## Caveats`, `## Relations`, `## Response`, or `## Mitigation`.

