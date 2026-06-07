---
name: revela-make-deck
description: Plan and generate Revela HTML deck artifacts in Codex from researches, workspace materials, active design, and deck-plan files.
---

# Revela Make Deck

Use this skill when the user asks to plan, make, generate, or update a Revela deck. This skill owns both the Plan phase (`deck-plan.md`) and the Render phase (`decks/*.html`).

## Contract

- Deck execution planning comes from canonical `deck-plan.md`.
- Local materials, material reviews, `researches/`, `assets/`, and user intent provide source context.
- Active/requested design tools define valid layouts, slots, components, nesting hints, and HTML writing rules.
- Active/requested domain guidance may inform communication framing, but it is not source evidence.
- Generated artifacts live under `decks/*.html`.
- Do not require a Narrative Vault before planning or generating a deck.
- Do not skip `deck-plan.md` for normal deck generation.

## Preconditions

- Recommended: source-linked `researches/**/*.md` and reviewed workspace materials exist.
- If research is thin, the user may explicitly ask to continue with limited materials; then record source limitations in `deck-plan.md`.
- An active or user-requested design must be readable.

## Inputs

- `researches/**/*.md`
- Reviewed workspace materials and material review records.
- `assets/`
- User deck objective, audience, and constraints.
- Existing `deck-plan.md` when present.
- Active/requested design and optional active/requested domain.

## Required Design Tools

Before Plan phase authoring:

1. Call `revela_design_list`.
2. Call `revela_design_read` with `section: "rules"` for the active/requested design.
3. Call `revela_design_inventory`.

Before Render phase HTML writing:

1. Call `revela_read_deck_plan`.
2. Read the returned `htmlWritingBatches`.
3. Call `revela_design_read_layout` for each layout used in the current batch.
4. Call `revela_design_read_component` for each component used in the current batch.
5. Fetch chart rules before creating or modifying ECharts.

## Plan Phase

Use this phase when the user asks for a plan, outline, deck-plan, or when a make request lacks a valid `deck-plan.md`.

1. Inspect local materials, material reviews, existing research findings, assets, and user intent.
2. Read active/requested domain guidance only as framing context; never cite it as evidence.
3. Use design inventory to choose valid layouts, slots, components, and component nesting.
4. Write or repair `deck-plan.md` directly. Do not use structured upsert tools for normal plan authoring.
5. Call `revela_read_deck_plan` after writing or repairing `deck-plan.md`.
6. If diagnostics report layout, slot, component, `children`, or `sourceLinks` issues, patch the Markdown directly and call `revela_read_deck_plan` again.

## Deck Plan Requirements

Every normal deck plan should include Cover, Table of Contents, and Closing. Use 3-5 chapter headings, explicit slide ranges, and `---` slide separators under `## Slides`.

Each slide block must include:

- Slide title and role when relevant.
- `#### Content Plan`
- `#### Source Links` for materials, findings, assets, URLs, and caveats.
- `#### Design Plan`
- Selected layout from design inventory.
- Component plan using component names from design inventory.
- Valid slots from the selected layout.
- Valid component nesting hints, including `box.children` when multiple child components support one semantic idea.
- Unresolved inputs, source limitations, and user review notes instead of AI-authored caveat/risk judgement.

Do not duplicate the same child as both nested and top-level.

## Render Phase

Use this phase when the user asks to make, generate, render, or update an HTML deck.

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

- Plan-only request: `deck-plan.md`.
- Make/render request: `deck-plan.md` and `decks/*.html`.
- QA status and unresolved source/design limitations.

## Must Not

- Do not skip `deck-plan.md` for normal decks.
- Do not use design inventory names, slots, or components that were not returned by the active/requested design tools.
- Do not use a slot that does not belong to the selected layout.
- Do not patch more than 5 slide sections in one HTML write.
- Do not invent source links, quotes, URLs, page references, caveats, or licenses.
- Do not write remote image candidates directly into deck HTML; save them as workspace assets first.
- Do not require a Narrative Vault.
