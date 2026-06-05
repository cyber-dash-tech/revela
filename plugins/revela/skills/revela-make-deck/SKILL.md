---
name: revela-make-deck
description: Plan and generate Revela deck artifacts in Codex from deck-plan files and source-linked materials.
---

# Revela Make Deck

Use this skill when the user asks to plan, make, generate, or update a Revela deck.

## Source Authority

- Deck execution planning comes from canonical `deck-plan.md`.
- Local materials, material reviews, `researches/`, `assets/`, and user intent provide source context.
- Generated artifacts live under `decks/*.html`.
- Do not require a Narrative Vault before planning or generating a deck.

## Workflow

1. For planning requests, inspect local materials/reviews/research, then write or repair `deck-plan.md` directly. Do not use structured upsert tools for normal plan authoring.
2. Call `revela_design_list`, `revela_design_read` with `section: "rules"`, and `revela_design_inventory` before selecting layouts/components; use the returned layout slots and component nesting hints in `deck-plan.md`.
3. Call `revela_read_deck_plan` after writing or repairing `deck-plan.md`. If diagnostics report layout, slot, component, `children`, or `sourceLinks` issues, patch the Markdown directly and call `revela_read_deck_plan` again.
4. Call `revela_read_deck_plan` before HTML generation and follow the current projection. `revela_read_deck_plan` is QA/diagnostics, not a writer.
5. For new HTML files, call `revela_create_deck_foundation`.
6. Before patching slide HTML, read the specific layouts/components with `revela_design_read_layout` and `revela_design_read_component`; fetch chart rules before ECharts.
7. Patch slides into the foundation between Revela slide markers. Preserve positive 1-based `data-slide-index` values. Every slide must have exactly one direct `.slide-canvas` child.
8. Generate chapter by chapter. Keep the HTML valid after each write.
9. After every HTML write, call `revela_run_deck_qa` and repair hard errors before review or export.

## Deck Plan Requirements

Every normal deck plan should include Cover, Table of Contents, and Closing. Use 3-5 chapter headings, explicit slide ranges, `sourceLinks` for materials/findings/assets/URLs/caveats, visual intent, caveats, and unresolved inputs. Use `box.children` when multiple child components support one semantic idea; do not duplicate the same child as both nested and top-level.
