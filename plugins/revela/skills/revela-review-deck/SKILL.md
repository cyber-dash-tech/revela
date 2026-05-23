---
name: revela-review-deck
description: Review Revela deck artifacts in Codex for technical validity, evidence trace, and narrative alignment.
---

# Revela Review Deck

Use this skill when the user asks to review, inspect, diagnose, or refine a generated Revela deck.

## Workflow

1. Resolve the target `decks/*.html` file from the user request or unambiguous workspace state.
2. Call `revela_read_deck_plan` if `deck-plan/` exists.
3. Call `revela_run_deck_qa` on the HTML artifact.
4. Compile the narrative with `revela_compile_narrative` when assessing source/evidence alignment.
5. Separate technical blockers from narrative/evidence diagnostics.
6. Pure visual/layout/export fixes may patch artifacts directly. Meaning changes must update `revela-narrative/` first.

## QA Notes

- `revela_run_deck_qa` may need browser-launch permission in Codex sandboxed sessions.
- Repair hard QA errors before treating a deck as review-ready.
- Text clipping should usually be fixed with typography and spacing changes, not by deleting evidence or changing claim meaning.
- A warning that a smoke/development artifact is not the active legacy deck target is non-blocking when the requested file passes hard artifact checks.

## Technical Blockers

Hard blockers are limited to missing or ambiguous files, invalid HTML contract, invalid slide identity, canvas/export failure, malformed Markdown/frontmatter, or unsafe writes.
