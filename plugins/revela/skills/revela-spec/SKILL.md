---
name: revela-spec
description: Discover Revela artifact requirements and write a root-level spec.md before research or deck planning. Use when the user goal, audience, output type, constraints, acceptance criteria, or next workflow step is unclear or not yet captured.
---

# Revela Spec

Use this skill to turn user intent and available workspace context into a concise root-level `spec.md` demand contract.

## Contract

- `spec.md` is the canonical demand and task specification for Codex Revela.
- The spec answers what to build, for whom, why it matters, what constraints apply, and how success will be judged.
- Local materials may be inspected only to ground scope and identify available inputs.
- This skill does not own research findings, deck planning, deck rendering, Review, or Export.
- Ask the smallest missing high-impact questions after local inspection.

## Preconditions

- The user provides at least one of: objective, topic, audience, decision/action, source material, desired artifact, or open problem.
- If no local workspace exists, write the spec from user intent and mark material gaps explicitly.

## Inputs

- User objective, audience, decision/action, output type, language, style, constraints, and deadline when available.
- Existing workspace context: local materials, `researches/`, `deck-plan.md`, `decks/*.html`, `assets/`, active design, and active domain.

## Workflow

1. Call `revela_doctor` to inspect workspace state.
2. Call `revela_domain_list` to capture active narrative guidance.
3. Call `revela_design_list` to capture active design guidance.
4. Call `revela_prepare_local_materials` when local material awareness is needed for scope.
5. For Office/PDF sources, do not treat them as reviewed evidence unless extracted/read in a later `revela-research` workflow.
6. Ask only for missing information that materially changes the spec or next step.
7. Write or update root-level `spec.md`.
8. End by recommending the next specialist skill:
   - `revela-research` when sources or findings are needed.
   - `revela-make-deck` only when a valid `deck-plan.md` already exists and the spec does not require new source work.
   - `revela-design` or `revela-domain` when the spec requires custom guidance first.

## spec.md Requirements

`spec.md` must include these sections:

- `# Spec`
- `## Objective`
- `## Audience`
- `## Decision Or Action`
- `## Output`
- `## Language`
- `## Domain / Use Case`
- `## Design`
- `## Constraints`
- `## Available Materials`
- `## Known Gaps`
- `## Acceptance Criteria`
- `## Recommended Next Step`

Section expectations:

- `## Language`: output language, terminology preference, and localization notes.
- `## Domain / Use Case`: active or requested domain, business/use-case context, and decision context.
- `## Design`: active or requested design, visual direction, and brand/style constraints.

Use explicit `Unknown` or `Pending user input` entries instead of inventing requirements.

## Outputs

- Root-level `spec.md`.
- A short summary of open questions, source limitations, and the recommended next skill.

## Must Not

- Do not write `researches/**/*.md`.
- Do not write `deck-plan.md`.
- Do not write `decks/*.html`.
- Do not bind findings into a Narrative Vault or canonical evidence graph.
- Do not treat domain guidance or unreviewed local files as source evidence.
- Do not invent requirements, constraints, citations, source paths, URLs, numbers, licenses, or acceptance criteria.
