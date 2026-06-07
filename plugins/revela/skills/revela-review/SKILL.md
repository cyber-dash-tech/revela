---
name: revela-review
description: Open the Revela Review UI or read deck diagnostics for generated HTML deck artifacts in Codex.
---

# Revela Review

Use this skill when the user asks to review, diagnose, QA, or refine a generated Revela deck.

## Contract

- Review is the post-artifact surface for generated `decks/*.html`.
- A plain review request opens the Review UI.
- Diagnostics are read explicitly when the user asks for QA details, export readiness, or no-GUI output.
- Review UI is QA + Leave Comment / Apply. Insight/Inspect is removed from the public Review path.

## Preconditions

- A target `decks/*.html` file exists.
- If multiple deck candidates exist and the user did not specify one, choose the most recent or most clearly requested deck and state the choice.

## Inputs

- HTML deck path.
- Optional user review/refine intent.

## Workflow

1. Resolve the target `decks/*.html` file from the user request or unambiguous workspace state.
2. For a plain review request, call `revela_review_deck_open` and let the tool open the browser by default.
3. Use `revela_review_deck_read`, normally with `format: "markdown"`, only when the user explicitly asks for diagnostics, QA details, export readiness, or no-GUI output.
4. Do not call `revela_run_deck_qa` separately for a normal Review UI open.
5. Pure visual/layout/export fixes may patch artifacts directly when the user asks for a change, but read active design rules first with `revela_design_read` using `section: "rules"`.
6. Content changes that affect the deck argument should update `deck-plan.md` first, then remake the deck.

## Outputs

- Review UI URL/open state.
- Or Markdown/JSON diagnostics and current readiness summary.

## QA Notes

- `revela_review_deck_read` is read-only: it must not mutate deck HTML, `deck-plan.md`, assets, or compatibility state.
- `revela_review_deck_open` returns URL/token/open state and basic file metadata.
- Repair hard QA errors before treating a deck as review-ready.
- Deck slides must use `<section class="slide" ...>` with exactly one direct `.slide-canvas` child.
