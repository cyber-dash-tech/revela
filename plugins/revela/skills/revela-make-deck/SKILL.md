---
name: revela-make-deck
description: Plan and generate Revela deck artifacts in Codex from deck-plan files and source-linked materials.
---

# Revela Make Deck

Use this skill when the user asks to plan, make, generate, or update a Revela deck.

## Source Authority

- Deck execution planning comes from `deck-plan/`.
- Local materials, material reviews, `researches/`, `assets/`, and user intent provide source context.
- Generated artifacts live under `decks/*.html`.
- Do not require a Narrative Vault before planning or generating a deck.

## Workflow

1. For planning requests, inspect local materials/reviews/research and use `revela_upsert_deck_plan_slide` for structured slide planning.
2. Call `revela_design_list`, `revela_design_read` with `section: "rules"`, and `revela_design_inventory` before selecting layouts/components.
3. Call `revela_read_deck_plan` before HTML generation. If `deck-plan/` is missing or invalid, create/update it first.
4. For new HTML files, call `revela_create_deck_foundation`.
5. Before patching slide HTML, read the specific layouts/components with `revela_design_read_layout` and `revela_design_read_component`; fetch chart rules before ECharts.
6. Patch slides into the foundation between Revela slide markers. Preserve positive 1-based `data-slide-index` values. Every slide must have exactly one direct `.slide-canvas` child.
7. Generate chapter by chapter. Keep the HTML valid after each write.
8. After every HTML write, call `revela_run_deck_qa` and repair hard errors before review or export.

## Deck Plan Requirements

Every normal deck plan should include Cover, Table of Contents, and Closing. Use 3-5 chapter headings, explicit slide ranges, source/finding links, visual intent, caveats, and unresolved inputs.
