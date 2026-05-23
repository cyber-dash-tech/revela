---
name: revela-research
description: Research Revela story gaps and bind evidence in Codex while preserving explicit source boundaries.
---

# Revela Research

Use this skill when the user asks to research, close evidence gaps, evaluate saved findings, or bind support to current Revela claims.

## Contract

- Saved findings in `researches/**/*.md` are not canonical evidence until specific evidence nodes or bindings preserve source trace, quote/snippet, support scope, unsupported scope, caveat, and strength.
- Missing evidence must stay visible as a gap.
- Do not broaden claims to fit a source.
- Do not write deck artifacts during research.

## Workflow

1. Call `revela_compile_narrative` and `revela_markdown_qa`.
2. Inspect central claims, weak evidence, objections, risks, and open research gaps.
3. Prefer existing saved findings before external research.
4. When a finding is bindable, create or update `revela-narrative/evidence/*.md` with explicit source trace and a `## Relations` line such as `- supports: [[claim-id]]`.
5. If a finding is incomplete, report missing fields instead of inventing them.
6. Use web research only when the user allowed or requested external research and the gap is publicly researchable.
7. After narrative edits, call `revela_markdown_qa` and `revela_compile_narrative`.
8. Report evidence bound, unbound findings, remaining caveats, and the next smallest story action.

## Binding Criteria

Bind only when the supported claim exists and the evidence includes:

- source URL/path/findings file
- quote or traceable snippet
- support scope
- unsupported scope
- caveat
- strength
- explicit supported claim context

