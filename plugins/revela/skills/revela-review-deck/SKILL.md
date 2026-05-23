---
name: revela-review-deck
description: Review Revela deck artifacts in Codex for technical validity, evidence trace, and narrative alignment.
---

# Revela Review Deck

Use this skill when the user asks to review, inspect, diagnose, or refine a generated Revela deck.

## Workflow

1. Resolve the target `decks/*.html` file from the user request or unambiguous workspace state.
2. Call `revela_review_deck_read` first, normally with `format: "markdown"`.
3. Use the returned artifact QA, deck-plan diagnostics, narrative/vault diagnostics, artifact coverage, and evidence trace as the deterministic Review reading packet.
4. Call `revela_run_deck_qa` separately only for focused low-level artifact QA, after a repair, or when the aggregate tool output needs deeper QA detail.
5. Separate technical blockers from narrative/evidence diagnostics.
6. Pure visual/layout/export fixes may patch artifacts directly when the user asks for a change. Meaning changes must update `revela-narrative/` first.

## QA Notes

- `revela_review_deck_read` is read-only: it must not mutate deck HTML, `revela-narrative/`, `deck-plan/`, assets, or compatibility state.
- `revela_run_deck_qa` may need browser-launch permission in Codex sandboxed sessions.
- Repair hard QA errors before treating a deck as review-ready.
- Text clipping should usually be fixed with typography and spacing changes, not by deleting evidence or changing claim meaning.
- A warning that a smoke/development artifact is not the active legacy deck target is non-blocking when the requested file passes hard artifact checks.

## Technical Blockers

Hard blockers are limited to missing or ambiguous files, invalid HTML contract, invalid slide identity, canvas/export failure, malformed Markdown/frontmatter, or unsafe writes.
