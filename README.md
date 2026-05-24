# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-609%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="560" />
</p>

Revela works from [OpenCode](https://opencode.ai) and Codex to turn source materials, research, data, and intent into trusted, traceable, presentation-ready decision artifacts.

Its narrative workspace records the core elements needed to generate a brief or deck: audience, decision, claims, evidence, sources, risks, objections, and open gaps.

## Install

### OpenCode

Install Revela through `opencode.json` with the npm package `@cyber-dash-tech/revela`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@cyber-dash-tech/revela"]
}
```

Restart OpenCode.

To install globally, add the same entry to `~/.config/opencode/opencode.json`.

### Codex

Install Revela through the Codex Git marketplace:

```bash
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref main
codex plugin add revela@revela
```

Use a release tag instead of `main` when you want a pinned install.

## Built-In Designs

Revela includes built-in deck designs:

### [summit](designs/summit/preview.html)

<p align="center">
  <img src="assets/img/summit-01.jpg" alt="Summit design preview 1" width="32%" />
  <img src="assets/img/summit-02.jpg" alt="Summit design preview 2" width="32%" />
  <img src="assets/img/summit-03.jpg" alt="Summit design preview 3" width="32%" />
</p>

### [monet](designs/monet/preview.html)

<p align="center">
  <img src="assets/img/monet-01.jpg" alt="Monet design preview 1" width="32%" />
  <img src="assets/img/monet-02.jpg" alt="Monet design preview 2" width="32%" />
  <img src="assets/img/monet-03.jpg" alt="Monet design preview 3" width="32%" />
</p>

`starter` is the clean default presentation style.

Switch designs with:

```text
/revela design --use summit
```

## Domains

Domains add topic-specific narrative guidance, such as consulting, product, or investor communication. Use them when you want Revela to adapt story framing to a specific context.

```text
/revela domain
```

## Quick Start

Start with the local source materials and intent that should ground the communication. Revela identifies the audience, decision, claims, evidence, risks, objections, and gaps that shape the narrative.

When evidence is missing, use research to gather findings and bind only the supported parts back to the narrative. Before rendering, read the Story view to inspect the claim flow, evidence support, caveats, and open gaps.

Make a deck or brief from the canonical narrative when the story is ready to present. Review the artifact with Insight to understand support and traceability, use Comment for targeted changes, and export to PDF or PPTX when you need a shareable file.

## Review A Deck

Use Review after generating an HTML deck:

```text
/revela review --deck
```

Review opens a local deck workspace with two main modes:

- Insight explains selected slide content: what claim it supports, what evidence backs it, what caveats or gaps remain, and why it matters in the narrative.
- Comment lets you request targeted edits on the deck, such as layout, copy, hierarchy, spacing, or visual changes.
