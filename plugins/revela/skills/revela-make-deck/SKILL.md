---
name: revela-make-deck
description: Plan and generate Revela deck artifacts in Codex from canonical narrative state and deck-plan files.
---

# Revela Make Deck

Use this skill when the user asks to make, generate, or update a Revela deck.

## Source Authority

- Canonical meaning comes from `revela-narrative/`.
- Deck execution planning comes from `deck-plan/`.
- Generated artifacts live under `decks/*.html`.
- `DECKS.json.slides[]` is not the slide-count contract.

## Workflow

1. Call `revela_compile_narrative` and `revela_markdown_qa`.
2. Report narrative and Markdown diagnostics, but treat only malformed/unsafe files and technical artifact validity as hard blockers.
3. Call `revela_read_deck_plan`. If missing, author `deck-plan/index.md` and `deck-plan/slides/*.md` before HTML generation.
4. For new HTML files, call `revela_create_deck_foundation`.
5. Read active design guidance with `revela_design_list` and `revela_design_read` when choosing layouts/components.
6. Patch slides into the foundation between Revela slide markers. Preserve positive 1-based `data-slide-index` values.
7. Generate chapter by chapter. Keep the HTML valid after each write.
8. After every HTML write, call `revela_run_deck_qa` and repair hard errors before review or export.

## QA Repair Loop

- `revela_run_deck_qa` launches a browser. In sandboxed Codex sessions, this may require user-approved command escalation.
- If QA reports `text_overflow` or `text_clipped`, reduce font size, line length, padding, or line-height before changing narrative meaning.
- Prefer conservative cover and section-title sizing in smoke or diagnostic decks.
- If QA reports that a standalone smoke artifact is not the active legacy deck target, treat it as a non-blocking warning when slide identity and canvas checks pass.

## Deck Plan Requirements

Every deck plan should include Cover, Table of Contents, and Closing. Use 3-5 chapter headings, explicit slide ranges, low-fidelity layout sketches, narrative links, visual intent, evidence trace, and caveats.
