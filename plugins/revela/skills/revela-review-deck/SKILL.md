---
name: revela-review-deck
description: Review Revela deck artifacts in Codex for technical validity and targeted deck edits.
---

# Revela Review Deck

Use this skill when the user asks to review, diagnose, QA, or refine a generated Revela deck.

## Workflow

1. Resolve the target `decks/*.html` file from the user request or unambiguous workspace state.
2. For a plain review request, call `revela_review_deck_open` and let the tool open the browser by default.
3. Use `revela_review_deck_read`, normally with `format: "markdown"`, only when the user explicitly asks for diagnostics, QA details, export readiness, or no-GUI output.
4. Review UI is QA + Leave Comment / Apply. Insight/Inspect is removed.
5. Do not call `revela_run_deck_qa` separately for a normal Review UI open.
6. Pure visual/layout/export fixes may patch artifacts directly when the user asks for a change, but read active design rules first with `revela_design_read` using `section: "rules"`.
7. Content changes that affect the deck argument should update `deck-plan.md` first, then remake the deck.

## QA Notes

- `revela_review_deck_read` is read-only: it must not mutate deck HTML, `deck-plan.md`, assets, or compatibility state.
- `revela_review_deck_open` returns URL/token/open state and basic file metadata.
- Repair hard QA errors before treating a deck as review-ready.
- Deck slides must use `<section class="slide" ...>` with exactly one direct `.slide-canvas` child.
