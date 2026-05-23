---
name: revela-story
description: Inspect a Revela narrative graph in Codex without mutating artifacts or canonical meaning.
---

# Revela Story

Use this skill when the user asks to view, inspect, understand, or audit the current Revela story.

## Workflow

1. Call `revela_story_read` first, normally with `format: "markdown"`.
2. Use the returned deterministic map, diagnostics, narrative hash, and Markdown reading view as the authoritative Story surface.
3. Call `revela_markdown_qa` or `revela_compile_narrative` only when you need deeper structural diagnostics than `revela_story_read` returned.
4. If `revela_story_read.ok` is false because `revela-narrative/` is missing, report the init guidance. Do not create files from Story mode.
5. Present audience, belief shift, decision/action, thesis, central claims, evidence, objections, risks, research gaps, artifact coverage, and diagnostics.
6. Keep claim ids, evidence ids, source facts, quotes, URLs, numbers, and caveats exact.
7. Do not write claims, evidence, research gaps, deck HTML, deck-plan files, assets, or artifacts from Story mode.

## Output

Lead with the narrative status, narrative hash, and key diagnostics. Then show the claim flow and evidence boundaries.

Keep the reading evidence-first: for each claim, show source trace, support scope, unsupported scope, caveat, support strength, linked objections/risks, and remaining research gaps. Separate structural Markdown QA from evidence trust. Story is read-only; do not turn it into a mutation workflow.
