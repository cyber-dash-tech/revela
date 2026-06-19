---
name: revela-review
description: Open an existing Revela HTML deck directly in Codex Browser for user inspection.
---

# Revela Review

Use this skill when the user asks to review, open, inspect, or look at an existing Revela HTML deck artifact in Codex Browser.

## Contract

- Review is the user-facing browser step after a deck exists.
- The default path opens the HTML deck itself in Codex Browser without running QA first.
- Diagnostics are optional: call `revela_review_deck_read` only when the user explicitly asks for QA, readiness, diagnostics, or a written review summary.
- This skill does not open the legacy comment/apply browser surface, render new decks, or export PDF/PPTX/PNG.

## Preconditions

- Required: a readable `decks/*.html` file or a user-provided deck HTML file path.
- If the user gives `@decks/<file>.html`, use that file.
- If the user asks to review "the deck" and exactly one `decks/*.html` file is present, use it.
- If multiple deck HTML files are present and the target is unclear, ask the user which deck to open.

## Required Tool

Call `revela_open_deck` with:

- `workspaceRoot` when known.
- `file` set to the workspace-relative or absolute HTML deck path.
- `openBrowser` omitted or `true` for the normal user-facing flow.

## Optional Diagnostics

When the user explicitly asks for QA, readiness, diagnostics, or a written review summary:

1. Call `revela_review_deck_read` with the target deck file.
2. Report artifact QA and deck-plan diagnostics concisely.
3. Still open Review unless the file is missing or the user asked only for diagnostics.

## Output

Report:

- The deck file opened.
- The direct deck URL returned by `revela_open_deck`.
- Whether Codex opened the browser.
- A short user prompt for what to inspect: copy, argument flow, hierarchy, spacing, charts/tables, visuals, and export readiness.
- If diagnostics were requested, include the concise diagnostic summary.

## Must Not

- Do not run QA before opening Review unless the user explicitly asks for diagnostics.
- Do not open any legacy comment/apply browser surface or token-based review UI.
- Do not call export tools; route PDF/PPTX/PNG requests to `revela-export`.
- Do not generate or rewrite `deck-plan.md`.
- Do not generate a new HTML deck; route rendering requests to `revela-make-deck`.
- Do not open local deck files directly with `file://`; use the direct deck opener.
