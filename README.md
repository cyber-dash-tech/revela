# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-611%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

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
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref v0.17.8
codex plugin add revela@revela
```

Install from the full repository ref. Do not use a sparse checkout limited to `plugins/revela`; the Codex plugin resolves the shared runtime, built-in designs, and domains from the repository snapshot.

Start a new Codex thread after installing so Codex loads the Revela skills, MCP tools, and hooks.

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

In Codex, ask Revela to list or switch designs; the plugin uses the active design when making decks.

## Domains

Domains add topic-specific narrative guidance, such as consulting, product, or investor communication. Use them when you want Revela to adapt story framing to a specific context.

```text
/revela domain
```

In Codex, ask Revela to list or switch domains; the active domain guides narrative framing during init, research, and story work.

## Quick Start

Use these prompts in Codex from the workspace that contains your source materials.

1. Choose the narrative domain before authoring so Revela frames the audience, decision, risks, and objections for your context.

```text
Use Revela to list available domains, switch to the consulting domain, and use that framing for the narrative workflow.
```

2. Choose the deck design before rendering so generated artifacts use the intended visual language.

```text
Use Revela to list available designs, switch to the summit design, and use it for the next deck.
```

3. Initialize the narrative from local materials. Init grounds the narrative in the workspace and surfaces gaps; it does not replace the research step.

```text
Use Revela to initialize this workspace. Read the local materials, identify the audience, decision, thesis, claims, existing evidence, risks, objections, and gaps, then create or update the narrative vault.
```

4. Research the gaps and bind only source-supported evidence into the narrative.

```text
Use Revela research to inspect the current narrative gaps, derive research targets, gather or evaluate findings, save research under researches/, and bind only source-supported evidence back into the narrative vault.
```

5. Read Story before rendering to inspect the claim flow, evidence support, caveats, unsupported scope, and open gaps.

```text
Use Revela Story to show the current claim flow, evidence support, caveats, unsupported scope, and open gaps.
```

6. Create or update the deck plan before generating HTML so slide order, chapter structure, evidence trace, caveats, and visual intent are explicit.

```text
Use Revela to create or update the deck plan before generating HTML. Read the current narrative, inspect any existing deck-plan/, define the slide order, chapter structure, evidence trace, caveats, and visual intent, then report the plan diagnostics.
```

7. Make an HTML deck from the current deck plan and canonical narrative.

```text
Use Revela to make a deck from the current deck plan and narrative. Generate an HTML deck under decks/, run deck QA, and repair hard QA errors before review or export.
```

8. Review the generated deck for traceability, diagnostics, and targeted edits.

```text
Use Revela to review the generated deck. Open the Review UI for the HTML deck and also summarize diagnostics.
```

9. Export a PDF after deck QA passes.

```text
Use Revela to export the deck to PDF.
```

10. Export an editable PPTX after deck QA passes.

```text
Use Revela to export the deck to PPTX.
```

## Review A Deck

Use Review after generating an HTML deck:

```text
/revela review --deck
```

Review opens a local deck workspace with two main modes:

- Insight explains selected slide content: what claim it supports, what evidence backs it, what caveats or gaps remain, and why it matters in the narrative.
- Comment lets you request targeted edits on the deck, such as layout, copy, hierarchy, spacing, or visual changes.
