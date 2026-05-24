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
3. Call `revela_read_deck_plan` as the required deck-plan preflight before any HTML generation.
4. If `deck-plan/` is missing or incomplete, author or repair `deck-plan/index.md` and `deck-plan/slides/*.md` before calling `revela_create_deck_foundation`.
5. Report deck-plan diagnostics before artifact generation, including stale narrative hashes, missing slide projections, missing evidence trace, caveats, or malformed plan files.
6. Do not start HTML generation from narrative alone unless the user explicitly asks for a throwaway diagnostic smoke deck.
7. For new HTML files, call `revela_create_deck_foundation`.
8. Read active design guidance with `revela_design_list` and `revela_design_read` when choosing layouts/components. If the user asks to switch designs persistently, call `revela_design_activate`; if they ask for a one-off design, read that design by name and pass `designName` to `revela_create_deck_foundation`.
9. Patch slides into the foundation between Revela slide markers. Preserve positive 1-based `data-slide-index` values.
10. Generate chapter by chapter. Keep the HTML valid after each write.
11. After every HTML write, call `revela_run_deck_qa` and repair hard errors before review or export.

## Generated Visual Assets

- Codex may use the `imagegen` skill for deck-level visual assets when a slide's visual intent calls for an image or diagram and no suitable workspace/source asset exists.
- Prefer `imagegen` for flow diagrams, framework diagrams, process visuals, system relationship maps, journey maps, before/after schematics, conceptual illustrations, abstract heroes, chapter dividers, background textures, non-evidence metaphor visuals, and visual drafts.
- Do not use generated images for source evidence, factual screenshots, real people, real places, real products, logos, data charts, tables, or visuals that need verifiable factual accuracy.
- If the visual needs exact editable text, precise data, axes, code, tables, or strict structure, build it with HTML/CSS, ECharts, or `data-table` instead of `imagegen`.
- Generated images are artifact-level visuals only. Do not treat them as evidence, source materials, quote support, or factual proof.
- If a generated image is referenced by deck HTML, move or copy the final asset into the workspace, preferably under `assets/<topic>/media/` or the project's existing asset directory. Deck HTML must reference a workspace-relative local path, never Codex's default generated-image path.

## QA Repair Loop

- `revela_run_deck_qa` launches a browser. In sandboxed Codex sessions, this may require user-approved command escalation.
- If QA reports `text_overflow` or `text_clipped`, reduce font size, line length, padding, or line-height before changing narrative meaning.
- Prefer conservative cover and section-title sizing in smoke or diagnostic decks.
- If QA reports that a standalone smoke artifact is not the active legacy deck target, treat it as a non-blocking warning when slide identity and canvas checks pass.

## Deck Plan Requirements

Every deck plan should include Cover, Table of Contents, and Closing. Use 3-5 chapter headings, explicit slide ranges, low-fidelity layout sketches, narrative links, visual intent, evidence trace, and caveats.
