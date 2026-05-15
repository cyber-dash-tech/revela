# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-462%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="800" />
</p>

Revela is an [OpenCode](https://opencode.ai) plugin for building trusted narrative artifacts from workspace sources, research, evidence, and user intent.
Its first render target is still the HTML slide deck: start a Revela workflow command, assign a presentation task, and the agent can research, structure, write, QA, inspect, refine, and export a deck.

**[Live Demo — The AI Power Shift](https://cyber-dash-tech.github.io/revela/assets/html/ai-power-shift.html)**

---

## What It Does

- injects one-shot workflow instructions for explicit commands such as `/revela init`, `/revela story`, and `/revela make --deck`
- switches into deck-render prompt mode only when you explicitly start `/revela make --deck`
- supports workspace document discovery, transparent text extraction for `.pdf`, `.docx`, `.pptx`, and `.xlsx`, and cached embedded-material extraction for those formats
- uses `revela-narrative/` as the editable Markdown narrative vault when present, with `DECKS.json` as the compatibility/render-state mirror
- reviews narrative readiness before artifact rendering, then separately gates deck HTML writes through deck/artifact readiness
- records review snapshots so stale readiness cannot silently authorize new deck HTML after important state changes
- treats HTML decks, PDF, and PPTX as render targets from shared workspace state rather than isolated output files
- runs fast design compliance checks whenever the agent writes, patches, or edits `decks/*.html`
- opens a visual comment editor for existing decks so users can Ctrl/Cmd-click elements and send precise edit requests back to OpenCode
- exports finished decks to PDF and editable PPTX
- switches designs and domains locally with zero LLM cost

Revela is a mode, not a separate agent.

---

## Requirements

- [OpenCode](https://opencode.ai)
- Bun runtime `>= 1.0.0`
- [Google Chrome](https://www.google.com/chrome/) or Chromium for QA, PDF export, and PPTX export
- Git if you install from source

---

## Install

### Standard install

Add `@cyber-dash-tech/revela` to the `plugin` array in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@cyber-dash-tech/revela"]
}
```

Restart OpenCode.

To install globally, add the same entry to `~/.config/opencode/opencode.json`.

OpenCode `v1.14.22+` respects `.npmrc` settings during plugin installs, so direct installation through
the `plugin` field should be the default path.

### Local wrapper install

Use this when direct plugin install is blocked in your environment, or when you want to run from a
local checkout during development.

```bash
git clone https://github.com/cyber-dash-tech/revela
cd revela
npm install
```

Create `~/.config/opencode/plugins/revela.js`:

```js
export { default } from "/absolute/path/to/revela/index.ts";
```

If you use the local wrapper route, remove any `@cyber-dash-tech/revela` entry from `opencode.json`, otherwise OpenCode may still try Bun installation.

---

## Quick Start

Prepare the workspace when starting a new deck project:

```text
/revela init
```

Optionally switch design or domain:

```text
/revela design
/revela design --use summit
/revela domain --use deeptech-investment
```

Then shape, research, or review the story. When the narrative is ready and approved, make the deck:

```text
/revela story
/revela research
/revela make --deck
```

Export when needed, either manually or by asking the agent to export:

```text
/revela export --deck pdf decks/humanoid-robotics.html
/revela export --deck pptx decks/humanoid-robotics.html
```

---

## Commands

```text
/revela                          show REVELA help

/revela init                     initialize or refresh narrative workspace state
/revela research                 research, bind evidence, and reduce story gaps/caveats
/revela story                    open the read-only story workspace UI
/revela make --deck              make a deck from approved story state
/revela make --brief [file.md]   render executive brief from approved story
/revela review --deck            open unified deck reading, insight, and comment workspace
/revela export --deck pdf [file] export an HTML deck to PDF in the same directory
/revela export --deck pptx [file] [--notes] export an HTML deck to editable PPTX

/revela design                   list installed designs
/revela design --use <name>      activate a design
/revela design --new <name>      create a custom design with AI
/revela design --edit <name>     refine an existing custom design with AI
/revela design --preview [name]  open a design preview in the browser
/revela design --add <source>    install a design from URL, local path, or github:user/repo
/revela design --rm <name>       remove an installed design

/revela domain                   list installed domains
/revela domain --use <name>      activate a domain
/revela domain --add <source>    install a domain from URL, local path, or github:user/repo
/revela domain --rm <name>       remove an installed domain
```

Most `/revela` commands run locally with zero LLM cost. `/revela init`, `/revela research`, `/revela story`, `/revela make --deck`, `/revela design --new`, `/revela design --edit`, and `/revela export --deck pptx --notes` start AI-assisted workflows because they need to read or update project files. These workflow commands keep the visible chat message short and inject their detailed instructions through a one-shot system-prompt command intent. `/revela review --deck` is the unified post-artifact workspace. It opens a local browser workspace with Comment and Insight tabs that share the same Cmd/Ctrl-click element references. Comment sends targeted comments back into the current OpenCode session; Insight sends grounded selection context to the current OpenCode session and renders localized Narrative Reading, Exploratory Reading, Source, and Purpose cards, has no chat box, and does not edit the deck. Deterministic preprocessing is kept as fallback context rather than the normal first UI. If a generated result omits newer reading cards, Review keeps the deterministic Narrative Reading and Exploratory Reading cards instead of dropping context. Narrative Reading also shows artifact coverage for the selected canonical claim, including whether each recorded artifact contains the claim and whether coverage is current, stale, partial, or missing. Exploratory Reading is explicitly non-official and bounded to recorded claims, evidence, caveats, objections, risks, and artifact coverage. `/revela edit` and `/revela inspect` are no longer public commands; use `/revela review --deck` instead. `/revela refine --deck` remains a compatibility alias.

---

## How It Works

Explicit Revela workflow commands append one-shot command instructions to the current agent's system prompt and choose the needed prompt mode automatically.

The default prompt is narrative-first: it follows `Init -> Research -> Story -> Make -> Review -> Export` and focuses on audience belief shift, decision/action, thesis, claims, evidence boundaries, objections, risks, research gaps, and approval. Active design CSS, layout catalogs, component indexes, chart rules, and deck HTML skeletons are intentionally omitted until `/revela make --deck` switches the session into deck-render mode or `/revela design` starts explicit design work.

Deck-render mode is built from 2 layers:

1. `skill/SKILL.md` - the core deck-render workflow
2. active design - visual system, layouts, components, and chart rules

Active domain guidance is narrative-only. It helps `init`, `research`, and `story`
shape the canonical narrative; `make --deck` renders that approved narrative
without injecting the full domain prompt again.

Persistent preferences live in `~/.config/revela/config.json`.
The ambient enabled or disabled state is session-level only.

### Workspace State

`revela-narrative/` is Revela's editable Markdown narrative vault when present. It stores the human/LLM-editable source for audience, decision, thesis, claims, evidence nodes, objections, risks, research gaps, and typed narrative relations.

`DECKS.json` remains Revela's compatibility and render-state file. It is still stored at the workspace root and remains readable as the current deck project state, but when a vault exists its top-level `narrative` is a compiled mirror from Markdown rather than the primary editing surface.

The state records:

- workspace source materials and reusable extraction cache paths
- research plans, saved findings, and compact action provenance
- compiled canonical narrative mirror, approvals, objections, risks, slide specs, claim candidates, and evidence trace
- render targets such as the active HTML deck plus derived PDF and PPTX artifacts
- review snapshots with input hashes so old readiness results become stale after meaningful state changes

Existing root `DECKS.json` workspaces remain compatible. The `revela-decks` action `exportNarrativeVault` can export existing canonical narrative state into `revela-narrative/` without moving approvals, render targets, review snapshots, or artifact coverage into Markdown. Generated cache files live under `.opencode/revela/narrative-cache/` and should not be edited by hand. `writeReadiness.status: "ready"` is deck/artifact readiness only; it is never narrative approval.

Decks remain the primary authored artifact, but they are now treated as render targets from the same workspace state that can later support briefs, appendix material, Evidence Inspector views, Q&A, and interactive reading layers without duplicating source/evidence logic.

---

## Recommended Workflow

Use Revela as a narrative-first artifact workflow:

1. Run `/revela init` when starting in a new project or when the workspace has changed significantly.
2. Use `/revela research` when story gaps or unsupported central claims need external evidence; it should loop through research, evidence binding, claim/relation narrowing, and re-review until public research stops improving the state.
3. Use `/revela story` to open the story workspace UI and inspect claim flow, evidence, caveats, research gaps, approval state, and artifact coverage.
4. Approve the narrative or request revisions. If you intentionally render before full strategic approval, record an explicit render override.
5. Run `/revela make --deck` to compile the approved narrative into deck slide specs and enter deck-render mode, or `/revela make --brief` to render an executive brief.
6. Choose or confirm design only during deck handoff; `/revela make --deck` runs the deck/artifact gate after plan confirmation.
7. Let the agent write the HTML deck under `decks/` only after the artifact gate is ready.
8. Use `/revela review --deck` for visual comments, targeted revisions, read-only Narrative Reading, bounded Exploratory Reading, Source, and Purpose insight, and claim-to-artifact coverage for selected deck elements.
9. Use `/revela review --deck` for post-artifact changes; `/revela edit` and `/revela inspect` are no longer public commands.
10. Export with `/revela export --deck pdf <file>` or `/revela export --deck pptx <file>`.

`/revela story` opens the read-only story workspace UI for unclear audience, missing belief shift, missing decision/action, weak thesis, unsupported central claims, weak evidence, unsupported scope, unhandled objections, missing risk/assumption handling, stale approval, or missing approval. It does not review design/layout readiness or write the final deck.

If Revela blocks a deck write, ask the agent to continue `/revela make --deck`, resolve the reported artifact gaps, and try again. This protects the deck file from being overwritten before the slide specs, evidence projection, design/layout readiness, review snapshot, and deck HTML contract are ready.

---

## Research And File Ingestion

During Revela workflows, the agent can use:

- `revela-workspace-scan` to discover PDFs, Office files, CSVs, Markdown, and text files in the workspace
- the `revela-research` subagent for targeted web research
- `revela-research-save` to write structured findings into `researches/<topic>/`
- `revela-research-images-list` to extract structured image candidates from `researches/<topic>/*.md`
- `revela-media-batch-save` to batch-save selected research image leads into workspace assets
- `revela-media-save` to turn chosen local or remote images into reusable workspace assets under `assets/<topic>/media/`

Supported document extraction paths:

- `@` reference or pasted file in chat
- `read` tool access during Revela workflows or ambient mode

Supported extracted file types:

- `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`

This extraction is transparent to the main agent.

---

## Media Assets

Research findings can record image leads in `## Images`, but those URLs are still just leads.
Final slides should reference local workspace assets instead of remote image URLs.

Use `revela-media-save` when the agent wants to promote one chosen image into a formal project asset.

Current Stage 2 additions:

- `revela-research-images-list` parses `## Images` sections into structured candidates
- the primary agent can review those candidates and select a subset to use
- `revela-media-batch-save` batch-saves the selected subset into `assets/<topic>/media/`
- this stage is still text-driven; it does not inspect image pixels or do visual recognition

Current Stage 1 behavior:

- accepts either `sourcePath` for a workspace-local image or `sourceUrl` for a remote image
- saves successful results into `assets/<topic>/media/`
- updates `assets/<topic>/media-manifest.json`
- records failed attempts with explicit statuses such as `invalid-url` and `cannot-download`
- lets the agent reference the returned local path directly in final HTML

Typical flow:

1. `revela-research` writes image leads into `researches/<topic>/*.md`
2. the primary agent calls `revela-research-images-list` and selects the images worth using
3. `revela-media-batch-save` or `revela-media-save` downloads or copies them into `assets/<topic>/media/`
4. the deck uses the returned local paths in `<img src="...">`

This keeps final decks stable, offline-friendly, and independent from expiring remote URLs.

---

## Layout QA And Compliance

Every time the agent writes, patches, or edits `decks/*.html`, Revela runs a fast static design compliance check.
The manual `revela-qa` tool and PDF/PPTX export preflight also run a Puppeteer-based overflow check at `1920x1080`.

Current QA checks:

| Dimension | What it checks |
|---|---|
| `overflow` | Elements extending outside the slide canvas |
| `compliance` | Unknown design classes and novel CSS rules outside the active design vocabulary |

Each slide must declare `slide-qa="true"` or `slide-qa="false"`.
The current QA path keeps this as deck metadata; it does not enable additional subjective balance or spacing checks.

You can also run QA manually with the `revela-qa` tool.

---

## Designs And Domains

Use `/revela design` and `/revela domain` to inspect what is installed in your environment. Older `/revela designs*` commands now show migration help.

Bundled domains in this repository:

| Name | Description |
|---|---|
| `general` | No domain specialization |
| `deeptech-investment` | VC and investment analysis: market sizing, technical readiness, moat, and investment thesis |
| `consulting` | Strategic consulting: go/no-go decisions, strategy design, and belief-change reporting |

Repository design examples:

| Name | Description | Preview |
|---|---|---|
| `summit` | Editorial annual-report style for image-rich narrative slides and restrained business storytelling | ![summit](assets/img/slide-example-summit.jpg) |
| `monet` | Light, serif-led visual system for quieter, art-directed business storytelling | `DESIGN.md` included in repo |

---

## Custom Designs

A custom design is a folder containing `DESIGN.md`. The folder name becomes the install target name
unless the installer infers another name from the source.

You can ask Revela to create a new local design interactively:

```text
/revela design --new my-design
```

The agent will interview you for visual references, summarize a design brief for confirmation, then save `DESIGN.md` and `preview.html` into your local Revela designs directory. For AI-authored designs, `preview.html` is required: it must include cover and closing slides, and it must showcase every `@component:*` before `revela-designs-author` will accept the package. The default structural base is an internal neutral `starter` design, which is hidden from the normal design list. Use `--base summit` or `--base monet` only when you want to derive from those specific styles.

Refine an existing local design:

```text
/revela design --edit my-design
```

The agent will ask what to change, inspect the current design, confirm an edit brief, then overwrite the local design package through the controlled authoring tool.

Open a design preview in your browser:

```text
/revela design --preview my-design
```

Omit the name to preview the active design. If a design has no `preview.html`, Revela will report that no preview is available.

Recommended structure:

```text
my-design/
├── DESIGN.md
└── preview.html        required for AI-authored designs
```

`DESIGN.md` starts with frontmatter metadata:

```yaml
---
name: my-design
description: Short description shown in /revela design
author: you
version: 1.0.0
---
```

### Minimal working example

This is the smallest useful `DESIGN.md` shape. It gives the model a clear visual system, one layout,
and one reusable component.

```md
---
name: alpine-brief
description: Minimal editorial design for strategy decks
author: you
version: 1.0.0
---

## Visual Style

Apply this visual style to every slide in the deck.

<!-- @design:foundation:start -->
### Color Palette

```css
:root {
  --bg: #f6f2ea;
  --surface: #fffdf8;
  --text-primary: #1c1a17;
  --text-secondary: #625b52;
  --accent: #8a6a45;
  --line: rgba(28, 26, 23, 0.14);
  --font-display: 'IBM Plex Sans Condensed', 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

### Typography

- Headings use `--font-display`
- Body copy uses `--font-body`
- Keep all sizing in fixed `px` for a `1920x1080` canvas

### HTML Structure

- Every slide must use `<section class="slide" slide-qa="true|false">`
- Every slide must contain one `.slide-canvas`
- Keep all CSS in one `<style>` block and all JS in one `<script>` block
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
### Composition Rules

- Use warm off-white backgrounds and restrained brown accents
- Prefer narrow text columns and generous whitespace
- Avoid glow, glassmorphism, neon gradients, and dashboard styling
<!-- @design:rules:end -->

<!-- @design:layouts:start -->
<!-- @layout:cover:start qa=false -->
### Cover layout

- Centered title stack
- Small eyebrow at top
- One thin accent divider under the title
<!-- @layout:cover:end -->

<!-- @layout:two-col:start qa=true -->
### Two-column layout

- Left column for argument, right column for evidence
- Recommended split: `5 / 7`
- Keep the left column under `520px` for readable paragraphs
<!-- @layout:two-col:end -->
<!-- @design:layouts:end -->

<!-- @design:components:start -->
<!-- @component:stat-card:start -->
### Stat card (`.stat-card`)

```html
<div class="stat-card">
  <div class="stat-label">Revenue CAGR</div>
  <div class="stat-value">27%</div>
  <div class="stat-note">2024-2028E</div>
</div>
```

```css
.stat-card {
  border-top: 1px solid var(--line);
  padding-top: 18px;
}

.stat-label {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.stat-value {
  margin-top: 10px;
  font-family: var(--font-display);
  font-size: 72px;
  line-height: 0.95;
}

.stat-note {
  margin-top: 8px;
  font-size: 16px;
  color: var(--text-secondary);
}
```
<!-- @component:stat-card:end -->
<!-- @design:components:end -->
```

### Marker system

For larger designs, use the marker system so Revela can keep the always-on prompt compact and fetch
details only when needed:

```html
<!-- @design:foundation:start -->
Foundation rules
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
Design rules
<!-- @design:rules:end -->

<!-- @design:layouts:start -->
<!-- @layout:cover:start qa=false -->
Layout details
<!-- @layout:cover:end -->
<!-- @design:layouts:end -->

<!-- @design:components:start -->
<!-- @component:card:start -->
Component details
<!-- @component:card:end -->
<!-- @design:components:end -->

<!-- @design:chart-rules:start -->
Chart rules
<!-- @design:chart-rules:end -->
```

Marker roles:

- `@design:foundation`: core tokens, HTML skeleton, CSS foundations, typography, spacing, page framing
- `@design:rules`: composition rules, dos and don'ts, art direction constraints, interaction rules
- `@design:layouts`: named layout recipes such as `cover`, `toc`, `two-col`, `data-vis`
- `@design:components`: reusable building blocks such as `card`, `stat-card`, `quote-block`
- `@design:chart-rules`: chart-specific rules that are only needed when a slide actually uses charts

Layout marker rules:

- Use stable, simple names such as `cover`, `two-col`, `stats`, `timeline`
- Add `qa=true` for dense content layouts and `qa=false` for intentionally sparse structural layouts
- Write each layout section as a recipe: purpose, recommended structure, preferred ratios, and known constraints

Component marker rules:

- Include at least one concrete HTML example
- Include the CSS class names the component depends on
- Prefer a small vocabulary of reusable class names over many one-off classes

Prompt injection behavior:

- always injected: `@design:foundation`, `@design:rules`, layout index, component index
- fetched on demand: individual `@layout:*`, individual `@component:*`, `@design:chart-rules`

If a design has no markers, Revela falls back to injecting the full `DESIGN.md` body.

### Practical guidance

- Put the non-negotiable rules in `foundation` and `rules`; do not hide essential constraints only inside one layout
- Keep layout names semantically meaningful; they become the vocabulary the model sees in the layout index
- If your design defines a custom CSS class, document that class inside `DESIGN.md`; QA checks can flag classes not present in the design vocabulary
- For AI-authored designs, `preview.html` must include `<section class="slide" data-slide-role="cover">` and `<section class="slide" data-slide-role="closing">`
- For AI-authored designs, `preview.html` must visibly showcase every `@component:*` and mark each sample with `data-preview-component="<component-name>"`; otherwise `revela-designs-author create/validate` will fail
- When the design supports chart styling, include a 3x3 ECharts gallery with at least 9 chart examples in `preview.html`; this is a quality requirement for the agent workflow, not a hard validation blocker

Install a custom design:

```text
/revela design --add github:your-org/your-design
/revela design --add https://example.com/my-design.zip
/revela design --add ./path/to/local/design-folder
```

---

## Custom Domains

A custom domain is a folder containing `INDUSTRY.md`.

```text
/revela domain --add github:your-org/your-domain
```

`INDUSTRY.md` is a legacy filename kept for compatibility.

---

## Visual Editing

Use the unified refinement workspace for normal post-write review and revision:

```text
/revela review --deck
```

`/revela review --deck` opens the active HTML deck with two tabs. Use `Ctrl`/`Cmd` + click once to reference deck elements, then choose Comment for fast natural-language change comments or Insight for read-only Narrative Reading, bounded Exploratory Reading, Source, Purpose, and artifact coverage review. Insight does not mutate the deck; Comment remains the mutation path. This is the recommended entry for post-artifact reading, insight, and commenting.

Removed command:

```text
/revela edit
```

`/revela edit` has been removed. Use `/revela review --deck` for the unified reading, insight, and comment workspace.

Use `Ctrl`/`Cmd` + click to reference deck elements, write a natural-language comment in the Comment tab, then send it back to OpenCode. Revela sends a structured edit prompt that includes the deck file, slide context, selected element metadata, and your comment.

LLM tool equivalent: `revela-edit` with no target. The tool remains a compatibility shim and opens Review in Comment mode when you say things like “I want to edit the deck”.

For existing decks, `/revela review --deck` prepares whatever minimal project context is needed so targeted edits can still use the normal safety checks.

---

## Evidence Inspector

Use `/revela review --deck` for evidence insight and narrative reading. Removed compatibility command:

```text
/revela inspect
```

`/revela inspect` no longer opens a separate inspector shell. Use `/revela review --deck` and the Insight tab. The Insight tab shows Narrative Reading and Exploratory Reading cards alongside the fixed Source and Purpose cards. Narrative Reading preserves canonical claim ids, evidence binding ids, supported scope, unsupported scope, caveats, objections, risks, and artifact coverage when the selected element maps to canonical narrative state. Coverage shows whether the selected claim appears in recorded deck/brief/export artifacts and whether those artifacts are current, stale, partial, or missing against the current narrative hash. Exploratory Reading provides non-official objection prep, audience reframing boundaries, appendix leads, and meeting-prep cues from the same recorded context only. Use `Ctrl`/`Cmd` + click to reference deck elements, then click `Get Insight`. Selection is locked while the request is being processed.

The insight surface is not chat and has no freeform prompt. It does not mutate `DECKS.json` or the deck HTML. It uses recorded slide specs, narrative state, and slide-level evidence trace as grounded context. Insight is LLM-first in the UI: it shows a reading/loading state, then renders structured generated cards. Deterministic preprocessing remains internal fallback context and is shown only if generation fails or times out. The Insight tab includes a fixed display-language selector; language changes affect card copy only and never alter claim ids, evidence ids, source paths, URLs, numbers, quotes, or canonical facts. When an older or partial generated result only returns Source/Purpose, Review preserves the deterministic reading cards so generated insight cannot silently remove claim, evidence-boundary, artifact-coverage, or exploratory context.

Review uses the active HTML deck render target recorded in workspace state. The deck HTML must satisfy Revela's slide identity contract: every `<section class="slide">` in the active artifact needs a positive 1-based `data-slide-index` matching the current slide specs. Invalid active artifacts are refused or reported before review/export workflows trust them.

---

## Export

PDF export:

```text
/revela export --deck pdf decks/my-deck.html
```

LLM tool equivalent: `revela-pdf` with `{ "file": "decks/my-deck.html" }`.

Editable PPTX export:

```text
/revela export --deck pptx decks/my-deck.html
```

LLM tool equivalent: `revela-pptx` with `{ "file": "decks/my-deck.html" }`.

Both commands and tools write output beside the source HTML deck. Use the tools when you want the agent to run export as part of the deck workflow instead of asking the user to invoke `/revela export --deck pdf` or `/revela export --deck pptx` manually.

---

## Development

```bash
bun test
bun run typecheck
```

Enable verbose logs with:

```bash
REVELA_DEBUG=1 opencode
```

---

## License

MIT - see [LICENSE](LICENSE)
