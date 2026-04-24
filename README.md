# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-138%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="800" />
</p>

Revela is an [OpenCode](https://opencode.ai) plugin that turns your current agent into an HTML slide deck generator.
Enable it for the current session, assign a presentation task, and the agent can research, structure, write, QA, and export a deck.

**[Live Demo — The AI Power Shift](https://cyber-dash-tech.github.io/revela/assets/html/ai-power-shift.html)**

---

## What It Does

- injects a presentation-specific system prompt into your current agent with `/revela enable`
- builds that prompt from 3 layers: core skill, active domain, active design
- supports workspace document discovery, transparent text extraction for `.pdf`, `.docx`, `.pptx`, and `.xlsx`, and cached embedded-material extraction for those formats
- runs automatic layout QA whenever the agent writes `decks/*.html`
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

Enable Revela in the current session:

```text
/revela enable
```

Optionally switch design or domain:

```text
/revela designs
/revela designs summit
/revela domains deeptech-investment
```

Then give the agent a deck task:

```text
Create a 6-slide HTML deck on humanoid robotics supply chains. Cite the main market drivers, use the active design faithfully, and save the result to decks/humanoid-robotics.html.
```

Export when needed:

```text
/revela pdf decks/humanoid-robotics.html
/revela pptx decks/humanoid-robotics.html
```

Disable presentation mode when done:

```text
/revela disable
```

---

## Commands

```text
/revela                          show status and help
/revela enable                   enable presentation mode for this session
/revela disable                  disable presentation mode

/revela designs                  list installed designs
/revela designs <name>           activate a design
/revela designs-add <source>     install a design from URL, local path, or github:user/repo
/revela designs-rm <name>        remove an installed design

/revela domains                  list installed domains
/revela domains <name>           activate a domain
/revela domains-add <source>     install a domain from URL, local path, or github:user/repo
/revela domains-rm <name>        remove an installed domain

/revela pdf <file>               export an HTML deck to PDF in the same directory
/revela pptx <file>              export an HTML deck to editable PPTX in the same directory
```

All `/revela` commands run locally with zero LLM cost.

---

## How It Works

When Revela is enabled, it appends a generated prompt to the current agent's system prompt.

That prompt is built from 3 layers:

1. `skill/SKILL.md` - the core slide-generation workflow
2. active domain - domain-specific report structure and terminology
3. active design - visual system, layouts, components, and chart rules

Persistent preferences live in `~/.config/revela/config.json`.
The enabled or disabled state is session-level only.

---

## Research And File Ingestion

When Revela is enabled, the agent can use:

- `revela-workspace-scan` to discover PDFs, Office files, CSVs, Markdown, and text files in the workspace
- the `revela-research` subagent for targeted web research
- `revela-research-save` to write structured findings into `researches/<topic>/`
- `revela-research-images-list` to extract structured image candidates from `researches/<topic>/*.md`
- `revela-media-batch-save` to batch-save selected research image leads into workspace assets
- `revela-media-save` to turn chosen local or remote images into reusable workspace assets under `assets/<topic>/media/`

Supported document extraction paths:

- `@` reference or pasted file in chat
- `read` tool access while Revela is enabled

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

Every time the agent writes `decks/*.html`, Revela runs an automatic Puppeteer-based QA pass at `1920x1080`.
The report is returned immediately so the agent can fix problems before moving on.

Current QA dimensions:

| Dimension | What it checks |
|---|---|
| `overflow` | Elements extending outside the slide canvas |
| `balance` | Sparse slides, centroid drift, and bottom-gap issues |
| `symmetry` | Side-by-side column imbalance in height or density |
| `rhythm` | Irregular vertical spacing between stacked siblings |
| `compliance` | Unknown design classes and novel CSS rules outside the active design vocabulary |

Each slide must declare `slide-qa="true"` or `slide-qa="false"`.

- use `slide-qa="true"` for content-heavy slides that should undergo full QA
- use `slide-qa="false"` for structural slides such as cover, TOC, quote, summary, or closing pages

You can also run QA manually with the `revela-qa` tool.

---

## Designs And Domains

Use `/revela designs` and `/revela domains` to inspect what is installed in your environment.

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

Recommended structure:

```text
my-design/
├── DESIGN.md
└── preview.html        optional, but recommended for humans
```

`DESIGN.md` starts with frontmatter metadata:

```yaml
---
name: my-design
description: Short description shown in /revela designs
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
- Add `preview.html` when possible so humans can inspect the design before activating it

Install a custom design:

```text
/revela designs-add github:your-org/your-design
/revela designs-add https://example.com/my-design.zip
/revela designs-add ./path/to/local/design-folder
```

---

## Custom Domains

A custom domain is a folder containing `INDUSTRY.md`.

```text
/revela domains-add github:your-org/your-domain
```

`INDUSTRY.md` is a legacy filename kept for compatibility.

---

## Export

PDF export:

```text
/revela pdf decks/my-deck.html
```

Editable PPTX export:

```text
/revela pptx decks/my-deck.html
```

Both commands write output beside the source HTML deck.

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
