# Codex Plugin Product Plan

## Summary

Revela's Codex product surface is a CLI-first local adapter with optional Codex plugin packaging. The core contract is `lib/runtime/` plus the `revela` CLI and MCP server; the repo-local plugin packages skills, hooks, and MCP config for convenience without replacing the current OpenCode plugin.

The target product shape is:

- `revela` CLI entry point for deterministic local operations and `revela mcp`
- Codex plugin package under `plugins/revela/` as optional packaging
- Repo-local marketplace under `.agents/plugins/marketplace.json` for local plugin install
- Codex skills for workflow guidance
- MCP tools for deterministic Revela capabilities
- Optional Codex hooks as safety nets

OpenCode remains the release-compatible surface while the Codex adapter is built.

## Product Goals

- Make Revela usable in Codex with the same product promise: turn source materials, research, data, and user intent into trusted, traceable, presentation-ready decision artifacts.
- Preserve the current file-native architecture: local materials and `researches/` for source inputs, `deck-plan.md` for render planning, `decks/*.html` for artifacts, and `assets/` for media.
- Keep existing OpenCode `/revela ...` commands working.
- Avoid duplicating compiler, QA, export, design, or state logic inside the Codex plugin.

## Development Modules

Codex support is built as small adapter modules around existing Revela capabilities. Shared deterministic behavior belongs in existing Revela libraries or `lib/runtime/`; Codex plugin files should only package, guide, expose, or guard those capabilities.

1. CLI and shared runtime boundary
   - Purpose: provide the stable local contract Codex and other adapters can use without marketplace packaging.
   - Main surfaces: `bin/revela.ts`, `lib/runtime/`.
   - Enables: JSON-safe commands and `revela mcp` for workspace doctor checks, narrative compile, Markdown QA, deck-plan read, deck foundation creation, artifact QA, Review deck read, PDF/PPTX export, design reads/activation, and domain reads/activation.
   - Does not own: duplicated compiler, QA, export, design, or state implementations; it wraps existing implementations.

2. Codex plugin package
   - Purpose: provide the installable Codex plugin surface.
   - Main surfaces: `plugins/revela/.codex-plugin/plugin.json`, `plugins/revela/`.
   - Enables: Codex can discover Revela metadata, bundled skills, MCP config, hooks, and assets.
   - Does not own: OpenCode command routing, narrative compilation, artifact rendering, QA, export logic, or the primary runtime contract.

3. Repo-local marketplace
   - Purpose: make local development installation repeatable.
   - Main surface: `.agents/plugins/marketplace.json`.
   - Enables: `codex plugin marketplace add .` and `codex plugin add revela@revela`.
   - Does not own: public marketplace distribution, npm publishing, or version release flow.

4. Workflow skills
   - Purpose: give Codex workflow guidance that replaces OpenCode prompt injection for Codex sessions.
   - Main surfaces: `plugins/revela/skills/revela-helper`, `revela-design`, `revela-domain`, `revela-research`, `revela-make-deck`, `revela-review`, and `revela-export`.
   - Enables: file-native helper/status, Design authoring, Domain authoring, Research, Plan Deck, Make Deck, Review Deck, and Export workflows in Codex.
   - Cross-cutting design/domain guidance is read through MCP tools inside these workflows: design/domain skills author packages, research uses domain/design tools, and make-deck uses design tools.
   - Does not own: hidden workflow state, approval gates, OpenCode slash-command parity, or direct mutation of canonical compiled caches.

5. MCP server
   - Purpose: expose shared runtime functions to Codex as tools over stdio JSON-RPC.
   - Main surfaces: `bin/revela.ts`, `plugins/revela/mcp/revela-server.ts`, `plugins/revela/mcp/runtime-resolver.ts`, `plugins/revela/.mcp.json`.
   - Enables: Codex tool calls such as `revela_prepare_local_materials`, `revela_extract_document_materials`, `revela_research_save`, `revela_read_deck_plan`, `revela_upsert_deck_plan_slide` as a compatibility/repair helper, `revela_create_deck_foundation`, `revela_run_deck_qa`, `revela_review_deck_open`, `revela_review_deck_read`, `revela_export_pdf`, `revela_export_pptx`, `revela_export_png`, `revela_design_list`, `revela_design_read`, `revela_design_inventory`, `revela_design_create`, `revela_design_draft_create`, `revela_design_draft_install`, `revela_design_activate`, `revela_domain_list`, `revela_domain_read`, `revela_domain_create`, `revela_domain_draft_create`, `revela_domain_draft_install`, and `revela_domain_activate`.
   - Does not own: product workflow policy, broad orchestration, or OpenCode tool replacement. Prefer `revela mcp` as the stable entry; plugin `.mcp.json` is a wrapper for Codex plugin installation.

6. Codex hooks
   - Purpose: provide safety checks and user-visible reminders around risky file edits.
   - Main surfaces: `plugins/revela/hooks/hooks.json`, `plugins/revela/hooks/revela_guard.ts`, `plugins/revela/hooks/revela_post_write_notice.ts`.
   - Enables: legacy deck-state edit protection and post-write Artifact QA for deck HTML patches.
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

1. CLI, runtime, and MCP contract
   - Add `bin/revela.ts` with `revela mcp` and JSON-output runtime commands.
   - Keep MCP tool behavior backed by `lib/runtime/`.

2. Codex plugin package and repo-local marketplace
   - Add `plugins/revela/.codex-plugin/plugin.json`.
   - Add `.agents/plugins/marketplace.json` pointing at `./plugins/revela`.
   - Add minimal assets and install-surface metadata.

3. Workflow skills
   - Add `revela-helper`, `revela-design`, `revela-domain`, `revela-research`, `revela-make-deck`, `revela-review`, and `revela-export`.
   - Fold design/domain package authoring into dedicated skills, local material init and design-aware `deck-plan.md` handoff into `revela-research`, and design-aware rendering into `revela-make-deck`.
   - Skills must refer to Codex MCP tools and normal file edits, not OpenCode-only slash commands or OpenCode tool names.

4. Shared runtime boundary
   - Add `lib/runtime/` functions that wrap existing Revela library capabilities without importing `@opencode-ai/plugin`.
   - Return JSON-safe outputs suitable for MCP, CLI, and future adapters.

5. MCP tools
   - Add a thin MCP stdio server that exposes runtime functions to Codex.
   - Expose it through `revela mcp`; bundle a plugin `.mcp.json` wrapper for local plugin installs.

6. Codex hooks as safety nets
   - Add plugin hooks for direct `DECKS.json` edits and Artifact QA.
   - Treat hooks as defense-in-depth, not the primary workflow engine.

7. Validation and smoke docs
   - Verify the plugin files validate structurally.
   - Run focused tests for runtime behavior, then full `bun test`, `bun run typecheck`, and `npm pack --dry-run` before release.

## Smoke Backfill

The first Codex smoke run proved the file-native workflow can complete through the local plugin and MCP server. Backfill priorities:

- Keep `revela mcp` and MCP discovery as the normal runtime path; direct JSON-RPC is debug-only.
- Treat `review <deck.html>` as an interactive Review UI open through `revela_review_deck_open`; use `revela review-read --file <deck.html>` and `revela_review_deck_read` when deterministic diagnostics are explicitly requested.
- Document that browser-based QA and export may require command escalation in sandboxed Codex sessions.
- Preserve the QA repair loop for text clipping and overflow.
- Treat non-active legacy deck target warnings as non-blocking for standalone smoke artifacts when hard QA passes.
- Ensure runtime deck-plan reads pass the compiled narrative hash for stale-plan diagnostics.
- The plugin `.mcp.json` wrapper exists for Codex plugin installation. Do not treat marketplace installation as the runtime source of truth; the first-class CLI/MCP entry is `revela mcp`.

## Review UI Roadmap

Codex Review UI is the default surface for a plain `review <deck.html>` request. The current supported Codex Review surface is `revela_review_deck_open` for browser QA and Leave Comment / Apply, `revela_review_deck_read` over MCP for aggregate diagnostics, `revela review-read` over CLI for deterministic diagnostic reads, and `revela_run_deck_qa` for focused artifact QA.

The next Review server batch should add a Codex-safe prompt bridge before exposing the existing local Refine workspace through MCP. The bridge should be layered so the browser UI can keep working even when a deeper Codex integration is unavailable:

- `pending` bridge: the stable MCP fallback. Browser Apply actions create pending Review requests from saved comments; Codex reads them through MCP tools, performs the work, and submits structured results back to the server.
- `codex-exec` / Codex SDK bridge: the first direct Codex Review server path. Browser Apply actions start a short-lived Codex job from a saved comment, preferably `codex exec --json --ephemeral -C <workspace>` or the SDK equivalent, wait for structured output, then close the process/thread.
- `codex-app-server` bridge: a later deep-integration path for Codex App/CLI parity, current-thread steering, streamed events, and richer approval handling.

Use the `codex-exec` / SDK bridge as the MVP implementation route for interactive Codex Review. It is simpler than the app-server protocol, matches Codex's non-interactive CLI/SDK strengths, and avoids depending on a current interactive session. Review read diagnostics remain read-only. Applying saved comments may patch artifacts for pure visual edits, while meaning changes must update `deck-plan.md` before artifacts are remade.

Review event-stream reliability remains a follow-up for the `codex-exec` bridge. Raw Codex JSONL events such as `{"type":"turn.started"}` are start/progress signals only, not terminal completion. The `/api/comment-events` SSE stream should send heartbeat comments while requests are pending, and the Review server should use an idle timeout appropriate for long-running Codex jobs so quiet streams are not closed by Bun's default idle timeout. Frontend fallback polling must still surface terminal `completed`, `failed`, or `timeout` request states when SSE disconnects. Deck-version updates remain authoritative for preview refresh, but they must not be confused with Codex job completion.

Interactive Review should attempt to open the local Review page by default; test, CI, sandbox, and no-GUI flows may pass `openBrowser: false` and use the returned URL instead.

The current OpenCode Review server depends on an OpenCode `client.session.prompt` callback for Comment interactions; Codex uses the `codex-exec` bridge instead. Deeper Codex app-server integration remains deferred.

## Non-Goals

- Do not push to GitHub.
- Do not publish to npm.
- Do not bump package version.
- Do not rewrite `plugin.ts` for Codex.
- Do not remove or rename OpenCode commands, tools, agents, or prompt modes.
- Do not pursue exact Codex slash-command parity in the MVP.

## Local Usage

For direct local development, use the CLI/MCP entry first:

```bash
bun bin/revela.ts doctor
bun bin/revela.ts mcp
```

For plugin packaging, add the repo marketplace to Codex:

```bash
codex plugin marketplace add .
codex plugin add revela@revela
```

Start a new Codex thread after installation so Codex loads the plugin skills, MCP config, and hooks.

See `docs/CODEX_PLUGIN_SMOKE.md` for the smoke checklist.
