# AGENTS.md - Revela Agent Guide

> Current working guide for AI agents and developers in this repository.
> Historical implementation notes belong in `docs/AGENTS.archive.md`.
> Last updated: 2026-05-17 for 0.17.1 Story/Review/QA refinement release.

## Product Baseline

Revela is a narrative artifact workspace for high-stakes communication. It is not a generic AI slide maker.

Product promise:

**Turn source materials, research, data, and user intent into trusted, traceable, presentation-ready decision artifacts.**

Current baseline: `0.17.1`.

User-facing workflow:

```text
Init -> Research -> Story -> Make -> Review -> Export
System surface: Design
```

Decks are render targets. The durable core is source trust, canonical narrative state, evidence traceability, approval provenance, artifact coverage, and post-artifact reading/refinement.

## Non-Negotiable Product Rules

- `revela-narrative/` is the editable source of truth for communication meaning when present.
- Canonical narrative state (`NarrativeStateV1`) is the compiled internal interface for communication meaning.
- `DECKS.json` is compatibility/render state: source materials, actions, render targets, reviews, deck specs, approvals, and artifact coverage.
- Vault workspaces must not persist top-level `DECKS.json.narrative`; runtime `state.narrative` may still be hydrated as a compatibility projection.
- `.opencode/revela/narrative-cache/` contains regenerable compiled projections and diagnostics, not editable source.
- Saved research findings are not evidence support until explicit evidence nodes or bindings preserve source, quote/snippet, support scope, unsupported scope, caveat, and strength.
- Do not invent quotes, source paths, URLs, page references, caveats, claim ids, evidence ids, or artifact coverage.
- Missing evidence must stay visible as a gap instead of being filled by the model.
- `writeReadiness.status: "ready"` is deck/artifact readiness only. It is never narrative approval.
- Meaning changes update canonical narrative first, then readiness/approval or explicit override, then artifacts.
- Pure artifact polish may stay artifact-level: layout, typography, spacing, crop, visual hierarchy, export mechanics, deck contract fixes, and similar non-meaning changes.

## Current Command Surface

Primary commands:

- `/revela init`
- `/revela research`
- `/revela story`
- `/revela make --deck`
- `/revela make --brief`
- `/revela review --deck`
- `/revela export --deck pdf`
- `/revela export --deck pptx`
- `/revela enable`
- `/revela disable`
- `/revela design`
- `/revela domain`

Compatibility behavior:

- `/revela refine --deck` aliases `/revela review --deck` during the naming migration.
- `/revela edit` and `/revela inspect` should direct users to `/revela review --deck`.
- `/revela enable` and `/revela disable` are public session controls for Revela prompt/context injection.
- Revela starts enabled by default; `/revela disable` pauses prompt/context injection for the current session.
- Explicit workflow commands auto-enable Revela and choose the correct prompt mode even when Revela is disabled.
- State safety gates and write-after QA should remain active for controlled files/artifacts even when prompt injection is disabled.
- Blocking write-after QA and state-gate failures should be surfaced both in tool output and as concise user-visible notices.
- `/revela make --deck --desc "..."` is not implemented. Do not document it as supported until it exists.

## Workflow Principles

- Do not use long prompts as the workflow engine.
- Do not add eval because a roadmap item says "eval"; add deterministic boundaries only when they remove concrete prompt memory or unsafe LLM judgement.
- Prefer prompt-side authoring contracts, tool return contracts, Markdown QA feedback, state helpers, compiler diagnostics, and narrow hooks over generic workflow frameworks.
- Treat hooks as safety nets, not the primary authoring workflow.
- Use a prompt-before, QA-after control loop for Markdown authoring: prompts define the writing grammar up front, and hooks/tools return structured repair feedback after writes.
- If a hook repeatedly catches the same LLM-authored mechanical mistake, move the constraint into prompt-side authoring guidance and Markdown QA feedback.
- Use structured vault tools for narrow lifecycle or evidence-binding operations, not as a replacement for Markdown knowledge authoring.
- Add shared workflow/eval types only after at least two concrete boundaries need the same structure.
- Prompt lean-down should follow working tool boundaries, not precede them with abstract orchestration.

## Markdown Narrative Vault

Implemented 0.17 theme: **Markdown Narrative Vault**.

`revela-narrative/` is the visible, editable canonical narrative source when present. `compileNarrativeVault` compiles Markdown nodes deterministically into `NarrativeStateV1`; Story, Research, Make, Review, readiness, hashing, approval checks, and artifact coverage continue to consume that stable internal interface.

Initial vault shape:

```text
revela-narrative/
  index.md
  audience.md
  decision.md
  thesis.md
  claims/
  evidence/
  objections/
  risks/
  research-gaps/
```

Markdown authoring rules:

- `revela-narrative/**/*.md` is the LLM-editable knowledge workspace.
- The LLM may maintain loose Markdown nodes for claims, evidence, objections, risks, research gaps, and lightweight inline relations.
- The graph is generated by `compileNarrativeVault`, not hand-maintained as hidden JSON.
- Use valid node types: `index`, `audience`, `decision`, `thesis`, `claim`, `evidence`, `objection`, `risk`, `research-gap`.
- Each node has one leading frontmatter block. Do not append a second `---` block.
- Do not duplicate stable headings such as `## Evidence`, `## Caveats`, `## Relations`, `## Response`, or `## Mitigation`.
- Relation lines use valid relation labels plus plain node-id wikilinks, for example `- supports: [[claim-recommendation]]`.
- Do not use typed wikilink targets such as `[[claim:claim-recommendation]]`.
- Evidence nodes must preserve source trace, quote/snippet, support scope, unsupported scope, caveat, and strength.
- Wikilink relations are the preferred graph source. Frontmatter bindings such as `claimId`, `targetId`, and `evidenceBindingIds` remain compatibility fallbacks for existing vaults and helper inputs.

Current inline relation behavior:

- Keep graph edges in node Markdown as lightweight `## Relations` wikilinks so the vault remains readable and navigable.
- `compileNarrativeVault` generates deterministic canonical relation ids; the LLM never hand-writes relation ids.
- Relation rationale may be written inline after the target, for example `- supports: [[claim-recommendation]] - Rationale text.`
- Use relation sync QA to report dangling edges, unbound evidence/objections/risks/gaps, isolated central claims, invalid relation types, typed wikilinks, and frontmatter-only compatibility bindings at the right workflow checkpoints.
- `compileNarrativeVault` derives evidence, objection, risk, and research-gap bindings from wikilink relations first. Frontmatter bindings compile only as fallback compatibility and should receive migration guidance instead of being treated as ideal authoring.

Structured helper role:

- Structured vault actions are optional safety helpers, not the primary authoring model.
- Prefer helpers when they reduce schema risk or express a narrow lifecycle action: `bindResearchFindings`, `upsertVaultEvidence`, `upsertVaultResearchGap`, `updateVaultResearchGap`.
- Incomplete helper usage should fail clearly and point to both Markdown repair and optional helper alternatives.
- JSON-era mutation actions such as `upsertNarrative`, `upsertResearchGaps`, and `applyEvidenceCandidates` are blocked or compatibility-only in vault workspaces.

## Phase Semantics

`init` means repeatable workspace ingest, local grounding, and intent capture.

- Scan workspace materials and register source-material candidates.
- On first init, treat supported workspace files as ingest candidates; on later runs, ingest added/changed/newer-than-vault files.
- Use `revela-decks init` and `initNarrativeVault` as expected controlled state/vault boundaries; empty-looking optional tool fields are schema display noise.
- Follow `ingest.suggestedTasks` from `revela-decks init`: read directly for text/Markdown/CSV, extract then read for PDF/Office files.
- Distill stable findings from ingested files into `revela-narrative/**/*.md`; source-material records alone are candidate context, not proof.
- Intent briefs and proposals may support audience, decision, thesis, stakeholder framing, and stated internal intent; they do not prove external market, competitor, product, or operating-model claims.
- Ask the smallest missing intent questions after local evidence has been considered.
- Do not require slide count, design choice, layout choice, output path, or visual style unless the user asks to make an artifact immediately.

`research` means evidence gathering, binding, claim narrowing, and caveat reduction beyond the current workspace.

- Start from deterministic tool outputs: summary read, vault diagnostics, story readiness, `deriveResearchTargets`, and `evaluateResearchFindings` when findings exist.
- Prefer binding or narrowing from existing saved findings before external research.
- Save external research to `researches/**/*.md`; research subagents must not call `revela-decks`.
- Bind evidence only when source, quote/snippet, support scope, unsupported scope, strength, caveat, and supported claim context are explicit and the binding does not expand the claim. New evidence should express the graph with `## Relations` such as `- supports: [[claim-id]]`; `claimId` is fallback compatibility.
- Use `bindResearchFindings` for bindable findings; otherwise report missing fields or source mismatch.
- Safe claim narrowing may edit `claims/*.md` only when it preserves strategic meaning and evidence boundaries. Broader rewrites require Story/user confirmation.
- Never use `upsertNarrative` during research.

`story` means the read-only claim-flow reading surface.

- Show claim text, evidence, why evidence supports or does not fully support the claim, and immediate relation context.
- Do not reintroduce workflow dashboards, filters, per-claim command suggestions, or artifact coverage panels into Story UI.
- Display localization may translate selected-claim cards, but must preserve claim ids, relation endpoints, source facts, quotes, findings paths, URLs, numbers, and canonical evidence boundaries.
- Do not write artifacts from Story mode.

`make --<target>` means render artifacts from canonical narrative state.

- Supported targets are `--deck` and `--brief`.
- Check story readiness, approval state, stale approval, and explicit render override before rendering.
- Deck rendering compiles slide specs from narrative claims/evidence and then runs deck/artifact gates plus HTML contract protections.
- Brief rendering compiles from canonical narrative state and graph-backed claim/evidence relationships, not from a deck summary.

`review` means post-artifact reading, inspection, commenting, and asset-assisted editing.

- Comment is the mutation path for targeted deck changes and includes Local Assets/Search Assets.
- Insight is read-only and explains source, support strength, caveat, unsupported scope, narrative purpose, related risks/objections, research gaps, and artifact coverage.
- Pure visual/layout/export edits may patch artifacts directly after normal safety checks.
- Meaning-changing edits must update narrative state first and then re-make artifacts.

## Current 0.17 Completed Baseline

0.17 is release-verified. Keep this section concise; detailed release archaeology belongs in `docs/AGENTS.archive.md`.

- Markdown Narrative Vault compiler/parser/cache/source loading.
- Plugin-side vault auto-compile and Markdown QA after vault Markdown writes.
- No persisted top-level `DECKS.json.narrative` in vault workspaces; runtime hydration remains for compatibility.
- Top-level `narrativeApprovals` preserves approval provenance outside the persisted narrative mirror.
- Init ingest buckets with `ingest.suggestedTasks` and workspace source-material registration.
- JSON narrative migration/export to Markdown vault.
- Story/Research/Make/Review prompt contracts surface vault diagnostics before trust/rendering decisions.
- Research target derivation, findings binding eval, and safe evidence binding helpers.
- Deterministic deck plan compiler v2 and focused read-only Story UI.
- Initial vault helpers plus JSON-era mutation blocking in vault workspaces.
- Inline node `## Relations` replaced `relations.md`; compiler-generated deterministic relation ids and layered relation QA are in place.
- Wikilink-first graph baseline: relation-derived canonical bindings take precedence over frontmatter fallback, research gaps can depend on evidence nodes and derive claim context through evidence, helpers write `## Relations`, and inventory/Markdown QA warn on frontmatter-only bindings.
- Release gate passed after folding wikilink-first graph into the 0.17.0 baseline: fresh init smoke, Markdown QA repair feedback, inventory-first authoring, vault compile persistence, `bun test`, `bun run typecheck`, and `npm pack --dry-run`.
- 0.17.1 refinement baseline: evidence-first Story UI with claim/evidence/gap reading, localized research-gap display questions, cleaner Story card typography/layout, saved Review asset state and remote-image download fallbacks, deterministic deck visual intent planning, deck QA navigation checks, and deck QA semantic overlap detection.
- 0.17.1 release gate passed: `bun test` (534 tests), `bun run typecheck`, and `npm pack --dry-run` for `@cyber-dash-tech/revela@0.17.0` before version bump.

## Wikilink-First Vault Graph

Goal: keep the 0.17.0 Markdown vault graph authoring model Obsidian-style and wikilink-first.

Human authors and LLMs should express graph meaning primarily through node-local `## Relations` sections with plain `[[node-id]]` wikilinks. `compileNarrativeVault` derives canonical `NarrativeStateV1` fields from those links before falling back to frontmatter bindings such as `claimId`, `targetId`, and `evidenceBindingIds`.

Target mental model:

```text
claim-a.md
  <- supports <- evidence-a.md  (`- supports: [[claim-a]]`)
  <- derived through evidence <- gap-a.md (`- depends_on: [[evidence-a]]`)
```

Canonical relation syntax:

```md
## Relations

- supports: [[claim-a]] - Optional rationale.
- depends_on: [[evidence-a]]
- constrains: [[claim-b]]
- answers: [[objection-a]]
```

Do not use `[[supports:claim-a]]`; Obsidian treats that as a page id instead of a typed edge to `claim-a`.

### Completed Implementation

- ~~Compiler: wikilink relations are the first source for evidence, objection, risk, and research-gap bindings; frontmatter fields are fallback only.~~
- ~~Evidence: `evidence -> supports -> claim` derives `NarrativeEvidenceBinding.claimId`.~~
- ~~Objection: `objection -> answers/contrasts_with -> claim` derives `claimId`.~~
- ~~Risk: `risk -> constrains -> claim` derives `claimId`.~~
- ~~Research gaps: `gap -> depends_on -> claim/evidence/objection/risk`; gap-to-evidence links preserve the evidence id and derive claim context through the evidence support relation when available.~~
- ~~`NarrativeResearchGapTargetType` was not extended to `evidence`; canonical gaps keep schema compatibility by storing evidence dependencies in `evidenceBindingIds` and deriving `targetType: "claim"` when evidence supports a claim.~~
- ~~Inventory: relation coverage explains official wikilink relations and compatibility-only frontmatter bindings, with migration hints for fallback-only nodes.~~
- ~~Markdown QA: warns when nodes rely only on frontmatter bindings; still blocks dangling wikilinks, invalid relation labels, typed wikilinks, and unbound nodes at readiness/render strictness.~~
- ~~Prompts and `authoringContract`: require new evidence/gaps/risks/objections to write `## Relations`; source trace fields remain separate from graph links.~~
- ~~Helpers: `upsertVaultEvidence`, `bindResearchFindings`, `upsertVaultObjection`, `upsertVaultRisk`, and research-gap helpers write appropriate `## Relations` while preserving compatibility frontmatter where needed.~~

### Verification Status

- ~~Focused tests cover relation-derived evidence binding, gap-to-evidence binding, fallback compatibility warnings, prompt requirements, helper relation writing, and QA blockers for broken links.~~
- ~~`bun run typecheck` passes.~~
- ~~Full `bun test` passes: 522 tests, 0 failures.~~
- ~~`npm pack --dry-run` passes for `@cyber-dash-tech/revela@0.17.0` with 157 package files.~~

## Post-0.17 Candidates

- Coverage-driven make/review/remake decisions using artifact coverage and narrative hash staleness.
- 0.17.2 Claim-as-Chapter Deck Planning Contract:
  - Prompt contract: teach `init` and `research` that central claims should be chapter-ready, meaning each central claim can support framing/context, proof/evidence, implication/decision relevance, and explicit boundary/gap/risk material. Do not ask for slide count or design during init/research, but avoid promoting small evidence fragments into central claims when they cannot sustain a chapter.
  - Research contract: derive targets from claim-chapter sufficiency, not only missing source support. Each central claim should aim for framing/background support, 1-2 evidence bindings or cases/quantitative signals, and implication/risk/boundary material. Keep weak chapter support visible as canonical research gaps instead of inventing filler.
  - Make-deck contract: `/revela make --deck` plan should be claim-led. Each central claim becomes one chapter unless explicitly merged, and each claim chapter should have at least three non-structural slides: claim framing, evidence/proof, and implication/boundary. Cover, TOC, and Decision Ask/Closing are structural and do not count toward the three-slide claim chapter minimum.
  - Compiler contract: update `lib/narrative-state/render-plan.ts` from one-claim-one-slide to one-central-claim-one-chapter by generating `claimFramingSlide`, `claimEvidenceSlide`, and `claimImplicationSlide` per central claim while preserving visual intent, evidence bindings, claim refs, and chapter metadata.
  - Plan quality: add checks such as `claim_chapters_present`, `claim_chapters_min_three_slides`, and `claim_chapter_evidence_visible`. If a claim cannot support a three-slide chapter, stop at plan review with a merge/research/scope-narrowing/shorter-chapter decision instead of creating sparse filler.
  - Tests: update `tests/narrative-state.test.ts` to assert central-claim chapters, minimum three slides per claim chapter, TOC/chapter alignment, visible evidence gaps when support is missing, and preserved `content.data.visualIntent` plus `visuals[]`.
- `/revela make --deck --desc "..."` decisioning, either explicitly unsupported or implemented as intent seeding that does not bypass grounding/readiness/approval.
- Product positioning and docs cleanup: decks are render targets from trusted narrative state, not the durable source of truth.
- Review Prep/Rehearsal, Audience Lens, and Meeting Prep Pack. Reuse inspection context first and keep exploratory outputs read-only.

## Tool And State Rules

- Do not patch `DECKS.json` directly. Use `revela-decks` actions or internal state helpers.
- Do not patch generated cache files as source. Edit `revela-narrative/**/*.md` for narrative meaning and regenerate compiled projections.
- Edits to `revela-narrative/**/*.md` trigger plugin-side compile/guard reporting through write/edit/apply_patch hooks.
- `revela-research-save` writes findings markdown under `researches/{topic}/{filename}.md`; it does not automatically make findings canonical support.
- `revela-decks attachResearchFindings` attaches a workspace-relative findings file to a matching research axis. It does not mutate slide evidence or deck HTML.
- `revela-decks applyEvidenceCandidates` and evidence-status services are compatibility-only. Canonical support should be created through `revela-narrative/evidence/*.md` or `bindResearchFindings`, then compiled.
- `revela-workspace-scan` discovers candidate documents and records provenance when possible; scan actions are not proof.
- `revela-extract-document-materials` writes extraction cache under `.opencode/revela/doc-materials/{fingerprint}/` and updates `workspace.sourceMaterials` when `DECKS.json` exists.
- `revela-media-save` and `revela-media-batch-save` promote image leads into workspace assets under `assets/<topic>/media/` and update the media manifest.
- Review asset search results are remote candidates only until saved. Deck HTML should reference saved workspace asset paths, never remote candidate URLs or `/__revela_asset` proxy URLs.
- Inspection/result tools submit structured JSON for browser UI. Do not rely on assistant Markdown parsing for Review UI state.
- Design tools may read active design sections/components/layouts from `~/.config/revela`. Do not inject full design context outside deck-render flows.

## Deck Render Grammar

Use the current simplified built-in design grammar:

- `box` - card/group primitive for one idea, case, evidence item, metric, objection, risk, or action.
- `text-panel` - title/body/bullets/source-note language module.
- `media` - normal image/screenshot/diagram/logo/portrait component.
- `echart-panel` - chart frame and caption/source structure.
- `data-table` - structured table component.
- `steps` - process or phase sequence.
- `roadmap-horizontal` and `roadmap-vertical` - dated phases, milestones, historical evolution, or future plans.
- `hero` - full-bleed cover, section divider, closing, or strong visual statement.
- `stat-card`, `quote`, and `toc` - defined pattern components.
- `page-number` and `brand-watermark` - utilities.

Composition hierarchy:

```text
layout -> box/card -> text-panel + media/chart/table/stat/quote
```

Rules:

- Use layouts for page-level structure.
- Use `box` for semantic cards/groups.
- Use `text-panel` for language, not as a whole-page narrative concept.
- Put `media`, `echart-panel`, or `data-table` inside a `box` when they support the same idea as the text.
- Use `hero` only for cover/divider/closing visuals; never use it inside a `box` or for screenshots, charts, tables, diagrams, or source evidence that must stay readable.
- Do not expose `image-title`, `media--cover`, `editorial-*`, `flow-*`, `timeline-journey-*`, or `svg-motif` as primary component choices.

## Review Asset Rules

Use a three-stage model:

```text
remote candidate -> workspace asset -> deck usage
```

- Remote candidates are search results only. They are not durable workspace state and must not be written directly into deck HTML.
- Workspace assets are saved local files plus manifest metadata. Deck HTML should reference workspace-relative local paths, not remote URLs or Review/Refine proxy URLs.
- Deck usage is artifact-level visual placement unless the image is explicitly source evidence.
- Preserve source URL, source page URL, provider, license, attribution, alt text, purpose, and dimensions when known. Never invent missing licensing or attribution fields.
- License-unknown assets may be used as visual drafts only when clearly marked; do not imply commercial clearance.
- Logo assets should remain small, clear, and brand-like; do not use them as decorative backgrounds.
- Screenshots, diagrams, charts, and evidence images must remain readable and should not be converted into decorative hero imagery.

## Prompt Modes

- Default prompt mode is narrative mode from `skill/NARRATIVE_SKILL.md`.
- Deck-render mode uses legacy deck/render instructions from `skill/SKILL.md` plus the active design layer.
- Full domain guidance is narrative-only and is not injected into deck-render mode.
- `init`, `research`, `story`, `review`, `remember`, and ambient Revela chat use narrative mode.
- `make --deck`, deck artifact review, deck HTML generation, PDF/PPTX implications, layout/component fetching, and design QA use deck-render mode.
- Session-scoped command intent is one-shot. Clear pending intent after appending it to the system prompt.
- Prefer plugin/tool output over expanding prompts when a repeated rule can be computed from state.

## Key Files

| Area | Files |
| --- | --- |
| Plugin routing | `plugin.ts`, `lib/commands/*` |
| Prompt building | `lib/prompt-builder.ts`, `skill/NARRATIVE_SKILL.md`, `skill/SKILL.md` |
| Workspace state | `lib/decks-state.ts`, `lib/workspace-state/*`, `tools/decks.ts` |
| Narrative state | `lib/narrative-state/*`, especially `render-plan.ts` |
| Narrative vault | `lib/narrative-vault/*` |
| Research/source materials | `tools/workspace-scan.ts`, `tools/extract-document-materials.ts`, `tools/research-save.ts`, `lib/source-materials.ts` |
| Review/refine/inspect | `lib/refine/*`, `lib/inspect/*`, `lib/inspection-context/*`, `tools/inspection-result.ts` |
| Media assets | `lib/media/*`, `tools/media-save.ts`, `tools/media-batch-save.ts`, `tools/research-images-list.ts` |
| Artifact export/QA | `lib/deck-html/contract.ts`, `lib/qa/*`, `lib/pdf/export.ts`, `lib/pptx/export.ts`, `tools/pdf.ts`, `tools/pptx.ts` |
| Design/domain system | `lib/design/designs.ts`, `lib/domain/domains.ts`, `tools/designs.ts`, `tools/designs-author.ts`, `tools/domains.ts`, `designs/*`, `domains/*` |
| User docs | `README.md`, `README.zh-CN.md` |

## Engineering Workflow

- `main` must stay releasable. Use a dedicated branch for non-trivial work.
- Use `feature/*` for product work, `fix/*` for bug fixes, and `spike/*` or `experiment/*` for uncertain exploration.
- Never revert or overwrite unrelated user changes.
- Do not use destructive git commands unless explicitly requested.
- Do not commit unless the user explicitly asks.
- Prefer small, correct changes over broad rewrites.
- Use `apply_patch` for manual edits.
- Default to ASCII unless the file already uses non-ASCII or the content requires it.

## Verification

Use the smallest meaningful verification first, then expand when release risk warrants it.

Common checks:

```bash
bun run typecheck
bun test
npm pack --dry-run
```

Focused tests are preferred during development when they cover the changed module. Run the full suite before release, command-surface changes, state migrations, prompt-mode changes, or export/QA changes.

Current README badges report 451 passing tests. Re-run tests before changing this number in docs or badges.

## Release SOP

Pre-release gate:

```bash
bun test
bun run typecheck
npm pack --dry-run
```

Version and publish through GitHub Actions:

```bash
npm version patch   # or minor / major
git push origin main --tags
```

The `v*` tag triggers `.github/workflows/publish.yml`, which runs tests/typecheck and publishes to npm with `NPM_TOKEN`.

After every release, update `AGENTS.md` to reflect the new product baseline, command surface, known limits, and current agent rules. Archive release archaeology in `docs/AGENTS.archive.md` instead of letting this guide grow.

Do not bump versions or publish without an explicit release request.

## Historical Reference

Use `docs/AGENTS.archive.md` only when you need detailed release archaeology, old OpenCode plugin API notes, or legacy implementation history. Prefer this file for current decisions and behavior.
