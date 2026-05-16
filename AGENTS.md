# AGENTS.md - Revela Agent Guide

> Current working guide for AI agents and developers in this repository.
> Historical implementation notes belong in `docs/AGENTS.archive.md`.
> Last updated: 2026-05-16 after 0.17.0 vault ingest and plugin-eval workflow planning.

## Product Baseline

Revela is a narrative artifact workspace for high-stakes communication. It is not a generic AI slide maker.

Product promise:

**Turn source materials, research, data, and user intent into trusted, traceable, presentation-ready decision artifacts.**

Current baseline: `0.17.0`.

User-facing workflow:

```text
Init -> Research -> Story -> Make -> Review -> Export
System surface: Design
```

Decks are render targets. The durable core is source trust, canonical narrative state, evidence traceability, approval provenance, artifact coverage, and post-artifact reading/refinement.

## Active Product Rules

- `revela-narrative/` is the editable source of truth for communication meaning when present; otherwise `DECKS.json.narrative` remains the compatibility source.
- Canonical narrative state (`NarrativeStateV1`) is the compiled internal interface for communication meaning.
- Artifacts such as HTML decks, PDF, PPTX, executive briefs, speaker notes, appendix material, and future interactive pages are render targets from the same workspace state.
- `DECKS.json` is the compatibility/render-state store for source materials, compiled narrative mirror, actions, render targets, review snapshots, deck specs, approvals, and artifact coverage.
- `writeReadiness.status: "ready"` is deck/artifact readiness only. It is never narrative approval.
- Saved research findings are not evidence support until explicitly attached to research state or bound to canonical narrative/slide evidence.
- Do not invent quotes, source paths, URLs, page references, caveats, claim ids, evidence ids, or artifact coverage.
- Missing evidence must stay visible as a gap instead of being filled by the model.
- Content-meaning changes must update canonical narrative first, then run narrative readiness/approval or explicit override, then update or re-make artifacts.
- Pure artifact polish may stay artifact-level: layout, typography, spacing, crop, visual hierarchy, export mechanics, deck contract fixes, and similar non-meaning changes.
- Review is the unified post-artifact workspace for reading, insight, targeted commenting, and local asset-assisted visual edits. `/revela review --deck` is the public entry.
- `/revela refine --deck` remains a compatibility alias during the naming migration. `/revela inspect` and `/revela edit` should show migration help.
- Interactive reading and exploratory cards are bounded reading aids, not official artifact mutations and not generic chat.

## Workflow Design Philosophy

Revela should not use long prompts as the workflow engine.

- Plugin-side deterministic eval is the workflow backbone. Prompts are thin contracts, not procedural state machines.
- Put guidance at state boundaries: command invocation, workspace scan, source registration, vault Markdown writes/patches, research findings saved, narrative compile, deck plan compile, artifact writes, review selections, and export.
- LLMs should receive concrete task cards, blockers, allowed mutations, next eval triggers, and report sections computed from state. They should not infer the workflow from long hidden instructions.
- Keep durable product rules in prompts: do not invent evidence, preserve source trace, keep missing support visible, respect narrative-vs-artifact boundaries, and follow plugin eval output.
- Move repeatable orchestration out of `buildInitPrompt`, `buildResearchPrompt`, `buildDeckPrompt`, and `skill/NARRATIVE_SKILL.md` into deterministic evaluators and plugin hooks.
- Tool results and plugin hooks should append compact eval summaries when they create a new state boundary. Examples: ingest candidates after `revela-decks init`, compile diagnostics after vault Markdown writes, binding candidates after findings save, QA after deck artifact writes.
- Avoid asking the LLM to remember cleanup steps such as "compile after editing Markdown". The plugin should detect the write/patch and run or request the next deterministic eval.
- Tests should increasingly assert evaluator outputs and hook behavior, not large prompt substrings.

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

`init` means repeatable workspace ingest, local grounding, and intent capture.

- Scan the workspace and register source-material candidates.
- On first init, treat all supported workspace files as ingest candidates; on later init runs, ingest files added or modified after the latest `revela-narrative/**/*.md` timestamp, plus files whose fingerprint changed.
- Reuse `workspace.sourceMaterials` and existing extraction cache before re-reading local documents.
- Extract or read selected relevant local materials when useful.
- Distill stable findings from ingested files into `revela-narrative/**/*.md`; source-material records alone are candidate context, not evidence.
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
- Research subagents must not call `revela-decks`; the primary workflow owns canonical state reads/writes and supplies target context to research agents.
- Do not use `upsertNarrative` during `/revela research`; the action is deprecated. Initialize `revela-narrative/` with `initNarrativeVault` when needed, then edit `evidence/*.md`, `research-gaps/*.md`, and safely narrow `claims/*.md` directly before compiling. Targeted vault actions are fallback helpers, not the primary LLM authoring path. Broader claim/relation rewrites must be reported for Story/user confirmation.
- Ask for user confirmation only for strategic meaning changes, central claim deletion/rewrite, suspicious or weak sources, packaging partial evidence as strong, or approving the resulting narrative.
- Preserve source path, URL, location/page/sheet/slide, quote/snippet, support scope, unsupported scope, and caveat.

`story` means open the read-only story workspace UI.

- Show the claim flow and selected-claim reading context: what the claim says, what evidence supports it, why the evidence supports or does not fully support it, and the immediate relation context.
- Keep Story as a read-only narrative-reading surface, not a workflow dashboard. Do not show per-claim command suggestions, Story workbench filters, or next-action cards in Story UI.
- The LLM may localize or organize display copy only; it must not decide readiness, evidence status, artifact coverage, commands, or canonical meaning.
- `/revela story -l ...` display copy must localize selected-claim cards, including displayTitle, evidenceSummary, supportRationale, supportedScope, unsupportedScope, objectionsSummary, risksSummary, and researchGapsSummary when the corresponding canonical text exists.
- Preserve claim ids, relation endpoints, source paths, findings files, URLs, numbers, and quoted/source facts in Story localization.
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
- `0.16.1` Story workbench and command handoff slices shipped, then `0.16.3` simplified Story back to a focused read-only claim-flow reading surface.
- Story no longer renders workbench filters, per-claim command suggestions, next-action cards, or artifact-coverage dashboard UI. Readiness and artifact coverage remain deterministic state/services for Make, Review, and Research handoff.
- `/revela story -l ...` display-model prompting localizes selected-claim cards, including claim title, evidence summary, support rationale, supported/unsupported scope, objections, risks, and research gaps, while preserving canonical IDs and source facts.
- Test-helper lean-down extracted shared narrative fixtures, tool execution helpers, temporary workspace helpers, and common media/text/JSON test helpers. Broad slimming should pause unless a concrete pain point appears.
- `0.16.2` semi-deterministic research-loop slices are implemented in `lib/narrative-state/research-gaps.ts`, `tools/decks.ts`, and `lib/commands/research.ts`.
- Research now derives ordered targets deterministically, including research gaps, missing/weak evidence, unsupported scope, high-priority objections, high-severity risks, claim-chain gaps, and unattached saved findings.
- Research targets expose structured binding diagnostics for saved findings when workspace files are available: bindable state, explicit source/quote/support-scope/unsupported-scope/caveat/strength fields, and failure reasons.
- `/revela research` prompt orchestration now starts from `deriveResearchTargets`, works the selected target first, prefers existing findings before external research, and reports fixed sections for selected target, inspected findings, attachments, bound evidence, unbound findings, gap updates, narrative changes, remaining caveats, and next smallest action.
- `0.16.3` hardens research safety: the `revela-research` subagent cannot call `revela-decks`, and `/revela research` must not use `upsertNarrative` for partial canonical narrative changes.
- Review Prep Mode remains a useful future Review direction: add meeting rehearsal, audience-lens challenge framing, and meeting-prep export without turning Review into generic chat or mutating canonical state from exploratory reading.

## Current 0.17 Progress

- `0.17.0` Markdown Narrative Vault MVP is implemented in `lib/narrative-vault/*`.
- `revela-narrative/` compiles deterministically into existing `NarrativeStateV1`; Story, Research, Make, Review, readiness, hashing, and approval checks continue to use that stable internal interface.
- When a vault exists, `readDecksState`, `readOrCreateDecksState`, and `writeDecksState` prefer the vault and mirror compiled narrative into `DECKS.json.narrative`, preserving approvals from `DECKS.json`.
- Vault cache artifacts are written under `.opencode/revela/narrative-cache/`: `compiled-narrative.json`, `graph.json`, and `diagnostics.json`.
- `revela-decks` supports `initNarrativeVault`, `exportNarrativeVault`, `compileNarrativeVault`, `updateVaultCoreNarrative`, `upsertVaultClaim`, `upsertVaultEvidence`, `upsertVaultObjection`, `upsertVaultRisk`, and `updateVaultResearchGap`.
- Vault diagnostic reports summarize compiler errors/warnings with file/node context, suggested fixes, and next actions for tools and command prompts.
- JSON narrative workspaces without `revela-narrative/` now receive a summary-read migration hint pointing to `exportNarrativeVault`; export responses list files written plus fields that remain in `DECKS.json`.
- `compileDeckPlanFromNarrative` now returns deterministic chapter metadata, maps TOC headings to slide ranges, carries claim/evidence/caveat boundaries into planned slides, and records chapter data on render targets.
- Direct JSON narrative mutation through `upsertNarrative` is deprecated. New workspaces bootstrap `revela-narrative/` first, then use vault mutation actions or edit Markdown nodes and compile.
- `/revela init` now supports repeatable ingest: source materials are classified as added, changed, newer-than-vault, unchanged, and ingest candidates; stable findings should be distilled into Markdown vault nodes.
- Plugin-side narrative vault auto-compile is implemented: after `write`, `edit`, or `apply_patch` touches workspace-contained `revela-narrative/**/*.md`, the hook compiles, writes cache diagnostics, mirrors `DECKS.json.narrative` only on successful compiles, and appends a compact report to the tool result.
- Vault compiler diagnostics now catch evidence nodes with missing or unknown `claimId` before normalization can drop invalid bindings, so auto-compile treats them as hard blockers and preserves the previous mirror.
- The MVP does not move approvals, render targets, artifact coverage, review snapshots, or deck specs into Markdown.

## 0.17 Narrative Vault Baseline

Implemented 0.17 theme: **Markdown Narrative Vault**.

`revela-narrative/` is now the visible, editable canonical narrative source when present, inspired by Obsidian-style local Markdown vaults. `DECKS.json` is a compatibility/render-state mirror for current tools when the vault exists, and `.opencode/revela/narrative-cache/` holds deterministic compiled cache files that can be regenerated.

Target workspace boundaries:

- `revela-narrative/` is canonical editable narrative source for audience, decision, thesis, claims, evidence nodes, objections, risks, research gaps, and typed narrative relations.
- `researches/` remains raw saved findings. Findings are not canonical evidence until an evidence node in `revela-narrative/evidence/` references them with explicit source trace, quote/snippet, support scope, unsupported scope, caveat, and strength.
- `.opencode/revela/narrative-cache/` stores compiled projections such as `graph.json`, `compiled-narrative.json`, and `diagnostics.json`; it is cache/internal state, not the editable source of truth.
- `DECKS.json` remains compatibility and render state during migration: active deck specs, render targets, reviews, actions, approvals, artifact coverage, and a compiled narrative mirror for older paths.

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

Canonical relation syntax should use standard wikilinks plus explicit typed relation lines, not custom link targets that mix identity with edge metadata:

```md
## Relations

- supports: [[claim-recommendation]]
- depends_on: [[evidence-customer-interviews]]
- contrasts_with: [[claim-generic-slide-maker]]
- constrains: [[risk-implementation]]
- answers: [[objection-budget-concern]]
```

Implemented behavior:

- `lib/narrative-vault/*` parses frontmatter, Markdown sections, typed wikilink relations, graph projection, diagnostics, export, cache, and source loading.
- `compileNarrativeVault` compiles `revela-narrative/` deterministically into existing `NarrativeStateV1`; Story, Research, Make, Review, readiness, hashing, and approval checks continue to use that stable interface.
- Evidence nodes with missing or unknown `claimId` are diagnosed from raw vault documents before normalization, preventing invalid bindings from being silently dropped.
- State reads and writes prefer the vault when present and fall back to `DECKS.json.narrative` for old workspaces.
- Successful vault compiles mirror into `DECKS.json.narrative` and write cache artifacts under `.opencode/revela/narrative-cache/`.
- Direct Markdown writes to `revela-narrative/**/*.md` trigger plugin-side auto-compile through `lib/narrative-vault/auto-compile.ts` and `lib/narrative-vault/hook-targets.ts`; failed compiles preserve the previous `DECKS.json.narrative` mirror while still writing diagnostics cache.
- `revela-decks` supports `initNarrativeVault`, `exportNarrativeVault`, `compileNarrativeVault`, `updateVaultCoreNarrative`, `upsertVaultClaim`, `upsertVaultEvidence`, `upsertVaultObjection`, `upsertVaultRisk`, and `updateVaultResearchGap`.
- `revela-decks` read/compile/vault mutation paths expose `vaultDiagnostics` or `diagnosticReport` so Story, Research, Make, and Review can report blockers before rendering or evidence binding.
- `revela-decks read(summary: true)` exposes `migration` guidance when a JSON narrative can be exported to `revela-narrative/`, and `exportNarrativeVault` reports files written, diagnostics, cache/mirror result, and provenance fields preserved in `DECKS.json`.
- Direct JSON narrative mutation through `upsertNarrative` is deprecated and should not rewrite canonical meaning. Use `initNarrativeVault` for new workspaces, vault mutation actions for meaning updates, or edit Markdown nodes and compile instead.
- Empty vaults do not overwrite existing JSON narrative mirrors; compiler emits an `empty_vault` diagnostic.

Validation requirements:

- Detect duplicate ids, missing required frontmatter, broken links, unknown relation types, illegal edge combinations, orphan central claims, evidence-required claims without bindings, evidence nodes missing trace fields, unresolved research gaps, and stale approval hashes.
- Preserve claim ids, evidence binding ids, source paths, findings files, URLs, locations, quotes/snippets, support scope, unsupported scope, caveats, and approval boundaries during compile.
- Do not move approvals, render targets, artifact coverage, or review snapshots into Markdown in the MVP; these remain provenance/render state.
- Do not introduce a graph database, vector database, Obsidian plugin dependency, or complex inline edge DSL for 0.17.

## Near-Term Product Priorities

Remaining 0.17.0 theme: harden the **Narrative Vault Auto-Compile Hook**, then plugin-evaluated workflow boundaries where they add concrete value.

Do not move on to 0.17.1 yet. Markdown vault authoring now compiles automatically after vault Markdown writes. Keep hardening this narrow compile/cache/mirror hook for `revela-narrative/**/*.md` before introducing broader workflow eval; do not replace it with a generic workflow-eval framework.

Grounded current-state notes:

- Story UI, research gaps, artifact coverage/staleness, Review Insight, Review asset search, and executive brief generation already exist. Treat them as foundations to harden rather than blank-slate future features.
- `/revela research` still relies too heavily on prompt-orchestrated closed-loop instructions. The next gap after auto-compile stabilization is plugin-evaluated research targets, findings/binding eval, and vault-write diagnostics that guide the LLM through concrete task cards.
- Review Insight already has deterministic inspection context/result builders plus LLM inspector prompts. The gap is clearer deterministic-first UX and provenance labeling, not generic chat.
- Artifact coverage already tracks current/stale/partial/missing claim coverage. The gap is making coverage drive make/review/remake decisions more explicitly.
- `lib/commands/*` and `skill/NARRATIVE_SKILL.md` remain too procedural. They should shrink only after the vault auto-compile hook remains stable and later workflow eval modules become authoritative.

Refactoring / lean-down guidance:

- Do not start by deleting tests. The suite is broad but fast; first reduce duplicated fixtures and repeated workspace setup.
- Prefer extracting reusable test fixtures under `tests/helpers/` before changing production behavior.
- Best first cleanup target: narrative/deck state fixtures shared by `tests/narrative-map.test.ts`, `tests/narrative-state.test.ts`, and `tests/decks-state.test.ts`.
- Current helper extraction has already handled the highest-value low-risk duplication. Do not continue broad test normalization for marginal line-count savings; only refactor tests when it reduces friction for adjacent product work.
- Keep compatibility command surfaces such as `/revela refine --deck`, `/revela edit`, and `/revela inspect` unless there is an explicit product decision to remove them.
- Split giant production modules only behind stable re-export surfaces first, especially `lib/decks-state.ts` and Review/Edit/Inspect servers.

Priority 0: narrative vault auto-compile hook.

- Implemented in `plugin.ts`, `lib/narrative-vault/auto-compile.ts`, and `lib/narrative-vault/hook-targets.ts`; keep this hook narrow and stable before adding broader workflow eval.
- The hook automatically runs the narrative vault compiler after `write`, `edit`, or `apply_patch` touches workspace-contained `revela-narrative/**/*.md`.
- The hook is a compile/cache/mirror safety boundary, not an LLM planning engine: it appends a compact compile report and diagnostics to the tool result.
- On successful compile, it writes `.opencode/revela/narrative-cache/*` and mirrors the compiled narrative into `DECKS.json.narrative` when `DECKS.json` exists.
- On failed compile, it still writes cache diagnostics, but preserves the previous `DECKS.json.narrative` mirror.
- If `DECKS.json` does not exist, it compiles and writes cache/report only; it does not create workspace state from the hook.
- Keep `compileNarrativeVault` as the manual diagnostic/recovery tool.
- Tests cover path detection, patch target parsing, successful mirror, failed-compile mirror preservation, bad evidence `claimId` blockers, plugin hook ordering around state gates/deck QA, cache diagnostics, and compact report formatting in `tests/narrative-vault-auto-compile.test.ts`.

Priority 1: vault Markdown write/patch hook details.

- When `write`, `edit`, or `apply_patch` touches `revela-narrative/**/*.md`, plugin-side logic should run the narrative vault compiler or equivalent eval automatically.
- The hook should write cache artifacts, mirror `DECKS.json.narrative` only on successful compile, and append a compact diagnostic/task-card summary to the tool result.
- Hard compile blockers should not mirror over the previous compiled narrative. Warnings may mirror while remaining visible.
- This hook replaces prompt instructions that tell the LLM to remember calling `compileNarrativeVault` after every Markdown edit.
- Keep `compileNarrativeVault` as a manual diagnostic/recovery tool, but normal init/research authoring should not depend on the LLM remembering to call it.
- The hook should only target workspace-contained Markdown files under `revela-narrative/`; ignore `researches/**/*.md`, `.opencode/revela/narrative-cache/**`, non-Markdown files, and paths outside the workspace.
- For `apply_patch`, parse `Add File`, `Update File`, `Delete File`, and `Move to` headers, dedupe targets, and cap the displayed touched list at 10 paths.
- The compact report should display status, mirror result, cache location, touched Markdown, and blockers/warnings capped at a small number such as 8 each.

Priority 2: plugin-evaluated workflow backbone after auto-compile.

- After the vault auto-compile hook is stable, add shared workflow eval types if they remain necessary, likely under `lib/workflow-eval/*`: phase, trigger, status, task cards, blockers, warnings, allowed mutations, prohibited mutations, report sections, next eval trigger, and compact state summary.
- Implement eval at key boundaries only when they add concrete value beyond auto-compile: `/revela init`, `/revela research`, research findings saved, `/revela make --deck`, and deck artifact writes.
- Use plugin hooks to append eval summaries to tool results or command intent. Command prompts should ask the LLM to follow the eval card, not describe the whole workflow.
- Convert existing deterministic logic into eval producers gradually: ingest classification, vault diagnostics, research target derivation, readiness review, deck plan quality checks, artifact coverage, and QA.
- Tests should cover eval result structure and hook-triggered guidance. Prompt tests should only check thin-contract presence.

Priority 3: init eval and ingest task cards.

- `/revela init` should begin with deterministic eval that reports whether vault bootstrap, workspace scan, source-material registration, extraction reuse, or user clarification is needed.
- After `revela-workspace-scan` and `revela-decks init`, plugin/tool eval should return concrete ingest candidates and suggested read/extract tasks. The LLM should read and synthesize those files, not infer ingest scope from prompt prose.
- Keep the current ingest buckets: added, changed, newer-than-vault, unchanged, and ingest candidates.
- Stable findings from ingested files should be written into `revela-narrative/**/*.md`; source-material records alone remain candidate context, not evidence.
- Once vault Markdown is written, the vault write eval hook should compile and return diagnostics/next tasks.

Priority 4: research eval and findings/binding hooks.

- `/revela research` should start from deterministic eval combining vault diagnostics, story readiness, research targets, unattached findings, weak evidence, unsupported scope, objections, risks, and claim-chain gaps.
- Saved findings should trigger binding eval: whether an evidence node can be written, what fields are missing, whether claim narrowing is safe, or whether external research/user input is still needed.
- Research agents remain write-limited to `researches/**/*.md`; primary workflow writes canonical Markdown nodes after eval says the binding is explicit enough.
- Safe claim narrowing may edit `claims/*.md` only when it preserves strategic meaning and evidence boundaries. Broader rewrites require Story/user confirmation.

Priority 5: Vault Markdown mutation helpers.

- Implemented executable helpers cover `evidence/*.md`, `research-gaps/*.md`, `claims/*.md`, `objections/*.md`, `risks/*.md`, plus core audience/decision/thesis/status fields through targeted `revela-decks` actions.
- Preserve stable frontmatter ids, relation sections, source trace, quote/snippet, support scope, unsupported scope, caveats, and strength.
- Keep the implementation simple: current frontmatter and section parser are sufficient; do not add a Markdown AST dependency unless there is a concrete need.
- After Markdown mutations, compile the vault and mirror successful compiles into `DECKS.json.narrative`.
- Tests should cover id preservation, targeted node edits, compile/cache updates, and diagnostics on malformed edits.

Priority 6: research binding in vault workspaces.

- `/revela research` should write bindable findings into canonical `evidence/*.md` directly, reference the claim id, preserve explicit source trace, and compile.
- Safe claim narrowing in vault workspaces may edit `claims/*.md` directly only when it preserves strategic meaning and evidence boundaries; broader claim/relation rewrites require Story/user confirmation.
- Research gap status updates in vault workspaces should use `updateVaultResearchGap` instead of blocked JSON mutation actions.
- Do not treat raw `researches/**/*.md` findings as support until an evidence node preserves explicit source, quote/snippet, supported scope, unsupported scope, caveat, and strength.
- Keep broader claim/relation rewrites out of automatic research unless the change is a safe narrowing that preserves strategic meaning; otherwise report for Story/user confirmation.

Priority 7: vault diagnostics UX.

- Implemented diagnostic report formatting in `lib/narrative-vault/diagnostic-report.ts` for raw compiler diagnostics, including severity, file/node, suggested fix, and next action.
- `revela-decks` should return `vaultDiagnostics`/`diagnosticReport` from summary reads, vault compile/export, and vault mutation actions.
- Surface compile diagnostics clearly in Story, Research, Make, and Review reports when they affect trust or rendering.
- Diagnostics should identify the Markdown file/node when possible and state the next smallest fix.
- Keep missing evidence visible as gaps. Do not let compiler or prompt logic fill missing quotes, source paths, URLs, locations, or caveats.

Priority 8: init/export migration polish.

- Implemented migration hinting in summary reads through `lib/narrative-vault/migration.ts`.
- `exportNarrativeVault` should report files written, diagnostics, next actions, and the fields that remain in `DECKS.json`.
- `/revela init` should bootstrap `revela-narrative/` with `initNarrativeVault` when no vault exists, then record stable findings by editing Markdown nodes directly even when the narrative is incomplete.
- `/revela init` should also work as refresh ingest: `revela-decks init` returns added, changed, newer-than-vault, unchanged, and ingest-candidate source material buckets so user-added files are processed into vault nodes instead of only registered.
- When a workspace has `DECKS.json.narrative` but no vault, guide users toward `exportNarrativeVault` without implying approvals/render targets moved to Markdown.
- Export must preserve ids, evidence binding ids, relation endpoints, source paths, findings files, URLs, locations, quotes/snippets, support scope, unsupported scope, and caveats.
- Do not invent evidence nodes from source-material records or generated deck text.

Priority 9: deterministic deck plan compiler v2.

- Implemented deterministic Cover, TOC, content chapters, risks/objections where relevant, and Closing/Decision Ask in `compileDeckPlanFromNarrative`.
- Implemented 3-5 chapter headings with slide-index mappings and render-target `planChapters` metadata.
- Use the simplified built-in design grammar in slide specs: `box`, `text-panel`, `media`, `echart-panel`, `data-table`, `steps`, `roadmap-horizontal`, `roadmap-vertical`, `hero`, `stat-card`, `quote`, `toc`.
- Avoid old primary component names such as `card` in new slide specs unless needed as compatibility internals.
- Carry claim refs, evidence binding ids, supported/unsupported scope, caveats, visible evidence gaps, and narrative role into planned slides so artifact coverage remains reliable.
- Deterministic plan quality checks now catch missing chapters/TOC/closing, uncovered central claims, evidence-required claims without bindings or visible gaps, risk/objection visibility, and incompatible component names before writing HTML.

Priority 10: Story UI as focused claim-flow reading.

- Keep `/revela story` read-only and focused on understanding the narrative chain: claim, evidence, why the evidence supports or does not fully support the claim, and immediate relation context.
- Do not reintroduce Story workbench filters, per-claim command suggestions, next-action cards, or artifact dashboard UI unless there is a clear product decision to make Story a workflow surface again.
- Localized display models may translate selected-claim reading cards only; they must preserve claim IDs, source facts, quotes, findings paths, URLs, numbers, and canonical evidence boundaries.
- Readiness, artifact coverage, and command handoff diagnostics should remain deterministic services for Make, Review, Research, and textual diagnostics, not clutter the Story reading UI.

Priority 11: Review Prep Mode.

- Position `/revela review --deck` as the post-artifact workspace for meeting readiness, not only deck inspection and visual fixes.
- Keep the tab model clear: `Comment` edits deck artifacts, `Insight` explains selected content and source boundaries, and the planned `Rehearsal` tab stress-tests selected slides/elements for likely meeting challenges.
- Phase 1 is `Rehearsal` tab MVP: select a slide or element, run rehearsal, return 3-5 pointed challenge questions, show why each question matters, classify the attack type such as evidence, logic, ROI, risk, execution, or ask clarity, preserve answer boundaries from canonical claims/evidence/caveats, and allow `Turn into Comment` for targeted follow-up edits.
- Phase 2 is Audience Lens expansion inside `Rehearsal`, not a separate top-level workflow: support lenses such as Decision Maker, Finance, Technical, Legal/Risk, Customer/Buyer, and General. Lens changes question priority and framing only; it must not rewrite canonical narrative or imply new evidence.
- Phase 3 is Meeting Prep Pack export: generate a deck-level Markdown prep artifact with likely questions, answer boundaries, slide-by-slide watchouts, caveats to say aloud, do-not-overclaim notes, and a short-deck path such as "if you only have 5 minutes".
- Reuse existing inspection foundations first: `lib/inspection-context/*`, `lib/inspect/*`, `tools/inspection-result.ts`, and Review selection/Insight UI plumbing. Prefer extending the current inspect request/result flow with a mode such as `insight` vs `rehearsal` before adding a separate server path.
- Deterministic context comes first: selected slide, matched claim, evidence bindings, supported/unsupported scope, caveats, objections, risks, artifact coverage, and gaps must come from inspection projection/state. LLM output may package challenge wording, but must not invent claim ids, evidence, sources, quotes, URLs, page references, caveats, or artifact coverage.
- Preserve the current rule that Insight and Rehearsal are read-only. Mutations go through Comment and must respect narrative-vs-artifact boundaries; meaning-changing comments must update canonical narrative first and then re-make artifacts.
- For high-confidence selection matches, show deterministic inspection/prep context first and label generated expansion as exploratory. For no-match selections, return `no_match` or limited rehearsal instead of stretching weak evidence into a claim match.
- Add focused tests for rehearsal prompt/result structure, audience lens fallback and prompt injection, `Turn into Comment` UI plumbing, no-match rehearsal behavior, provenance boundaries, and Meeting Prep Pack preservation of caveats/unsupported scope/objections.

Priority 12: semi-deterministic research loop.

- Treat this as the completed 0.16.2 product slice pending release verification.
- `/revela research` now uses deterministic target selection before external research through `deriveResearchTargets`.
- Produce structured reasons when findings cannot be attached or evidence candidates cannot be bound: missing quote, unclear source, over-broad claim, weak source, unsupported scope, caveat conflict, source mismatch, or context-only finding.
- Prefer binding/narrowing from existing saved findings before launching external research.
- Keep the fixed research report sections stable so users can distinguish selected target, inspected findings, attachments, bound evidence, unbound findings, gap updates, narrative changes, remaining caveats, and next smallest action.
- Keep research agents write-limited to findings files; primary workflow remains responsible for canonical attachment and evidence binding.
- Do not expose `revela-decks` to the `revela-research` subagent; it may save findings, while the primary workflow performs safe state attachment/binding.
- Do not use `upsertNarrative` during research for partial claim, relation, or evidence array updates; report narrative rewrites for Story/user confirmation instead.

Priority 13: coverage-driven make/review/remake decisions.

- Use artifact coverage to explain whether the current deck is current, stale, partial, or missing before remaking or exporting.
- When narrative hash changes, report affected claims/slides and recommend focused remake/review steps.
- Support a dry-run or preview-style deck plan recompile before writing HTML if it helps users trust the handoff.

Priority 14: decide on `/revela make --deck --desc "..."`.

- Either keep it explicitly unsupported, or implement it as intent seeding for init/story state.
- If implemented, `--desc` must not bypass source grounding, canonical narrative, evidence requirements, approval, or render gates.

Priority 15: product positioning cleanup.

- README media-asset stage wording should stay aligned with the three-stage model: remote candidate -> workspace asset -> deck usage.
- User-facing docs should consistently say decks are render targets from trusted narrative state, not the product's durable source of truth.

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
- LLM workflow commands should use session-scoped command intent injection from `lib/command-intent.ts`, but command intent should become a compact eval/task card rather than a long procedural prompt.
- Deterministic local commands display short results with `client.session.prompt({ noReply: true, ignored: true })` and then throw a handled sentinel error to prevent LLM execution.
- Command intent injection is one-shot and session-scoped. Clear pending intent after appending it to the system prompt.
- Prefer plugin/tool eval output over expanding `skill/NARRATIVE_SKILL.md` or command prompts. If a repeated rule can be computed from state, implement an evaluator or hook instead of adding prompt text.

## Workspace State

- Root `DECKS.json` remains the compatibility persistence file for current tools and render state.
- Current canonical narrative state is compiled from `revela-narrative/` when present; top-level `DECKS.json.narrative` is a compatibility mirror in vault workspaces.
- `revela-narrative/` contains audience, decision, thesis, claims, evidence nodes, objections, risks, research gaps, and typed relations as Markdown files with stable frontmatter ids.
- `.opencode/revela/narrative-cache/` should contain regenerated projections only, including graph, compiled narrative, and diagnostics.
- `deck.narrativeBrief`, `slides[].narrativeRole`, `slides[].evidence[]`, `slides[].claimRefs[]`, `slides[].claimIds[]`, and `slides[].evidenceBindingIds[]` are compatibility/projection fields.
- `workspace.sourceMaterials[]` indexes local source candidates and extraction cache paths. It is candidate context, not proof by itself.
- `actions[]` records compact provenance such as workspace scan, source extraction, findings saved/attached, evidence binding applied, review performed, artifact rendered, and coverage backfilled.
- `renderTargets[]` records active HTML deck, derived PDF/PPTX, executive brief, narrative hash, claim coverage, and contract status.
- `reviews[]` stores derived review snapshots. Do not treat old snapshots as timeless truth.

## Tool And State Rules

- Do not patch `DECKS.json` directly. Use `revela-decks` actions or internal state helpers.
- During the 0.17 vault migration, do not patch generated cache files as source. Edit `revela-narrative/**/*.md` for narrative meaning and regenerate compiled projections.
- Planned workflow direction: edits to `revela-narrative/**/*.md` should trigger plugin-side compile/eval through write/edit/apply_patch hooks, so the LLM sees deterministic diagnostics and next actions without remembering a prompt instruction.
- Do not let research agents mutate canonical state directly. Research agents save findings; the primary workflow attaches findings and binds evidence through approved tools.
- `revela-research-save` writes findings markdown under `researches/{topic}/{filename}.md`; it does not automatically make findings canonical support.
- Saved findings become canonical support only through explicit evidence nodes or evidence bindings that preserve source, quote/snippet, support scope, unsupported scope, caveat, and strength.
- `revela-workspace-scan` discovers candidate documents and records provenance when possible; scan actions are not proof.
- `revela-extract-document-materials` writes reusable extraction cache under `.opencode/revela/doc-materials/{fingerprint}/` and updates `workspace.sourceMaterials` when `DECKS.json` exists.
- `revela-decks attachResearchFindings` attaches a workspace-relative `researches/**/*.md` file to a matching research axis. It does not mutate slide evidence or deck HTML.
- `revela-decks applyEvidenceCandidates` and evidence-status services are compatibility-only. Canonical support should be created or updated through `revela-narrative/evidence/*.md` with explicit source trace, then compiled.
- `revela-media-save` and `revela-media-batch-save` promote chosen local or remote image leads into workspace assets under `assets/<topic>/media/` and update the media manifest.
- Review asset search results are remote candidates only until saved. Deck HTML should reference saved workspace asset paths, never remote candidate URLs or `/__revela_asset` preview/proxy URLs.
- Inspection/result tools submit structured JSON for browser UI. Do not rely on assistant Markdown parsing for Review UI state.
- Design tools may read active design sections/components/layouts from `~/.config/revela`. Do not inject full design context outside deck-render flows.

## Key Files

| Area | Files |
| --- | --- |
| Plugin routing | `plugin.ts`, `lib/commands/*` |
| Prompt building | `lib/prompt-builder.ts`, `skill/NARRATIVE_SKILL.md`, `skill/SKILL.md` |
| Workflow eval/hooks | Planned: `lib/workflow-eval/*`, plus plugin hook integration in `plugin.ts` |
| Workspace state | `lib/decks-state.ts`, `lib/workspace-state/*`, `tools/decks.ts` |
| Narrative state | `lib/narrative-state/*`, especially `render-plan.ts` for story-to-deck handoff |
| Narrative vault | `lib/narrative-vault/*` parser, graph projection, diagnostics, compiler, export, cache, and source loader |
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

After every release, update `AGENTS.md` to reflect the new product baseline, command surface, known limits, and current agent rules. Keep `AGENTS.md` as the concise working guide and aim to keep it around 500 lines or less; delete obsolete material or archive release archaeology in `docs/AGENTS.archive.md` instead of letting the main guide grow.

Do not bump versions or publish without an explicit release request.

## Historical Reference

Use `docs/AGENTS.archive.md` only when you need detailed release archaeology, old OpenCode plugin API notes, or legacy implementation history. Prefer this file for current decisions and behavior.
