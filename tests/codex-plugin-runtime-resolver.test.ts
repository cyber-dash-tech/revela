import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { resolveRevelaRuntime } from "../plugins/revela/mcp/runtime-resolver"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("Codex plugin runtime resolver", () => {
  it("does not rely on PLUGIN_ROOT interpolation for MCP startup", () => {
    const configPath = join(import.meta.dir, "..", "plugins", "revela", ".mcp.json")
    const configText = readFileSync(configPath, "utf-8")

    expect(configText).not.toContain("${PLUGIN_ROOT}")
    expect(configText).not.toContain("/Users/")
  })

  it("resolves the source checkout when running from plugins/revela", () => {
    const root = fakeRepo("revela-resolver-source-")
    const pluginRoot = join(root, "plugins", "revela")

    const resolved = resolveRevelaRuntime({ pluginRoot, env: {}, homeDir: join(root, "home") })

    expect(resolved).toMatchObject({
      ok: true,
      repoRoot: root,
      source: "source-checkout",
    })
  })

  it("uses REVELA_REPO_ROOT when explicitly provided", () => {
    const root = fakeRepo("revela-resolver-env-")
    const pluginRoot = tempWorkspace("revela-resolver-plugin-")

    const resolved = resolveRevelaRuntime({
      pluginRoot,
      env: { REVELA_REPO_ROOT: root },
      homeDir: join(root, "home"),
    })

    expect(resolved).toMatchObject({
      ok: true,
      repoRoot: root,
      source: "env",
    })
  })

  it("resolves installed cache plugins through Codex marketplace config", () => {
    const root = fakeRepo("revela-resolver-marketplace-")
    const home = tempWorkspace("revela-resolver-home-")
    mkdirSync(join(home, ".codex"), { recursive: true })
    writeFileSync(join(home, ".codex", "config.toml"), `[marketplaces.revela]
last_updated = "2026-05-23T00:00:00Z"
source_type = "local"
source = "${root}"
`, "utf-8")
    const pluginRoot = join(home, ".codex", "plugins", "cache", "revela", "revela", "0.1.0")

    const resolved = resolveRevelaRuntime({ pluginRoot, env: {}, homeDir: home })

    expect(resolved).toMatchObject({
      ok: true,
      repoRoot: root,
      source: "codex-marketplace",
    })
  })

  it("resolves git marketplace cache plugins through Codex's marketplace clone", () => {
    const home = tempWorkspace("revela-resolver-git-home-")
    const clone = join(home, ".codex", ".tmp", "marketplaces", "revela")
    fakeRepoAt(clone, { includeBuiltins: true })
    mkdirSync(join(home, ".codex"), { recursive: true })
    writeFileSync(join(home, ".codex", "config.toml"), `[marketplaces.revela]
last_updated = "2026-05-24T00:00:00Z"
source_type = "git"
source = "https://github.com/cyber-dash-tech/revela.git"
ref = "v0.17.9"
`, "utf-8")
    const pluginRoot = join(home, ".codex", "plugins", "cache", "revela", "revela", "0.1.0")

    const resolved = resolveRevelaRuntime({ pluginRoot, env: {}, homeDir: home })

    expect(resolved).toMatchObject({
      ok: true,
      repoRoot: clone,
      source: "codex-marketplace",
    })
    expect(resolved.diagnostics.join("\n")).toContain("source is not a local path")
  })

  it("does not treat git marketplace URLs as local runtime paths", () => {
    const home = tempWorkspace("revela-resolver-git-missing-home-")
    mkdirSync(join(home, ".codex"), { recursive: true })
    writeFileSync(join(home, ".codex", "config.toml"), `[marketplaces.revela]
source_type = "git"
source = "https://github.com/cyber-dash-tech/revela.git"
`, "utf-8")
    const pluginRoot = join(home, ".codex", "plugins", "cache", "revela", "revela", "0.1.0")

    const resolved = resolveRevelaRuntime({ pluginRoot, env: {}, homeDir: home })

    expect(resolved.ok).toBe(false)
    expect(resolved.diagnostics.join("\n")).toContain("source is not a local path")
    expect(resolved.diagnostics.join("\n")).toContain("clone was not found")
    expect(resolved.diagnostics.join("\n")).not.toContain("https://github.com/cyber-dash-tech/revela.git/lib/runtime/index.ts")
  })

  it("keeps resolving legacy revela-local installed cache plugins", () => {
    const root = fakeRepo("revela-resolver-legacy-marketplace-")
    const home = tempWorkspace("revela-resolver-legacy-home-")
    mkdirSync(join(home, ".codex"), { recursive: true })
    writeFileSync(join(home, ".codex", "config.toml"), `[marketplaces.revela-local]
last_updated = "2026-05-23T00:00:00Z"
source_type = "local"
source = "${root}"
`, "utf-8")
    const pluginRoot = join(home, ".codex", "plugins", "cache", "revela-local", "revela", "0.1.0")

    const resolved = resolveRevelaRuntime({ pluginRoot, env: {}, homeDir: home })

    expect(resolved).toMatchObject({
      ok: true,
      repoRoot: root,
      source: "codex-marketplace",
    })
  })
})

function fakeRepo(prefix: string): string {
  const root = tempWorkspace(prefix)
  fakeRepoAt(root)
  return root
}

function fakeRepoAt(root: string, options: { includeBuiltins?: boolean } = {}): string {
  mkdirSync(join(root, "lib", "runtime"), { recursive: true })
  mkdirSync(join(root, "plugins", "revela", ".codex-plugin"), { recursive: true })
  writeFileSync(join(root, "package.json"), "{\"name\":\"@cyber-dash-tech/revela\"}\n", "utf-8")
  writeFileSync(join(root, "lib", "runtime", "index.ts"), "export {}\n", "utf-8")
  writeFileSync(join(root, "plugins", "revela", ".codex-plugin", "plugin.json"), "{\"name\":\"revela\"}\n", "utf-8")
  if (options.includeBuiltins) {
    mkdirSync(join(root, "designs", "summit"), { recursive: true })
    mkdirSync(join(root, "domains", "general"), { recursive: true })
    writeFileSync(join(root, "designs", "summit", "DESIGN.md"), "---\nname: summit\n---\n", "utf-8")
    writeFileSync(join(root, "domains", "general", "INDUSTRY.md"), "---\nname: general\n---\n", "utf-8")
  }
  return root
}
