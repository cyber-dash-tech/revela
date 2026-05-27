# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-617%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

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

Requirements:

- The Codex CLI must be installed and the `codex` command must be available in your shell.
- Your environment must be able to run `npx`; Revela uses `npx -y @cyber-dash-tech/revela@0.17.12 mcp` to start the MCP server.
- For interactive Review actions, `codex exec` must also work because the Review UI uses it for Insight and Comment/Apply Fix requests.

Optional preflight:

```bash
codex --version
codex exec --help
npx --version
```

If `npx` fails with an npm cache permission error, repair the cache ownership or use a writable cache for local checks:

```bash
sudo chown -R "$(id -u):$(id -g)" ~/.npm
npm_config_cache=/tmp/revela-npm-cache bun run smoke:mcp-pack
```

Install Revela through the Codex Git marketplace:

```bash
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref v0.17.12
codex plugin add revela@revela
```

The Git marketplace install provides the Codex plugin shell, skills, hooks, and MCP configuration. When Codex starts the Revela MCP server for the first time, it runs `npx -y @cyber-dash-tech/revela@0.17.12 mcp` so npm can fetch the published package and its dependencies.

You do not need to run `bun install` inside the Codex marketplace clone.

Start a new Codex thread after installing so Codex loads the Revela skills, MCP tools, and hooks.

For release-aligned local validation, run `bun run smoke:mcp-pack`. It packs the current checkout to a temporary npm tarball and starts the MCP server through `npx`, matching the published Codex launcher path without requiring a registry publish.

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
revela, use consulting as the domain.
```

2. Choose the deck design before rendering so generated artifacts use the intended visual language.

```text
revela, use summit as the design.
```

3. Create a custom design when you want a different visual direction.

```text
revela, create a new design named neon-finance with a crisp financial-dashboard style: dark surfaces, precise grids, and bright green accents.
```

Revela may ask for references or constraints, then creates and validates the design. When it is ready, switch to it:

```text
revela, use neon-finance as the design.
```

4. Initialize the narrative from local materials. Init grounds the narrative in the workspace and surfaces gaps; it does not replace the research step.

```text
revela, help me init this workspace from the local materials.
```

5. Research the gaps and bind only source-supported evidence into the narrative.

```text
revela, research the current gaps and bind only source-supported evidence.
```

6. Read Story before rendering to inspect the claim flow, evidence support, caveats, unsupported scope, and open gaps.

```text
revela, show me the Story before we make the deck.
```

7. Create or update the deck plan before generating HTML so slide order, chapter structure, evidence trace, caveats, and visual intent are explicit.

```text
revela, create or update the deck plan before generating HTML.
```

8. Make an HTML deck from the current deck plan and canonical narrative.

```text
revela, make the deck from the current deck plan and narrative.
```

9. Review the generated deck for traceability, diagnostics, and targeted edits.

```text
revela, review the generated deck.
```

10. Export a PDF after deck QA passes.

```text
revela, export the deck to PDF.
```

11. Export an editable PPTX after deck QA passes.

```text
revela, export the deck to PPTX.
```

## Review A Deck

Use Review after generating an HTML deck:

```text
/revela review --deck
```

Review opens a local deck workspace with two main modes:

- Insight explains selected slide content: what claim it supports, what evidence backs it, what caveats or gaps remain, and why it matters in the narrative.
- Comment lets you request targeted edits on the deck, such as layout, copy, hierarchy, spacing, or visual changes.
