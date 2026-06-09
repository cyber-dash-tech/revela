---
name: revela-make-deck
description: Generate Revela HTML deck artifacts in Codex from an existing deck-plan.md and active design files.
---

# Revela Make Deck

Use this skill when the user asks to make, generate, render, or update a Revela HTML deck from an existing `deck-plan.md`.

## Contract

- Deck execution planning comes from canonical `deck-plan.md`.
- Local materials, material reviews, `researches/`, `assets/`, and user intent provide source context.
- Active/requested design tools define valid layouts, slots, components, nesting hints, and HTML writing rules.
- Active/requested domain guidance may inform communication framing, but it is not source evidence.
- Generated artifacts live under `decks/*.html`.
- Do not require a Narrative Vault before generating a deck.
- This skill does not own normal plan authoring; `revela-research` owns source preparation and `deck-plan.md` planning handoff.
- `deck-plan.md` is required for normal deck generation.

## Preconditions

- Required: readable `deck-plan.md`.
- An active or user-requested design must be readable.
- If `deck-plan.md` is missing, stop and tell the user to run `revela` for routing, `revela-spec` for missing requirements, or `revela-research` for the Planning Handoff.
- If `deck-plan.md` is structurally invalid, only repair technical plan diagnostics reported during render preflight.

## Inputs

- `researches/**/*.md`
- Reviewed workspace materials and material review records.
- `assets/`
- User deck objective, audience, and constraints.
- Existing `deck-plan.md`.
- Active/requested design and optional active/requested domain.

## Required Design Tools

Before render preflight:

1. Call `revela_design_list`.
2. Call `revela_design_read` with `section: "rules"` for the active/requested design.
3. Call `revela_design_inventory`.

Before HTML writing:

1. Call `revela_read_deck_plan`.
2. Read the returned `htmlWritingBatches`.
3. Call `revela_design_read_layout` for each layout used in the current batch.
4. Call `revela_design_read_component` for each component used in the current batch.
5. Fetch chart rules before creating or modifying ECharts.

## Plan Preflight And Repair

Call `revela_read_deck_plan` before HTML generation and treat the result as the render blueprint.

Allowed plan repairs are limited to technical diagnostics from `revela_read_deck_plan`:

- Broken Markdown/frontmatter structure.
- Invalid or missing `sourceLinks` field structure, without adding new unsupported source links.
- Layout, slot, component, or `children` names that do not match `revela_design_inventory`.
- Component nesting fixes such as using `box.children` when the selected component model requires nested semantic groups.

Do not redesign the argument structure, add new slides, remove supported slides, rewrite claims, or add source links that were not reviewed or saved by `revela-research`. If normal plan authoring is needed, stop and send the user back to `revela` routing or `revela-research` Planning Handoff.

## Render Phase

Use this phase when the user asks to make, generate, render, or update an HTML deck and `deck-plan.md` is readable.

1. Call `revela_read_deck_plan` before HTML generation and follow the current projection.
2. Read `htmlWritingBatches` before any HTML write. `revela_read_deck_plan` is QA/diagnostics, not a writer.
3. For new HTML files, call `revela_create_deck_foundation`.
4. Generate one `htmlWritingBatches` entry at a time.
5. A single HTML write/edit/apply_patch may add or rewrite at most 5 slide sections.
6. If a chapter is longer than 5 slides, use the consecutive batch parts returned by `revela_read_deck_plan`.
7. Patch slides into the foundation between Revela slide markers.
8. Preserve positive 1-based `data-slide-index` values.
9. Every slide must have exactly one direct `.slide-canvas` child.
10. Keep the HTML valid after each write.
11. After every HTML write, call `revela_run_deck_qa` and repair hard errors before continuing, review, or export.

## Outputs

- `decks/*.html`.
- Artifact QA status.
- Unresolved render/design issues and any plan diagnostics that require `revela-research` Planning Handoff.

## Must Not

- Do not skip or synthesize `deck-plan.md` for normal decks.
- Do not claim ownership of normal plan authoring.
- Do not write a new `deck-plan.md` when it is missing.
- Do not use design inventory names, slots, or components that were not returned by the active/requested design tools.
- Do not use a slot that does not belong to the selected layout.
- Do not patch more than 5 slide sections in one HTML write.
- Do not invent source links, quotes, URLs, page references, caveats, or licenses.
- Do not write remote image candidates directly into deck HTML; save them as workspace assets first.
- Do not require a Narrative Vault.
