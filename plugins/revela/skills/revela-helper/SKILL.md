---
name: revela-helper
description: Explain Revela, inspect the current Revela workspace status, and report active design/domain guidance in Codex.
---

# Revela Helper

Use this skill when the user asks what Revela is, what the current workspace state is, which design or domain is active, which Revela capabilities are available, or what the next step should be.

## Contract

- This is a read-only helper and orientation surface.
- It may inspect runtime, design, domain, and workspace artifact status.
- It must not perform research, write files, create `deck-plan.md`, generate decks, open Review UI, or export artifacts.
- Keep the answer short and operational.

## Preconditions

- None. This skill can run in any workspace.

## Inputs

- User questions about Revela, current status, active design/domain, or next workflow step.
- Optional workspace context such as existing `researches/`, `deck-plan.md`, `decks/*.html`, and `assets/`.

## Required Tools

1. Call `revela_doctor` to inspect the running Revela runtime and workspace.
2. Call `revela_design_list` to identify the active design and available designs.
3. Call `revela_domain_list` to identify the active domain and available domains.
4. Use `revela_design_read` or `revela_domain_read` only when the user asks for design/domain detail or when a concise summary is needed to recommend the next workflow.

## Output

Report:

- What Revela does: trusted, traceable, deck-first decision artifacts from local materials, research, data, and user intent.
- Runtime/version status from `revela_doctor`.
- Active design and active domain.
- Workspace artifact status: whether `researches/`, `deck-plan.md`, `decks/*.html`, and `assets/` appear available.
- Recommended next step: `revela-research`, `revela-make-deck`, `revela-review`, or `revela-export`.

## Must Not

- Do not write or patch files.
- Do not do external web research.
- Do not generate or repair `deck-plan.md`.
- Do not generate, review, patch, or export deck artifacts.
