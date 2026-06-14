---
name: revela
description: Route Revela requests to the right specialist workflow based on user intent and workspace state. Use when the user asks generally to use Revela, start or continue a Revela workflow, inspect next steps, or decide what to do from existing spec.md, researches/, deck-plan.md, or deck artifacts.
---

# Revela Router

Use this skill as the main Revela entrypoint in Codex. It should inspect intent and file-native workspace state, then route to the narrow specialist skill that owns the next action.

## Contract

- This is a non-mutating router.
- It may inspect runtime, active design/domain, and workspace artifact status.
- It must not write `spec.md`, save research findings, write `deck-plan.md`, generate deck HTML, open deck browser views, or export artifacts.
- Route quickly once the next workflow is clear.

## Required Tools

1. Call `revela_doctor` to inspect runtime and workspace status.
2. Call `revela_design_list` to identify the active design.
3. Call `revela_domain_list` to identify the active domain.
4. Read files only as needed to distinguish `spec.md`, `researches/`, `deck-plan.md`, `decks/*.html`, and `assets/` state.

## Routing Rules

- Custom visual system, design package, layout, component, or activation request: use `revela-design`.
- Custom narrative domain, industry guidance, evidence standard, or domain activation request: use `revela-domain`.
- No `spec.md`, unclear objective, missing audience, missing output target, or missing acceptance criteria: use `revela-spec`.
- `spec.md` exists but source support, material review, or findings are missing: use `revela-research`.
- `spec.md` and sufficient findings exist but `deck-plan.md` is missing or needs normal authoring: use `revela-research` Planning Handoff.
- Valid `deck-plan.md` exists and the user asks to make, generate, render, or update a deck: use `revela-make-deck`.
- Existing deck artifact and the user asks to review, annotate, diagnose, QA, or refine: use Codex Browser's native browsing/annotation flow. If the deck was not just generated, recommend opening the existing `decks/*.html` artifact in Codex Browser and using native annotations; route export requests to `revela-export`.
- Existing deck artifact and the user asks for PDF, PPTX, or PNG output: use `revela-export`.
- If the next step is still ambiguous after inspection, ask the smallest missing question and recommend the safest next specialist skill.

## Output

Report:

- Current workflow state: `spec.md`, `researches/`, `deck-plan.md`, `decks/*.html`, and `assets/`.
- Active design and active domain.
- The selected specialist skill and why.
- Any missing input that prevents routing.

## Must Not

- Do not write or patch files.
- Do not do external web research.
- Do not create or repair `spec.md` or `deck-plan.md`.
- Do not generate, annotate, patch, or export deck artifacts.
- Do not install or activate designs or domains; route those requests to `revela-design` or `revela-domain`.
