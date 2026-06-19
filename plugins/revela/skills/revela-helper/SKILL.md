---
name: revela-helper
description: Explain Revela, inspect the current Revela workspace status, and report active design/domain guidance in Codex. Use the revela router for workflow routing when the user wants to start or continue work.
---

# Revela Helper

Use this skill when the user asks what Revela is, what the current workspace state is, which design or domain is active, which Revela capabilities are available, or what the next step should be.

## Contract

- This is a read-only helper and orientation surface.
- `revela` is the main workflow router; this skill explains status and capabilities.
- It may inspect runtime, design, domain, and workspace artifact status.
- It must not perform research, write files, create `spec.md`, create `deck-plan.md`, generate decks, open deck browser views, or export artifacts.
- Keep the answer short and operational.

## Preconditions

- None. This skill can run in any workspace.

## Inputs

- User questions about Revela, current status, active design/domain, or next workflow step.
- Optional workspace context such as existing `spec.md`, `researches/`, `deck-plan.md`, `decks/*.html`, and `assets/`.

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
- Workspace artifact status: whether `spec.md`, `researches/`, `deck-plan.md`, `decks/*.html`, and `assets/` appear available.
- Recommended next step:
  - Custom visual system requested: use `revela-design`.
  - Custom narrative domain guidance requested: use `revela-domain`.
  - No `spec.md` or unclear objective: run `revela-spec`.
  - `spec.md` exists but no `researches/`: run `revela-research`.
  - Research exists but no `deck-plan.md`: continue `revela-research` to the Planning Handoff.
  - Valid `deck-plan.md` but no deck artifact: run `revela-make-deck`.
  - Existing deck artifact: run `revela-review` to open the HTML deck directly in Codex Browser, or run `revela-export` for PDF/PPTX/PNG.

## Must Not

- Do not write or patch files.
- Do not do external web research.
- Do not generate or repair `spec.md`.
- Do not generate or repair `deck-plan.md`.
- Do not generate, annotate, patch, or export deck artifacts.
- Do not create, install, or activate designs or domains; route those requests to `revela-design` or `revela-domain`.
