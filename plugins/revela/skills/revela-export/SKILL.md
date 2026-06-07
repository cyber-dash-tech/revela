---
name: revela-export
description: Export Revela deck artifacts from Codex to PDF, PPTX, or PNG.
---

# Revela Export

Use this skill when the user asks to export a Revela deck.

## Contract

- Export converts generated HTML decks to PDF, PPTX, or per-slide PNG files.
- The target deck should be export-ready before export.
- If the latest visible QA result has hard errors, repair them before treating the deck as export-ready.

## Preconditions

- A target `decks/*.html` file exists.
- The requested format is `pdf`, `pptx`, or `png`.
- Latest QA should have no hard errors.

## Inputs

- HTML deck path.
- Export format: `pdf`, `pptx`, or `png`.

## Workflow

1. Resolve the target HTML deck path.
2. For PDF, call `revela_export_pdf`.
3. For PPTX, call `revela_export_pptx`.
4. For per-slide PNG files, call `revela_export_png`.
5. Report output path(s), slide count, or export errors.

## Outputs

- PDF path.
- PPTX path.
- Per-slide PNG directory/path list.
- Slide count or export error.

## Must Not

- Do not claim a deck with hard QA errors is export-ready.
- Do not silently ignore browser launch, screenshot, PDF, PPTX, or PNG export failures.

`revela_run_deck_qa`, `revela_export_pdf`, `revela_export_pptx`, and `revela_export_png` may launch a browser. In sandboxed Codex sessions, request user-approved command escalation when the browser cannot start inside the default sandbox.

Post-write hooks and explicit QA tools surface Artifact QA failures.
