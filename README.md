# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-110%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="800" />
</p>

Revela is an [OpenCode](https://opencode.ai) plugin that turns your current agent into an HTML slide deck generator.
Enable it for a session, give the agent a presentation task, and it can research, structure, write, and QA a complete deck in `slides/*.html`.

**[Live Demo — The AI Power Shift](https://cyber-dash-tech.github.io/revela/assets/html/ai-power-shift.html)** · A 5-slide investment brief generated with Revela.

---

## What Revela Is

Revela is a mode, not a separate chat agent.

- `/revela enable` injects a presentation-specific system prompt into your current agent
- the prompt is built from 3 layers: core skill, active domain, active design
- the agent can scan workspace files, delegate web research, generate HTML slides, and run layout QA automatically
- design and domain switching happen locally and rebuild the active prompt immediately

---

## Requirements

- [OpenCode](https://opencode.ai)
- Bun runtime (`bun >= 1.0.0`)
- [Google Chrome](https://www.google.com/chrome/) or Chromium for layout QA and PDF export
- Git for source install

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

Restart OpenCode. The plugin is installed automatically via Bun.

To install globally, add the same `plugin` entry to `~/.config/opencode/opencode.json`.

### Local wrapper install

Use this when:

- Bun plugin install is blocked or unreliable
- you are on a mainland China network
- you want to run Revela from a local checkout

From source:

```bash
git clone https://github.com/cyber-dash-tech/revela
cd revela
npm install
```

Create `~/.config/opencode/plugins/revela.js`:

```js
export { default } from "/absolute/path/to/revela/index.ts";
```

If you use the local wrapper route, make sure `~/.config/opencode/opencode.json` does not also contain a `plugin` entry for `@cyber-dash-tech/revela`, otherwise OpenCode will still try Bun-based installation.

### China mainland note

OpenCode's npm plugin installer uses Bun and may ignore npm mirror configuration. If direct installation fails, use the local wrapper method above or install the package with npm under `~/.config/opencode/` and create a local wrapper file.

---

## Quick Start

Start OpenCode:

```bash
opencode
```

Enable Revela in the current session:

```text
/revela enable
```

Then give the agent a slide task, for example:

```text
Create a 6-slide HTML deck on humanoid robotics supply chains. Use the summit design, cite the main market drivers, and save the result to slides/humanoid-robotics.html.
```

Export the resulting HTML deck to PDF if needed:

```text
/revela pdf slides/humanoid-robotics.html
```

Disable Revela and return the current agent to normal mode:

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
```

All `/revela` commands execute locally with zero LLM cost.

---

## How It Works

When Revela is enabled, it appends a generated prompt to the current agent's system prompt.

That prompt is built from 3 layers:

1. `skill/SKILL.md` — the core slide-generation workflow
2. active domain — domain-specific report structure and terminology
3. active design — visual language, layouts, components, and chart rules

The current design and domain are persisted in `~/.config/revela/config.json`. The session-level enabled/disabled state is not persisted.

---

## Research And File Ingestion

When Revela is enabled, the agent can use:

- `revela-workspace-scan` to discover PDFs, Office files, CSVs, Markdown, and text files in the workspace
- the `revela-research` subagent to fetch targeted web sources and save structured findings into `researches/<topic>/`
- `revela-research-save` to write one findings file per research axis

Supported file types for `@` reference and automatic text extraction:

- `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`

Revela transparently extracts text from these binary files before the main agent reasons over them.

---

## Layout QA And Compliance

Every time the agent writes `slides/*.html`, Revela automatically runs a Puppeteer-based QA pass at `1920x1080`.
The QA report is fed back immediately so the agent can fix layout or compliance problems before moving on.

Current QA dimensions:

| Dimension | What it checks |
|---|---|
| `overflow` | Elements extending outside the slide canvas |
| `balance` | Sparse slides, weak fill, centroid drift, and bottom-gap issues |
| `symmetry` | Side-by-side column imbalance in height or density |
| `rhythm` | Irregular vertical spacing between stacked siblings |
| `compliance` | Unknown design classes and novel CSS rules outside the active design vocabulary |

Slides must declare `slide-qa="true"` or `slide-qa="false"`.

- use `slide-qa="true"` for content-heavy slides that should undergo full layout QA
- use `slide-qa="false"` for structural slides such as cover, TOC, quote, summary, or closing pages

Compliance is part of the generation loop, not a soft suggestion. If the agent introduces classes or CSS rules that are not defined by the active design, QA flags them and the file should be corrected.

You can also run QA manually with the `revela-qa` tool.

---

## Built-in Designs

Switch designs with `/revela designs <name>`.

| Name | Description | Preview |
|---|---|---|
| `aurora` | Dark executive style with structured information density and ECharts-ready data visualization patterns | ![aurora](assets/img/slide-example-aurora.jpg) |
| `summit` | Editorial annual-report style for image-rich narrative slides and restrained business storytelling | ![summit](assets/img/slide-example-summit.jpg) |

---

## Built-in Domains

Switch domains with `/revela domains <name>`.

| Name | Description |
|---|---|
| `general` | No domain specialization |
| `deeptech-investment` | VC and investment analysis: market sizing, technical readiness, moat, and investment thesis |
| `consulting` | Strategic consulting: go/no-go decisions, strategy design, and belief-change reporting |

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

The body defines the visual system used by the agent.

### Marker system

For larger designs, use the current marker format:

```html
<!-- @design:foundation:start -->
Colors, typography, CSS variables, HTML shell, base JS...
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
Composition rules, do/don't guidance, design-specific constraints...
<!-- @design:rules:end -->

<!-- @design:layouts:start -->
<!-- @layout:cover:start qa=false -->
Layout details...
<!-- @layout:cover:end -->

<!-- @layout:two-col:start qa=true -->
Layout details...
<!-- @layout:two-col:end -->
<!-- @design:layouts:end -->

<!-- @design:components:start -->
<!-- @component:card:start -->
Component HTML + CSS...
<!-- @component:card:end -->

<!-- @component:stat-card:start -->
Component HTML + CSS...
<!-- @component:stat-card:end -->
<!-- @design:components:end -->

<!-- @design:chart-rules:start -->
Chart guidance...
<!-- @design:chart-rules:end -->
```

Prompt injection behavior:

- always injected: `@design:foundation`, `@design:rules`, layout index, component index
- fetched on demand: individual `@layout:*`, individual `@component:*`, `@design:chart-rules`

If a design has no markers, Revela falls back to injecting the full `DESIGN.md` body.

### Compliance note for design authors

Revela extracts the allowed CSS class vocabulary from your design and uses it during QA compliance checks. If the agent invents a class or defines a CSS rule outside that vocabulary, QA reports it.

### Install a custom design

```text
/revela designs-add github:your-org/your-design
/revela designs-add https://example.com/my-design.zip
/revela designs-add ./path/to/local/design-folder
```

---

## Custom Domains

A custom domain is a folder containing `INDUSTRY.md` with frontmatter metadata similar to a design.

```text
/revela domains-add github:your-org/your-domain
```

`INDUSTRY.md` is a legacy filename kept for compatibility.

---

## PDF Export

Export a generated HTML deck to PDF:

```text
/revela pdf slides/my-deck.html
```

Revela renders each slide through Chrome/Chromium and assembles the final PDF in the same directory.

---

## Logging

Revela uses structured logging via [tslog](https://tslog.js.org/). To enable verbose debug output:

```bash
REVELA_DEBUG=1 opencode
```

---

## License

MIT — see [LICENSE](LICENSE).
