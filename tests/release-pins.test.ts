import { describe, expect, it } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import pkg from "../package.json"

const repoRoot = join(import.meta.dir, "..")

describe("release pins", () => {
  it("keeps the Codex MCP launcher pinned to the package version", () => {
    const config = JSON.parse(readFileSync(join(repoRoot, "plugins", "revela", ".mcp.json"), "utf-8"))
    const server = config.mcpServers.revela

    expect(server).toEqual({
      command: "npx",
      args: ["-y", `@cyber-dash-tech/revela@${pkg.version}`, "mcp"],
    })
  })

  it("keeps README Codex install pins aligned with the package version", () => {
    const expectedNpmLauncher = `npx -y @cyber-dash-tech/revela@${pkg.version} mcp`
    const expectedMarketplaceRef = `codex plugin marketplace add https://github.com/cyber-dash-tech/revela --ref v${pkg.version}`

    for (const file of ["README.md", "README.zh-CN.md"]) {
      const text = readFileSync(join(repoRoot, file), "utf-8")

      expect(text).toContain(expectedNpmLauncher)
      expect(text).toContain(expectedMarketplaceRef)
    }
  })
})
