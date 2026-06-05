---
name: revela-init
description: Initialize a Revela deck-first workspace in Codex from local source materials and material reviews.
---

# Revela Init

Use this skill when the user asks to start Revela, initialize the workspace, ingest local materials, or prepare source inputs for a deck.

## Product Contract

- Init prepares local source material intake; it does not create a Narrative Vault.
- Durable deck-first state is local material intake, material review files, `researches/`, `deck-plan/`, `assets/`, and `decks/*.html`.
- Scan results prove only that files exist. A material is usable only after its direct text or extracted read view has been reviewed.
- Do not invent quotes, source paths, URLs, page references, caveats, licenses, or artifact coverage.

## Workflow

1. Call `revela_prepare_local_materials` first. Treat the result as an intake registry and task list.
2. For Office/PDF sources, read `allowedReadPath` / `read_view_path`; if missing, call `revela_extract_document_materials`.
3. Prefer local source materials first: Markdown, text, CSV, PDFs, Office files, existing `researches/`, `deck-plan/`, `assets/`, and `decks/`.
4. After reading extracted material views, call `revela_record_material_review` for each considered Office/PDF source.
5. Call `revela_check_material_intake` before the final report and surface scanned-but-unreviewed, unsupported, failed, or text-only limitations.
6. Ask only high-impact intent questions: audience, objective, decision/action, scope, language, source priority, or whether public research is allowed.
7. End with an intake report: local materials found, read views reviewed, material reviews recorded, source limitations, captured user intent, and next command.

## Report

- Recommend `/revela research` when public/source support is still needed.
- Recommend `/revela plan --deck` when enough local/research inputs exist.
- Do not ask for layout, visual style, output path, export format, or approval during init.
