# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-380%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="800" />
</p>

Revela is an [OpenCode](https://opencode.ai) plugin for building trusted narrative artifacts from workspace sources, research, evidence, and user intent.
Its first render target is still the HTML slide deck: start a Revela workflow command, assign a presentation task, and the agent can research, structure, write, QA, inspect, refine, and export a deck.

**[Live Demo — The AI Power Shift](https://cyber-dash-tech.github.io/revela/assets/html/ai-power-shift.html)**

---

## What It Does

- injects one-shot workflow instructions for explicit commands such as `/revela init`, `/revela story`, and `/revela make deck`
- switches into deck-render prompt mode only when you explicitly start `/revela make deck`
- supports workspace document discovery, transparent text extraction for `.pdf`, `.docx`, `.pptx`, and `.xlsx`, and cached embedded-material extraction for those formats
- keeps `DECKS.json` as the current workspace state engine for sources, research actions, findings, claims, evidence, narrative intent, render targets, and readiness
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
/revela design use summit
/revela domains deeptech-investment
```

Then shape, research, or review the story. When the narrative is ready and approved, make the deck:

```text
/revela story
/revela research
/revela make deck
```

If you need to check only the deck/artifact gate before HTML writing, use:

```text
/revela make deck --review
```

Export when needed, either manually or by asking the agent to export:

```text
/revela pdf decks/humanoid-robotics.html
/revela pptx decks/humanoid-robotics.html
```

If you want normal chat messages to stay in Revela narrative mode between explicit commands, enable optional ambient mode:

```text
/revela enable
```

Disable ambient mode when done:

```text
/revela disable
```

---

## Commands

```text
/revela                          show status and help
/revela enable                   optional ambient narrative mode for normal chat
/revela disable                  disable ambient Revela mode

/revela init                     initialize or refresh narrative workspace state
/revela research                 research, bind evidence, and reduce story gaps/caveats
/revela story                    open the read-only story workspace UI
/revela make deck                make a deck from approved story state
/revela make deck --review       review deck/artifact readiness before writing HTML
/revela make brief [file.md]     render executive brief from approved story
/revela remember <text>          save an explicit user/workflow preference
/revela refine                   open unified reading, inspection, and editing workspace
/revela inspect                  deprecated shim to /revela refine Inspect mode

/revela review                   legacy readiness report for story state
/revela narrative                compatibility alias for /revela story
/revela deck                     compatibility alias for /revela make deck
/revela brief [file.md]          compatibility alias for /revela make brief

/revela design                   list installed designs
/revela design use <name>        activate a design
/revela design new <name>        create a custom design with AI
/revela design edit <name>       refine an existing custom design with AI
/revela design preview [name]    open a design preview in the browser
/revela design add <source>      install a design from URL, local path, or github:user/repo
/revela design rm <name>         remove an installed design
/revela designs                  list installed designs
/revela designs <name>           activate a design
/revela designs-new <name>       create a custom design with AI
/revela designs-edit <name>      refine an existing custom design with AI
/revela designs-preview [name]   open a design preview in the browser
/revela designs-add <source>     install a design from URL, local path, or github:user/repo
/revela designs-rm <name>        remove an installed design

/revela domains                  list installed domains
/revela domains <name>           activate a domain
/revela domains-add <source>     install a domain from URL, local path, or github:user/repo
/revela domains-rm <name>        remove an installed domain

/revela pdf <file>               export an HTML deck to PDF in the same directory
/revela pptx <file>              export an HTML deck to editable PPTX in the same directory
```

Most `/revela` commands run locally with zero LLM cost. `/revela init`, `/revela research`, `/revela story`, `/revela review`, `/revela make deck`, `/revela remember`, `/revela design new`, and `/revela design edit` start AI-assisted workflows because they need to read or update project files. These workflow commands keep the visible chat message short and inject their detailed instructions through a one-shot system-prompt command intent. `/revela refine` is the unified post-artifact workspace. It opens a local browser workspace with Edit and Inspect tabs that share the same Cmd/Ctrl-click element references. Edit sends targeted comments back into the current OpenCode session; Inspect sends grounded selection context to the current OpenCode session and renders localized Narrative Reading, Exploratory Reading, Source, and Purpose cards, has no chat box, and does not edit the deck. Deterministic preprocessing is kept as fallback context rather than the normal first UI. If a generated result omits newer reading cards, Refine keeps the deterministic Narrative Reading and Exploratory Reading cards instead of dropping context. Narrative Reading also shows artifact coverage for the selected canonical claim, including whether each recorded artifact contains the claim and whether coverage is current, stale, partial, or missing. Exploratory Reading is explicitly non-official and bounded to recorded claims, evidence, caveats, objections, risks, and artifact coverage. `/revela edit` has been removed; use `/revela refine` instead. `/revela inspect` remains only as a deprecated compatibility shim to Refine.

---

## How It Works

Explicit Revela workflow commands append one-shot command instructions to the current agent's system prompt. `/revela enable` is optional ambient mode for keeping normal chat in Revela narrative mode between explicit commands.

The default prompt is narrative-first: it follows `Init -> Research -> Story -> Make -> Refine` and focuses on audience belief shift, decision/action, thesis, claims, evidence boundaries, objections, risks, research gaps, and approval. Active design CSS, layout catalogs, component indexes, chart rules, and deck HTML skeletons are intentionally omitted until `/revela make deck` switches the session into deck-render mode or `/revela design` starts explicit design work.

Deck-render mode is built from 3 layers:

1. `skill/SKILL.md` - the core deck-render workflow
2. active domain - domain-specific report structure and terminology
3. active design - visual system, layouts, components, and chart rules

Persistent preferences live in `~/.config/revela/config.json`.
The ambient enabled or disabled state is session-level only.

### Workspace State

`DECKS.json` is Revela's workspace state engine and compatibility file. It is still stored at the workspace root and remains readable as the current deck project state, but internally Revela now treats it as a lightweight persistence layer for more than a deck checklist.

The state records:

- workspace source materials and reusable extraction cache paths
- research plans, saved findings, and compact action provenance
- canonical narrative state, approvals, objections, risks, slide specs, claim candidates, and evidence trace
- render targets such as the active HTML deck plus derived PDF and PPTX artifacts
- review snapshots with input hashes so old readiness results become stale after meaningful state changes

Existing root `DECKS.json` workspaces remain compatible. Running `/revela init` or `/revela review` on an older project can normalize canonical narrative state and refresh projection fields without requiring a manual migration, moving files, or replacing `DECKS.json` with a database. `writeReadiness.status: "ready"` is deck/artifact readiness only; it is never narrative approval.

Decks remain the primary authored artifact, but they are now treated as render targets from the same workspace state that can later support briefs, appendix material, Evidence Inspector views, Q&A, and interactive reading layers without duplicating source/evidence logic.

---

## Recommended Workflow

Use Revela as a narrative-first artifact workflow:

1. Run `/revela init` when starting in a new project or when the workspace has changed significantly.
2. Use `/revela research` when story gaps or unsupported central claims need external evidence; it should loop through research, evidence binding, claim/relation narrowing, and re-review until public research stops improving the state.
3. Use `/revela story` to open the story workspace UI and inspect claim flow, evidence, caveats, research gaps, approval state, and artifact coverage.
4. Approve the narrative or request revisions. If you intentionally render before full strategic approval, record an explicit render override.
5. Run `/revela make deck` to compile the approved narrative into deck slide specs and enter deck-render mode, or `/revela make brief` to render an executive brief.
6. Choose or confirm design only during deck handoff, then run the deck/artifact gate with `/revela make deck --review` or the handoff workflow.
7. Let the agent write the HTML deck under `decks/` only after the artifact gate is ready.
8. Use `/revela refine` for visual comments, targeted revisions, read-only Narrative Reading, bounded Exploratory Reading, Source, and Purpose inspection, and claim-to-artifact coverage for selected deck elements.
9. Use `/revela refine` for post-artifact changes; `/revela edit` has been removed and `/revela inspect` remains only for old scripts or habits.
10. Export with `/revela pdf <file>` or `/revela pptx <file>`.

Use `/revela enable` only when you want ordinary chat messages, not just explicit `/revela ...` commands, to stay in Revela narrative mode.

`/revela story` opens the read-only story workspace UI. `/revela review` produces the legacy readiness report for unclear audience, missing belief shift, missing decision/action, weak thesis, unsupported central claims, weak evidence, unsupported scope, unhandled objections, missing risk/assumption handling, stale approval, or missing approval. Neither command reviews design/layout readiness or writes the final deck.

If Revela blocks a deck write, ask the agent to run `/revela make deck --review`, resolve the reported artifact gaps, and try again. This protects the deck file from being overwritten before the slide specs, evidence projection, design/layout readiness, review snapshot, and deck HTML contract are ready.

To remember long-term preferences, use:

```text
/revela remember Prefer concise Chinese consulting-style decks.
```

Do not use `remember` for temporary checklist state; use it only for durable user or workflow preferences.

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

Use `/revela design` and `/revela domains` to inspect what is installed in your environment. Older `/revela designs*` commands remain compatibility aliases.

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
/revela designs-new my-design
/revela design new my-design
```

The agent will interview you for visual references, summarize a design brief for confirmation, then save `DESIGN.md` and `preview.html` into your local Revela designs directory. For AI-authored designs, `preview.html` is required: it must include cover and closing slides, and it must showcase every `@component:*` before `revela-designs-author` will accept the package. The default structural base is an internal neutral `starter` design, which is hidden from the normal design list. Use `--base summit` or `--base monet` only when you want to derive from those specific styles.

Refine an existing local design:

```text
/revela designs-edit my-design
/revela design edit my-design
```

The agent will ask what to change, inspect the current design, confirm an edit brief, then overwrite the local design package through the controlled authoring tool.

Open a design preview in your browser:

```text
/revela designs-preview my-design
/revela design preview my-design
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
/revela design add github:your-org/your-design
/revela design add https://example.com/my-design.zip
/revela design add ./path/to/local/design-folder
```

---

## Custom Domains

A custom domain is a folder containing `INDUSTRY.md`.

```text
/revela domains-add github:your-org/your-domain
```

`INDUSTRY.md` is a legacy filename kept for compatibility.

---

## Visual Editing

Use the unified refinement workspace for normal post-write review and revision:

```text
/revela refine
```

`/revela refine` opens the active HTML deck with two tabs. Use `Ctrl`/`Cmd` + click once to reference deck elements, then choose Edit for fast natural-language change comments or Inspect for read-only Narrative Reading, bounded Exploratory Reading, Source, Purpose, and artifact coverage review. Inspect does not mutate the deck; Edit remains the mutation path. This is the recommended entry for post-artifact reading, inspection, and editing.

Removed command:

```text
/revela edit
```

`/revela edit` has been removed. Use `/revela refine` for the unified reading, inspection, and editing workspace.

Use `Ctrl`/`Cmd` + click to reference deck elements, write a natural-language comment in the Edit tab, then send it back to OpenCode. Revela sends a structured edit prompt that includes the deck file, slide context, selected element metadata, and your comment.

LLM tool equivalent: `revela-edit` with no target. The tool remains a compatibility shim and opens Refine in Edit mode when you say things like “I want to edit the deck”.

For existing decks, `/revela refine` prepares whatever minimal project context is needed so targeted edits can still use the normal safety checks.

---

## Evidence Inspector

Use `/revela refine` for evidence inspection and narrative reading. Deprecated compatibility command:

```text
/revela inspect
```

`/revela inspect` no longer opens a separate inspector shell. It opens `/revela refine` in Inspect mode. The Inspect tab shows Narrative Reading and Exploratory Reading cards alongside the fixed Source and Purpose cards. Narrative Reading preserves canonical claim ids, evidence binding ids, supported scope, unsupported scope, caveats, objections, risks, and artifact coverage when the selected element maps to canonical narrative state. Coverage shows whether the selected claim appears in recorded deck/brief/export artifacts and whether those artifacts are current, stale, partial, or missing against the current narrative hash. Exploratory Reading provides non-official objection prep, audience reframing boundaries, appendix leads, and meeting-prep cues from the same recorded context only. Use `Ctrl`/`Cmd` + click to reference deck elements, then click `Inspect Selection`. Selection is locked while the request is being processed.

The inspector is not chat and has no freeform prompt. It does not mutate `DECKS.json` or the deck HTML. It uses recorded slide specs, narrative state, and slide-level evidence trace as grounded context. Inspect is LLM-first in the UI: it shows a reading/loading state, then renders structured generated cards. Deterministic preprocessing remains internal fallback context and is shown only if generation fails or times out. The Inspect tab includes a fixed display-language selector; language changes affect card copy only and never alter claim ids, evidence ids, source paths, URLs, numbers, quotes, or canonical facts. When an older or partial generated result only returns Source/Purpose, Refine preserves the deterministic reading cards so generated inspection cannot silently remove claim, evidence-boundary, artifact-coverage, or exploratory context.

Refine uses the active HTML deck render target recorded in workspace state. The deck HTML must satisfy Revela's slide identity contract: every `<section class="slide">` in the active artifact needs a positive 1-based `data-slide-index` matching the current slide specs. Invalid active artifacts are refused or reported before refine/export workflows trust them.

---

## Export

PDF export:

```text
/revela pdf decks/my-deck.html
```

LLM tool equivalent: `revela-pdf` with `{ "file": "decks/my-deck.html" }`.

Editable PPTX export:

```text
/revela pptx decks/my-deck.html
```

LLM tool equivalent: `revela-pptx` with `{ "file": "decks/my-deck.html" }`.

Both commands and tools write output beside the source HTML deck. Use the tools when you want the agent to run export as part of the deck workflow instead of asking the user to invoke `/revela pdf` or `/revela pptx` manually.

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
