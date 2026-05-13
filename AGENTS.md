# AGENTS.md - Revela Agent Guide

> Current working guide for AI agents and developers in this repository.
> Historical implementation notes belong in `docs/AGENTS.archive.md`.
> Last updated: 2026-05-13 after the 0.16.1 Story workbench and command handoff slices.

## Product Baseline

Revela is a narrative artifact workspace for high-stakes communication. It is not a generic AI slide maker.

Product promise:

**Turn source materials, research, data, and user intent into trusted, traceable, presentation-ready decision artifacts.**

Current baseline: `0.15.4`.

User-facing workflow:

```text
Init -> Research -> Story -> Make -> Review -> Export
System surface: Design
```

Decks are render targets. The durable core is source trust, canonical narrative state, evidence traceability, approval provenance, artifact coverage, and post-artifact reading/refinement.

## Active Product Rules

- Canonical narrative state is the source of truth for communication meaning.
- Artifacts such as HTML decks, PDF, PPTX, executive briefs, speaker notes, appendix material, and future interactive pages are render targets from the same workspace state.
- `DECKS.json` is the current compatibility workspace-state store for source materials, narrative state, research gaps, evidence bindings, actions, render targets, review snapshots, deck specs, and artifact coverage.
- `writeReadiness.status: "ready"` is deck/artifact readiness only. It is never narrative approval.
- Saved research findings are not evidence support until explicitly attached to research state or bound to canonical narrative/slide evidence.
- Do not invent quotes, source paths, URLs, page references, caveats, claim ids, evidence ids, or artifact coverage.
- Missing evidence must stay visible as a gap instead of being filled by the model.
- Content-meaning changes must update canonical narrative first, then run narrative readiness/approval or explicit override, then update or re-make artifacts.
- Pure artifact polish may stay artifact-level: layout, typography, spacing, crop, visual hierarchy, export mechanics, deck contract fixes, and similar non-meaning changes.
- Review is the unified post-artifact workspace for reading, insight, targeted commenting, and local asset-assisted visual edits. `/revela review --deck` is the public entry.
- `/revela refine --deck` remains a compatibility alias during the naming migration. `/revela inspect` and `/revela edit` should show migration help.
- Interactive reading and exploratory cards are bounded reading aids, not official artifact mutations and not generic chat.

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
- `/revela design`
- `/revela domain`

Deprecated compatibility aliases should return migration/help text instead of executing legacy behavior, except `/revela refine --deck`, which aliases `/revela review --deck` during the naming migration.

Slash commands are explicit entry points, not the only workflow. Explicit workflow commands auto-enable Revela and choose the correct prompt mode.

## Phase Semantics

`init` means workspace discovery, local grounding, and intent capture.

- Scan the workspace and register source-material candidates.
- Reuse `workspace.sourceMaterials` and existing extraction cache before re-reading local documents.
- Extract or read selected relevant local materials when useful.
- Derive initial claims, evidence bindings, caveats, unsupported scope, and source trace only when explicit support exists.
- Ask the smallest missing intent questions after local evidence has been considered.
- Do not require slide count, design choice, layout choice, output path, or visual style unless the user explicitly asks to make an artifact immediately.

`research` means closed-loop research, evidence binding, claim narrowing, and caveat reduction beyond the current workspace.

- Drive research from open story gaps, unsupported central claims, objections, risks, or decision questions.
- Also treat unattached findings, weak evidence, unsupported scope, and claim-chain gaps as research targets.
- Prefer binding or narrowing from existing saved findings before starting new external research.
- Avoid generic internet research when workspace evidence already supports the claim.
- Save findings through research tools, attach findings, and bind evidence automatically when binding criteria are met.
- `/revela research` authorizes automatic binding only when source, quote/snippet, support scope, unsupported scope, strength, and caveat are explicit and the binding does not expand the claim.
- Ask for user confirmation only for strategic meaning changes, central claim deletion/rewrite, suspicious or weak sources, packaging partial evidence as strong, or approving the resulting narrative.
- Preserve source path, URL, location/page/sheet/slide, quote/snippet, support scope, unsupported scope, and caveat.

`story` means open the read-only story workspace UI.

- Show audience, decision/action, thesis, claim flow, evidence strength, unsupported scope, caveats, objections, risks, research gaps, artifact coverage, approval state, and next actions.
- Story workbench next-action decisions are deterministic from canonical state. The LLM may localize or organize display copy only; it must not decide readiness, evidence status, artifact coverage, or recommended commands.
- Workbench filters cover missing evidence, partial/weak evidence, non-current artifacts, open gaps, risks, and high-priority objections.
- Per-claim next actions include research this gap, attach findings, narrow claim, approve narrative, make deck, and remake stale artifact.
- Artifact coverage work items show affected claims, affected slides, missing required claims, coverage status, status note, and recommended command.
- Workbench summary shows narrative approval, evidence blocker count, aggregate artifact status, and the deterministic primary next command.
- Command handoff rules distinguish HTML deck from derived exports: non-current HTML uses `/revela make --deck`; non-current PDF/PPTX with current HTML uses `/revela export --deck pdf` or `/revela export --deck pptx`; current HTML uses `/revela review --deck`.
- `/revela story` opens the narrative/story UI rather than printing a readiness report.
- Do not write artifacts from story mode.

`make --<target>` means render artifacts from narrative state.

- Supported targets are `--deck` and `--brief`.
- Internally check story readiness, approval state, stale approval, and explicit render override.
- For deck, compile slide specs from narrative claims/evidence, then run deck/artifact gate and deck HTML contract protections before writing HTML.
- For brief, compile the executive brief from canonical narrative state and graph-backed claim/evidence relationships, not from a deck summary.
- Report story blockers directly and suggest `/revela story`, `/revela research`, or targeted user answers when readiness diagnostics are needed.

`review` means post-artifact reading, inspection, commenting, and asset-assisted editing.

- Use the shared selection model: hover, Ctrl/Cmd-click references, chips, `Esc` clear, explicit send.
- Comment is the mutation path for targeted deck changes. It includes Local Assets and Search Assets for saved workspace media.
- Insight is read-only. It should explain source, support strength, caveat, unsupported scope, narrative purpose, related risks/objections, research gaps, and artifact coverage.
- Pure visual/layout/export edits may patch artifacts directly after normal safety checks.
- Meaning-changing edits must update narrative state first and then re-make the artifact.

`design` is the visual-system surface.

- Keep design list/use/new/edit/preview concerns separate from narrative workflow.
- Do not inject design CSS, layout catalogs, component indexes, chart rules, or deck HTML skeletons during `init`, `research`, or `story`.
- Inject deck-render design context only for make-deck flows.

## Current 0.15 Scope

Completed through `0.15.4`:

- Core skill rewritten around `Init -> Research -> Story -> Make -> Review -> Export`.
- `/revela research`, `/revela story`, `/revela make --deck`, `/revela make --brief`, `/revela review --deck`, `/revela export --deck`, `/revela design`, and `/revela domain` are the public command surface.
- Session-scoped command intent injection hides core LLM workflow prompts from visible chat messages and injects them one-shot through the system prompt.
- `/revela story` opens the read-only story workspace UI.
- `/revela research` performs closed-loop research, attachment, binding, claim/relation narrowing, and re-review instead of only saving findings.
- Built-in design grammar is simplified around compositional `box`, `text-panel`, `media`, chart/table, steps, roadmap, hero, stat, quote, and TOC components.
- Review asset search is implemented inside Review/Comment: remote image candidates can be searched, saved into workspace-local media assets, listed as Local Assets, and referenced in structured asset placement comments.
- `/revela refine --deck` is a compatibility alias. `/revela edit` and `/revela inspect` should direct users to `/revela review --deck`.
- Domain prompt injection is limited to narrative mode. Deck-render mode should receive the active design layer, not full domain guidance.
- Deck render prompt wording, command surface, TOC design vocabulary, and Review panel interactions were tightened through `0.15.4`.

Known 0.15 limits:

- `/revela make --deck --desc "..."` is not implemented. Do not document it as supported until it exists.
- The workflow remains LLM-orchestrated, not a deterministic workflow engine.
- Do not build audience/scenario/live variants in 0.15.
- Do not introduce a graph database, vector database, LSP dependency, broad semantic explorer, or generic Q&A/chat workflow.

## Current 0.16 Progress

- `0.16.0` deterministic deck plan compiler v2 is implemented in `lib/narrative-state/render-plan.ts`.
- Early `0.16.1` Story workbench slices are implemented in `lib/narrative-state/map.ts` and `lib/narrative-state/map-html.ts`.
- Story now derives filters, per-claim next actions, artifact coverage work items, no-render-target guidance, filter empty state, selected-claim auto-switching, coverage status notes, and primary next command deterministically.
- `/revela story -l ...` display-model prompting may localize Story workbench labels, but canonical IDs, evidence, coverage, readiness, and commands remain deterministic.
- Remaining `0.16.1` work should focus on usability and coverage diagnostics polish, not mutation UI or generic chat.

## Near-Term Product Priorities

Recommended 0.16 theme: **Deterministic Story-to-Artifact Handoff**.

The next useful work is not adding another generic artifact type. The strongest opportunity is making the existing canonical narrative, research, approval, coverage, and Review systems hand off to artifacts more deterministically.

Grounded current-state notes:

- Story UI, research gaps, artifact coverage/staleness, Review Insight, Review asset search, and executive brief generation already exist. Treat them as foundations to harden rather than blank-slate future features.
- `/revela research` already performs prompt-orchestrated closed-loop research, attachment, binding, claim narrowing, and re-review. The gap is deterministic orchestration and better failure reporting, not simply "add research".
- Review Insight already has deterministic inspection context/result builders plus LLM inspector prompts. The gap is clearer deterministic-first UX and provenance labeling, not generic chat.
- Artifact coverage already tracks current/stale/partial/missing claim coverage. The gap is making coverage drive make/review/remake decisions more explicitly.
- `lib/narrative-state/render-plan.ts` is the main artifact-handoff weak spot: `compileDeckPlanFromNarrative` is approved-state aware, but slide planning is still basic and partly out of sync with deck-render prompt expectations.

Priority 1: deterministic deck plan compiler v2.

- Align `compileDeckPlanFromNarrative` with `/revela make --deck` expectations: deterministic Cover, TOC, content chapters, risks/objections where relevant, and Closing/Decision Ask.
- Generate 3-5 chapter headings from claim roles, claim relations, objections, risks, and decision context instead of leaving chapter structure mostly to the LLM.
- Use the simplified built-in design grammar in slide specs: `box`, `text-panel`, `media`, `echart-panel`, `data-table`, `steps`, `roadmap-horizontal`, `roadmap-vertical`, `hero`, `stat-card`, `quote`, `toc`.
- Avoid old primary component names such as `card` in new slide specs unless needed as compatibility internals.
- Carry claim refs, evidence binding ids, supported/unsupported scope, caveats, and narrative role into every planned slide so artifact coverage remains reliable.
- Prefer deterministic plan quality checks before writing HTML: missing TOC/closing, unsupported central claims, stale approval, and incompatible component names should be caught early.

Priority 2: Story UI from display page to workbench.

- Keep `/revela story` read-only for now, but make it more decision-oriented: filters for missing evidence, partial evidence, stale artifacts, open gaps, risks, and high-priority objections.
- Show per-claim next actions: research this gap, attach findings, narrow claim, approve narrative, make deck, remake stale artifact.
- Surface artifact coverage as a work area, not only metadata: affected claims, affected slides, missing required claims, stale render targets, and recommended next command.
- Keep command recommendations deterministic and source them from canonical narrative readiness plus artifact coverage, not from LLM judgement.
- Do not turn Story into generic chat or mutation UI unless there is a clear structured action path.

Priority 3: deterministic-first Review Insight.

- For high-confidence selection matches, show deterministic inspection cards first and label any LLM expansion as explanatory rather than official state.
- For no-match selections, return `no_match` directly instead of stretching weak evidence into a claim match.
- Make card provenance clear: canonical claim/evidence, artifact coverage, exploratory non-official reading, and source/caveat boundaries.
- Preserve the current rule that Insight is read-only; mutations go through Comment and must respect narrative-vs-artifact boundaries.

Priority 4: semi-deterministic research loop.

- Convert more of `/revela research` from prompt convention into deterministic target selection and status transitions where practical.
- Produce structured reasons when findings cannot be attached or evidence candidates cannot be bound: missing quote, unclear source, over-broad claim, weak source, unsupported scope, or caveat conflict.
- Prefer binding/narrowing from existing saved findings before launching external research.
- Keep research agents write-limited to findings files; primary workflow remains responsible for canonical attachment and evidence binding.

Priority 5: coverage-driven make/review/remake decisions.

- Use artifact coverage to explain whether the current deck is current, stale, partial, or missing before remaking or exporting.
- When narrative hash changes, report affected claims/slides and recommend focused remake/review steps.
- Support a dry-run or preview-style deck plan recompile before writing HTML if it helps users trust the handoff.

Priority 6: decide on `/revela make --deck --desc "..."`.

- Either keep it explicitly unsupported, or implement it as intent seeding for init/story state.
- If implemented, `--desc` must not bypass source grounding, canonical narrative, evidence requirements, approval, or render gates.

Priority 7: product positioning cleanup.

- `package.json` description is stale if it still frames Revela as only an HTML slide deck generator.
- README media-asset stage wording should stay aligned with the three-stage model: remote candidate -> workspace asset -> deck usage.
- User-facing docs should consistently say decks are render targets from trusted narrative state, not the product's durable source of truth.

0.16 development slices:

- `0.16.0`: ship deterministic deck plan compiler v2, plan quality checks, and coverage-driven make diagnostics.
- `0.16.1`: ship Story workbench filters, per-claim next actions, artifact coverage work area, and deterministic Story-to-command handoff.
- `0.16.2`: ship deterministic-first Review Insight, stricter no-match behavior, and provenance labeling.
- `0.16.3`: ship semi-deterministic research target selection, structured binding failure reasons, and a better attach/bind loop.

0.16 user-experience acceptance criteria:

- Users can tell whether the narrative is trustworthy, complete, and ready to render without reading raw `DECKS.json`.
- Users can tell whether the current deck is current, stale, partial, or missing, and which claims/slides are affected.
- Users get a clear next action from Story, Make, Review, or Research instead of having to guess the next command.
- Users can inspect selected deck text and see canonical claim/evidence/provenance boundaries before any exploratory explanation.
- Research output clearly distinguishes saved findings, attached findings, bound evidence, and unbound findings with reasons.

First 0.16 implementation ticket:

- Implement deterministic deck plan compiler v2 in `lib/narrative-state/render-plan.ts`.
- Treat it as the highest-leverage starting point because it improves `/revela make --deck`, Story-to-deck handoff, artifact coverage, stale/remake decisions, and Review traceability.
- Acceptance: repeated compiles from the same approved narrative produce stable plans; central claims are covered; Cover, TOC, content chapters, risk/objection coverage where relevant, and Closing/Decision Ask are present; primary components use the simplified design grammar; claim refs, evidence binding ids, caveats, supported scope, and unsupported scope are carried into planned slides.

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
- Normal content slides should usually contain 2-4 semantic boxes/cards unless deliberately using a focus layout.

## Review Asset Rules

Use a three-stage model:

```text
remote candidate -> workspace asset -> deck usage
```

- Remote candidates are search results only. They are not durable workspace state and must not be written directly into deck HTML.
- Workspace assets are saved local files plus manifest metadata. Deck HTML should reference workspace-relative local paths, not remote URLs or Review/Refine proxy URLs.
- Deck usage is artifact-level visual placement unless the image is explicitly source evidence. Do not automatically turn visual assets into canonical narrative evidence.
- Preserve source URL, source page URL, provider, license, attribution, alt text, purpose, and dimensions when known. Never invent missing licensing or attribution fields.
- License-unknown assets may be used as visual drafts only when clearly marked; do not imply commercial clearance.
- Asset placement prompts must tell the LLM to use only the saved workspace asset path in deck HTML and never write remote `imageUrl`, `thumbnailUrl`, source page URLs, or `/__revela_asset` proxy URLs.
- Logo assets should remain small, clear, and brand-like; do not use them as decorative backgrounds.
- Screenshots, diagrams, charts, and evidence images must remain readable and should not be converted into decorative hero imagery.

## Prompt Modes And Command Intent

- Default prompt mode is narrative mode from `skill/NARRATIVE_SKILL.md`.
- Deck-render mode uses legacy deck/render instructions from `skill/SKILL.md` plus the active design layer.
- Full domain guidance is narrative-only and is not injected into deck-render mode.
- `init`, `research`, `story`, `review`, `remember`, and ambient Revela chat should use narrative mode.
- `make --deck`, deck artifact review, deck HTML generation, PDF/PPTX implications, layout/component fetching, and design QA should use deck-render mode.
- LLM workflow commands should use session-scoped command intent injection from `lib/command-intent.ts` instead of visible long prompts.
- Deterministic local commands display short results with `client.session.prompt({ noReply: true, ignored: true })` and then throw a handled sentinel error to prevent LLM execution.
- Command intent injection is one-shot and session-scoped. Clear pending intent after appending it to the system prompt.

## Workspace State

- Root `DECKS.json` remains the compatibility persistence file.
- Canonical narrative state lives under top-level `narrative` and includes audience, decision, thesis, claims, claim relations, evidence bindings, objections, risks, research gaps, approvals, and status.
- `deck.narrativeBrief`, `slides[].narrativeRole`, `slides[].evidence[]`, `slides[].claimRefs[]`, `slides[].claimIds[]`, and `slides[].evidenceBindingIds[]` are compatibility/projection fields.
- `workspace.sourceMaterials[]` indexes local source candidates and extraction cache paths. It is candidate context, not proof by itself.
- `actions[]` records compact provenance such as workspace scan, source extraction, findings saved/attached, evidence binding applied, review performed, artifact rendered, and coverage backfilled.
- `renderTargets[]` records active HTML deck, derived PDF/PPTX, executive brief, narrative hash, claim coverage, and contract status.
- `reviews[]` stores derived review snapshots. Do not treat old snapshots as timeless truth.

## Tool And State Rules

- Do not patch `DECKS.json` directly. Use `revela-decks` actions or internal state helpers.
- Do not let research agents mutate canonical state directly. Research agents save findings; the primary workflow attaches findings and binds evidence through approved tools.
- `revela-research-save` writes findings markdown under `researches/{topic}/{filename}.md`; it does not automatically make findings canonical support.
- `revela-workspace-scan` discovers candidate documents and records provenance when possible; scan actions are not proof.
- `revela-extract-document-materials` writes reusable extraction cache under `.opencode/revela/doc-materials/{fingerprint}/` and updates `workspace.sourceMaterials` when `DECKS.json` exists.
- `revela-decks attachResearchFindings` attaches a workspace-relative `researches/**/*.md` file to a matching research axis. It does not mutate slide evidence or deck HTML.
- `revela-decks applyEvidenceCandidates` and evidence-status services apply selected candidates explicitly. They write only canonical evidence/compatibility slide evidence and never rewrite deck HTML or slide wording.
- `revela-media-save` and `revela-media-batch-save` promote chosen local or remote image leads into workspace assets under `assets/<topic>/media/` and update the media manifest.
- Review asset search results are remote candidates only until saved. Deck HTML should reference saved workspace asset paths, never remote candidate URLs or `/__revela_asset` preview/proxy URLs.
- Inspection/result tools submit structured JSON for browser UI. Do not rely on assistant Markdown parsing for Review UI state.
- Design tools may read active design sections/components/layouts from `~/.config/revela`. Do not inject full design context outside deck-render flows.

## Key Files

| Area | Files |
| --- | --- |
| Plugin routing | `plugin.ts`, `lib/commands/*` |
| Prompt building | `lib/prompt-builder.ts`, `skill/NARRATIVE_SKILL.md`, `skill/SKILL.md` |
| Workspace state | `lib/decks-state.ts`, `lib/workspace-state/*`, `tools/decks.ts` |
| Narrative state | `lib/narrative-state/*`, especially `render-plan.ts` for story-to-deck handoff |
| Research/source materials | `tools/workspace-scan.ts`, `tools/extract-document-materials.ts`, `tools/research-save.ts`, `lib/source-materials.ts` |
| Review/refine/inspect | `lib/refine/*`, `lib/inspect/*`, `lib/inspection-context/*`, `tools/inspection-result.ts` |
| Media assets | `lib/media/*`, `tools/media-save.ts`, `tools/media-batch-save.ts`, `tools/research-images-list.ts` |
| Artifact export/QA | `lib/deck-html/contract.ts`, `lib/qa/*`, `lib/pdf/export.ts`, `lib/pptx/export.ts`, `tools/pdf.ts`, `tools/pptx.ts` |
| Design/domain system | `lib/design/designs.ts`, `lib/domain/domains.ts`, `tools/designs.ts`, `tools/designs-author.ts`, `tools/domains.ts`, `designs/*`, `domains/*` |
| User docs | `README.md`, `README.zh-CN.md` |

## Engineering Workflow

- `main` must stay releasable. Use a dedicated branch for non-trivial work.
- Use `feature/*` for product work, `fix/*` for bug fixes, and `spike/*` or `experiment/*` for uncertain exploration.
- Small direct commits on `main` are acceptable only for very low-risk typo or tiny documentation edits.
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

Current README badges report 380 passing tests. Re-run tests before changing this number in docs or badges.

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

After every release, update `AGENTS.md` to reflect the new product baseline, command surface, known limits, and current agent rules. Keep `AGENTS.md` as the concise working guide and aim to keep it around 500 lines or less; delete obsolete material or archive release archaeology in `docs/AGENTS.archive.md` instead of letting the main guide grow.

Do not bump versions or publish without an explicit release request.

## Historical Reference

Use `docs/AGENTS.archive.md` only when you need detailed release archaeology, old OpenCode plugin API notes, or legacy implementation history. Prefer this file for current decisions and behavior.
