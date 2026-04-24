# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-125%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

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

### Local wrapper install

Use this when Bun-based plugin install is blocked, unreliable, or you want to run from a local checkout.

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

### China mainland note

OpenCode's npm plugin installer uses Bun and may ignore npm mirror settings. If direct installation fails, prefer the local wrapper method.

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

A custom design is a folder containing `DESIGN.md` with frontmatter metadata:

```yaml
---
name: my-design
description: Short description shown in /revela designs
author: you
version: 1.0.0
---
```

For larger designs, use the marker system:

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

Prompt injection behavior:

- always injected: `@design:foundation`, `@design:rules`, layout index, component index
- fetched on demand: individual `@layout:*`, individual `@component:*`, `@design:chart-rules`

If a design has no markers, Revela falls back to injecting the full `DESIGN.md` body.

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
