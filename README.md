# Revela

**English** | [中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@cyber-dash-tech/revela)](https://www.npmjs.com/package/@cyber-dash-tech/revela) [![license](https://img.shields.io/npm/l/@cyber-dash-tech/revela)](LICENSE) [![tests](https://img.shields.io/badge/tests-688%20passing-brightgreen)](tests/) [![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-blue)](https://opencode.ai) [![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-orange)](https://bun.sh)

<p align="center">
  <img src="assets/img/logo.png" alt="Revela" width="560" />
</p>

Revela works from [OpenCode](https://opencode.ai) and Codex to turn source materials, research, data, and intent into trusted, traceable, presentation-ready decision artifacts.

Its deck-first workspace reviews local materials, saves source-linked research, builds an explicit `deck-plan.md`, generates HTML decks, reviews them, and exports PDF/PPTX/PNG artifacts.

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
- Your environment must be able to run `npx`; Revela uses `npx -y @cyber-dash-tech/revela@0.18.2 mcp` to start the MCP server.
- For interactive Review actions, `codex exec` must also work because the Review UI uses it for Comment/Apply Fix requests.

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
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref v0.18.2
codex plugin add revela@revela
```

The Git marketplace install provides the Codex plugin shell, skills, hooks, and MCP configuration. When Codex starts the Revela MCP server for the first time, it runs `npx -y @cyber-dash-tech/revela@0.18.2 mcp` so npm can fetch the published package and its dependencies.

You do not need to run `bun install` inside the Codex marketplace clone.

Start a new Codex thread after installing so Codex loads the Revela skills, MCP tools, and hooks.

For release-aligned local validation, run `bun run smoke:mcp-pack`. It packs the current checkout to a temporary npm tarball and starts the MCP server through `npx`, matching the published Codex launcher path without requiring a registry publish.

#### Codex Upgrade

In Codex, ask Revela to check the current runtime version; the plugin calls `revela_doctor` and reports the running `version`.

For a fixed release tag, reinstall the plugin from that tag:

```bash
codex plugin remove revela@revela
codex plugin marketplace remove revela
codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref vX.Y.Z
codex plugin add revela@revela
```

For a marketplace entry that intentionally tracks a branch or movable ref, upgrade the marketplace clone and re-add the plugin:

```bash
codex plugin marketplace upgrade revela
codex plugin add revela@revela
```

The Git marketplace ref and `.mcp.json` npm pin are part of the same release artifact. Start a new Codex thread after upgrading so Codex reloads the Revela skills, MCP tools, hooks, and runtime pin.

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

Domains add topic-specific communication guidance, such as consulting, product, or investor communication. Use them when you want Revela to adapt deck framing to a specific context.

```text
/revela domain
```

In Codex, ask Revela to list or switch domains; the active domain guides deck framing during init, research, and planning.

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

4. Initialize local material intake. Init scans, extracts, and reviews workspace sources; it does not create a Narrative Vault.

```text
revela, help me init this workspace from the local materials.
```

5. Research source-linked deck inputs and save findings.

```text
revela, research the public evidence and examples needed for this deck.
```

6. Create or update the deck plan before generating HTML so slide order, chapter structure, source links, caveats, and visual intent are explicit.

```text
revela, create or update the deck plan before generating HTML.
```

7. Make an HTML deck from the current deck plan.

```text
revela, make the deck from the current deck plan.
```

8. Review the generated deck for Artifact QA and targeted edits.

```text
revela, review the generated deck.
```

9. Export a PDF after deck QA passes.

```text
revela, export the deck to PDF.
```

10. Export an editable PPTX after deck QA passes.

```text
revela, export the deck to PPTX.
```

11. Export per-slide PNG files after deck QA passes.

```text
revela, export the deck to PNG.
```

## Review A Deck

Use Review after generating an HTML deck:

```text
/revela review --deck
```

Review opens a local deck workspace for QA and targeted edits:

- Comment lets you request targeted edits on the deck, such as layout, copy, hierarchy, spacing, or visual changes.
