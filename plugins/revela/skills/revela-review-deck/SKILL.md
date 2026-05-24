---
name: revela-review-deck
description: Review Revela deck artifacts in Codex for technical validity, evidence trace, and narrative alignment.
---

# Revela Review Deck

Use this skill when the user asks to review, inspect, diagnose, or refine a generated Revela deck.

## Workflow

1. Resolve the target `decks/*.html` file from the user request or unambiguous workspace state.
2. For a plain request like `review decks/foo.html`, call `revela_review_deck_open` and let the tool open the browser by default.
3. Use `revela_review_deck_read`, normally with `format: "markdown"`, only when the user explicitly asks to diagnose, QA, read, check, inspect source alignment, inspect evidence trace, or avoid opening a GUI.
4. Use the read output as the deterministic diagnostics packet for artifact QA, deck-plan diagnostics, narrative/vault diagnostics, artifact coverage, and evidence trace.
5. Pass `openBrowser: false` only for tests, no-GUI environments, or when the user explicitly asks for a link instead of opening the page.
6. Do not call `revela_run_deck_qa`, `revela_compile_narrative`, or `revela_read_deck_plan` separately for a normal Review UI open.
7. Call `revela_run_deck_qa` separately only for focused low-level artifact QA, after a repair, or when the user explicitly asks for QA detail.
8. Separate technical blockers from narrative/evidence diagnostics.
9. Pure visual/layout/export fixes may patch artifacts directly when the user asks for a change. Meaning changes must update `revela-narrative/` first.

## Generated Visual Assets

- For Review Comment or Apply Fix requests such as adding an image, replacing a cover visual, creating a concept illustration, making a media block visual, or turning a slide idea into a flow/framework diagram, Codex may use the `imagegen` skill.
- Prefer `imagegen` for flow diagrams, framework diagrams, process visuals, system relationship maps, journey maps, before/after schematics, conceptual illustrations, abstract heroes, chapter dividers, background textures, non-evidence metaphor visuals, and visual drafts.
- Do not use generated images for source evidence, factual screenshots, real people, real places, real products, logos, data charts, tables, or visuals that need verifiable factual accuracy. Use workspace/source assets instead, or report the missing asset.
- If the visual needs exact editable text, precise data, axes, code, tables, or strict structure, patch the deck with HTML/CSS, ECharts, or `data-table` instead of `imagegen`.
- Generated images are artifact-level visual patches only. Do not add them to evidence, source materials, narrative support, or factual trace.
- If a generated image is referenced by deck HTML, move or copy the final asset into the workspace, preferably under `assets/<topic>/media/` or the project's existing asset directory. Deck HTML must reference a workspace-relative local path, never Codex's default generated-image path.

## QA Notes

- `revela_review_deck_read` is read-only: it must not mutate deck HTML, `revela-narrative/`, `deck-plan/`, assets, or compatibility state.
- `revela_review_deck_open` opens the local Review server from the MCP process and uses the Codex `codex-exec` bridge for Insight and Comment/Apply Fix. It returns URL/token/open state and basic file metadata, not aggregate diagnostics.
- `revela_run_deck_qa` may need browser-launch permission in Codex sandboxed sessions.
- Repair hard QA errors before treating a deck as review-ready.
- Text clipping should usually be fixed with typography and spacing changes, not by deleting evidence or changing claim meaning.
- A warning that a smoke/development artifact is not the active legacy deck target is non-blocking when the requested file passes hard artifact checks.

## Technical Blockers

Hard blockers are limited to missing or ambiguous files, invalid HTML contract, invalid slide identity, canvas/export failure, malformed Markdown/frontmatter, or unsafe writes.
