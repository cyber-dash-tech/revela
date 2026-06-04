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
3. Call `revela_design_list`, `revela_design_read` using `section: "rules"`, and `revela_design_inventory` before authoring or repairing `deck-plan/`; deck-plan layout/component names must come from the selected design inventory.
4. Call `revela_read_deck_plan` as the required deck-plan preflight before any HTML generation.
5. If `deck-plan/` is missing or incomplete, call `revela_upsert_deck_plan_slide` for each planned or changed slide before calling `revela_create_deck_foundation`; do not hand-write `deck-plan/slides/*.md`. Use only inventory-listed layouts/components, and provide slot, position, purpose, and exact content for every planned component.
6. Report deck-plan diagnostics before artifact generation, including stale narrative hashes, missing slide projections, missing evidence trace, caveats, malformed plan files, or layout/component names outside the active design inventory.
7. Do not start HTML generation from narrative alone unless the user explicitly asks for a throwaway diagnostic smoke deck.
8. For new HTML files, call `revela_create_deck_foundation`.
9. Before patching slide HTML, call `revela_read_deck_plan`, collect the layouts and components from the projection and `componentPlan[]`, then read the specific layouts/components with `revela_design_read_layout` and `revela_design_read_component`; fetch `section: "chart-rules"` and the `echart-panel` component before creating or changing ECharts. If the user asks to switch designs persistently, call `revela_design_activate`; if they ask for a one-off design, read that design by name, call `revela_design_inventory` with that name, pass `designName` to every `revela_upsert_deck_plan_slide` call, and pass `designName` to `revela_create_deck_foundation`.
10. Patch slides into the foundation between Revela slide markers. Preserve positive 1-based `data-slide-index` values. Every slide must use `<section class="slide" ...>` with exactly one direct `.slide-canvas` child.
11. Generate chapter by chapter. Keep the HTML valid after each write.
12. After every HTML write, call `revela_run_deck_qa` and repair hard errors before review or export.

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

Every deck plan should include Cover, Table of Contents, and Closing. Use 3-5 chapter headings, explicit slide ranges, narrative links, visual intent, evidence trace, and caveats.

`revela_upsert_deck_plan_slide` is the required slide-planning write path. For every slide, provide:

- `slideIndex`, optional stable `id`, `title`, `chapter`, `narrativeRole`, `structural`, and inventory-listed `layout`.
- `components[]` entries with inventory-listed `name`, semantic `slot`, kebab-case `position`, `purpose`, exact `content`, plus optional `claimIds`, `evidenceIds`, `sourceNotes`, `renderNotes`, and `placementNote`.
- `visualIntent`; if `visualIntent.component` is set, it must match one of the component plan names.
- `narrativeLinks` using canonical claim/evidence/risk/objection/gap ids. Non-structural slides should include at least one claim or evidence link.
