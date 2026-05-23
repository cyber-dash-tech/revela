# Codex Plugin Product Plan

## Summary

Revela's Codex product surface is a repo-local Codex plugin that lets users run the Revela narrative artifact workflow from Codex CLI and Codex App without replacing the current OpenCode plugin.

The target product shape is:

- Codex plugin package under `plugins/revela/`
- Repo-local marketplace under `.agents/plugins/marketplace.json`
- Codex skills for workflow guidance
- MCP tools for deterministic Revela capabilities
- Optional Codex hooks as safety nets

OpenCode remains the release-compatible surface while the Codex adapter is built.

## Product Goals

- Make Revela usable in Codex with the same product promise: turn source materials, research, data, and user intent into trusted, traceable, presentation-ready decision artifacts.
- Preserve the current file-native architecture: `revela-narrative/` for canonical meaning, `deck-plan/` for render planning, `decks/*.html` for artifacts, `researches/` for findings, and `assets/` for media.
- Keep existing OpenCode `/revela ...` commands working.
- Avoid duplicating compiler, QA, export, design, or state logic inside the Codex plugin.

## Development Modules

Codex support is built as small adapter modules around existing Revela capabilities. Shared deterministic behavior belongs in existing Revela libraries or `lib/runtime/`; Codex plugin files should only package, guide, expose, or guard those capabilities.

1. Codex plugin package
   - Purpose: provide the installable Codex plugin surface.
   - Main surfaces: `plugins/revela/.codex-plugin/plugin.json`, `plugins/revela/`.
   - Enables: Codex can discover Revela metadata, bundled skills, MCP config, hooks, and assets.
   - Does not own: OpenCode command routing, narrative compilation, artifact rendering, QA, or export logic.

2. Repo-local marketplace
   - Purpose: make local development installation repeatable.
   - Main surface: `.agents/plugins/marketplace.json`.
   - Enables: `codex plugin marketplace add .` and `codex plugin add revela@revela-local`.
   - Does not own: public marketplace distribution, npm publishing, or version release flow.

3. Workflow skills
   - Purpose: give Codex workflow guidance that replaces OpenCode prompt injection for Codex sessions.
   - Main surfaces: `plugins/revela/skills/revela-init`, `revela-research`, `revela-story`, `revela-make-deck`, `revela-review-deck`, `revela-export`, and `revela-design`.
   - Enables: file-native Init, Research, Story, Make, Review, Export, and Design workflows in Codex.
   - Does not own: hidden workflow state, approval gates, OpenCode slash-command parity, or direct mutation of canonical compiled caches.

4. Shared runtime boundary
   - Purpose: expose deterministic Revela operations through adapter-safe functions.
   - Main surface: `lib/runtime/`.
   - Enables: JSON-safe calls for workspace doctor checks, narrative compile, Markdown QA, deck-plan read, deck foundation creation, artifact QA, PDF/PPTX export, and design reads.
   - Does not own: duplicated compiler, QA, export, design, or state implementations; it wraps the existing implementations.

5. MCP server
   - Purpose: expose shared runtime functions to Codex as tools over stdio JSON-RPC.
   - Main surfaces: `plugins/revela/mcp/revela-server.ts`, `plugins/revela/mcp/runtime-resolver.ts`, `plugins/revela/.mcp.json`.
   - Enables: Codex tool calls such as `revela_compile_narrative`, `revela_markdown_qa`, `revela_read_deck_plan`, `revela_create_deck_foundation`, `revela_run_deck_qa`, `revela_export_pdf`, `revela_export_pptx`, `revela_design_list`, and `revela_design_read`.
   - Does not own: product workflow policy, broad orchestration, or OpenCode tool replacement. Current local MCP startup warnings are non-blocking for unrelated development when the local smoke test passes.

6. Codex hooks
   - Purpose: provide safety checks and user-visible reminders around risky file edits.
   - Main surfaces: `plugins/revela/hooks/hooks.json`, `plugins/revela/hooks/revela_guard.ts`, `plugins/revela/hooks/revela_post_write_notice.ts`.
   - Enables: legacy deck-state edit protection and post-write QA reminders.
   - Does not own: primary workflow execution, narrative authoring, or automatic artifact repair.

7. Assets and install surface
   - Purpose: package plugin-facing static materials and future distribution metadata.
   - Main surface: `plugins/revela/assets/`.
   - Enables: local plugin presentation now and future marketplace polish.
   - Does not own: deck media assets, workspace `assets/`, or evidence/source-material storage.

8. Validation and smoke docs
   - Purpose: keep the Codex adapter verifiable without relying on a full OpenCode session.
   - Main surfaces: `tests/codex-plugin-mcp-server.test.ts`, `scripts/codex-mcp-smoke.ts`, `docs/CODEX_PLUGIN_SMOKE.md`, `docs/CODEX_PLUGIN_CAPABILITY_MATRIX.md`.
   - Enables: MCP handshake checks, runtime behavior checks, smoke workflow validation, and capability tracking.
   - Does not own: release publishing or replacing the release gate of `bun test`, `bun run typecheck`, and `npm pack --dry-run`.

## Implementation Milestones

1. Codex plugin package and repo-local marketplace
   - Add `plugins/revela/.codex-plugin/plugin.json`.
   - Add `.agents/plugins/marketplace.json` pointing at `./plugins/revela`.
   - Add minimal assets and install-surface metadata.

2. Workflow skills
   - Add `revela-init`, `revela-research`, `revela-story`, `revela-make-deck`, `revela-review-deck`, `revela-export`, and `revela-design`.
   - Skills must refer to Codex MCP tools and normal file edits, not OpenCode-only slash commands or OpenCode tool names.

3. Shared runtime boundary
   - Add `lib/runtime/` functions that wrap existing Revela library capabilities without importing `@opencode-ai/plugin`.
   - Return JSON-safe outputs suitable for MCP, CLI, and future adapters.

4. MCP tools
   - Add a thin MCP stdio server that exposes runtime functions to Codex.
   - Bundle it through `plugins/revela/.mcp.json`.

5. Codex hooks as safety nets
   - Add plugin hooks for direct `DECKS.json` edits and QA reminders.
   - Treat hooks as defense-in-depth, not the primary workflow engine.

6. Validation and smoke docs
   - Verify the plugin files validate structurally.
   - Run focused tests for runtime behavior, then full `bun test`, `bun run typecheck`, and `npm pack --dry-run` before release.

## Smoke Backfill

The first Codex smoke run proved the file-native workflow can complete through the local plugin and MCP server. Backfill priorities:

- Keep MCP discovery as the normal path; direct JSON-RPC is debug-only.
- Document that browser-based QA and export may require command escalation in sandboxed Codex sessions.
- Preserve the QA repair loop for text clipping and overflow.
- Treat non-active legacy deck target warnings as non-blocking for standalone smoke artifacts when hard QA passes.
- Ensure runtime deck-plan reads pass the compiled narrative hash for stale-plan diagnostics.
- Current Codex MCP startup does not expand `${PLUGIN_ROOT}` in `.mcp.json` args. The local development plugin uses a portable `bun --eval` launcher that locates the MCP server from the source checkout, marketplace source config, or installed plugin cache. Replace this with a package bin or first-class CLI entry before public distribution.

## Non-Goals

- Do not push to GitHub.
- Do not publish to npm.
- Do not bump package version.
- Do not rewrite `plugin.ts` for Codex.
- Do not remove or rename OpenCode commands, tools, agents, or prompt modes.
- Do not pursue exact Codex slash-command parity in the MVP.

## Local Usage

After implementation, add the repo marketplace to Codex:

```bash
codex plugin marketplace add .
codex plugin add revela@revela-local
```

Start a new Codex thread after installation so Codex loads the plugin skills, MCP config, and hooks.

See `docs/CODEX_PLUGIN_SMOKE.md` for the smoke checklist.
