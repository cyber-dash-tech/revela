import { describe, expect, it } from "bun:test"
import { spawn } from "child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { tempWorkspace } from "./helpers/tool-helpers"

const serverPath = join(import.meta.dir, "..", "plugins", "revela", "mcp", "revela-server.ts")
const repoRoot = join(import.meta.dir, "..")

describe("Codex plugin MCP server", () => {
  it("responds to framed initialize and tools/list on a long-lived stdin", async () => {
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test" } },
    }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("revela_doctor"))
    child.kill()

    expect(text.stdout).toContain("\"serverInfo\"")
    expect(text.stdout).toContain("revela_doctor")
    expect(text.stdout).toContain("revela_research_targets")
    expect(text.stdout).toContain("revela_research_save")
    expect(text.stdout).toContain("revela_evaluate_research_findings")
    expect(text.stdout).toContain("revela_bind_research_findings")
    expect(text.stdout).toContain("revela_story_read")
  })

  it("parses framed initialize requests using byte Content-Length", async () => {
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "中文 client", version: "0" },
      },
    }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("revela_doctor"))
    child.kill()

    expect(text.stdout).toContain("\"serverInfo\"")
    expect(text.stdout).toContain("revela_doctor")
  })

  it("responds to newline JSON initialize and tools/list before stdin closes", async () => {
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`)

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("revela_doctor"))
    child.kill()

    expect(text.stdout).toContain("\"serverInfo\"")
    expect(text.stdout).toContain("revela_doctor")
  })

  it("responds to raw JSON initialize without waiting for stdin close or newline", async () => {
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "raw-json-test" } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":1") && item.stdout.includes("\"serverInfo\""))
    child.kill()

    expect(text.stdout).toContain("\"serverInfo\"")
    expect(text.stdout).not.toStartWith("Content-Length:")
  })

  it("responds to concatenated raw JSON initialize and tools/list messages", async () => {
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("revela_doctor"))
    child.kill()

    expect(text.stdout).toContain("\"serverInfo\"")
    expect(text.stdout).toContain("revela_doctor")
    expect(text.stdout).not.toStartWith("Content-Length:")
  })

  it("responds when launched from an installed-cache-shaped path", async () => {
    const cacheRoot = tempWorkspace("revela-plugin-cache-")
    const pluginRoot = join(cacheRoot, "plugins", "cache", "revela-local", "revela", "0.1.0")
    mkdirSync(pluginRoot, { recursive: true })
    cpSync(join(repoRoot, "plugins", "revela", "mcp"), join(pluginRoot, "mcp"), { recursive: true })

    const child = spawn("bun", [join(pluginRoot, "mcp", "revela-server.ts")], {
      env: { ...process.env, REVELA_REPO_ROOT: repoRoot },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const output = collectOutput(child)

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("revela_doctor"))
    child.kill()

    expect(text.stdout).toContain("\"serverInfo\"")
    expect(text.stdout).toContain("revela_doctor")
    expect(text.stderr).toBe("")
  })

  it("launches from the plugin .mcp.json without relying on the current working directory", async () => {
    const home = tempWorkspace("revela-mcp-config-home-")
    mkdirSync(join(home, ".codex"), { recursive: true })
    writeFileSync(join(home, ".codex", "config.toml"), `[marketplaces.revela-local]
last_updated = "2026-05-23T00:00:00Z"
source_type = "local"
source = "${repoRoot}"
`, "utf-8")

    const config = JSON.parse(readFileSync(join(repoRoot, "plugins", "revela", ".mcp.json"), "utf-8"))
    const server = config.mcpServers.revela
    const child = spawn(server.command, server.args, {
      cwd: home,
      env: { ...process.env, HOME: home },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const output = collectOutput(child)

    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "config-test" } },
    }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("revela_doctor"))
    child.kill()

    expect(text.stdout).toContain("\"serverInfo\"")
    expect(text.stdout).toContain("revela_doctor")
  })

  it("emits opt-in debug logs to stderr without polluting stdout framing", async () => {
    const child = spawn("bun", [serverPath], {
      env: { ...process.env, REVELA_MCP_DEBUG: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))

    const text = await output.until((item) => (
      item.stdout.includes("\"id\":1") &&
      item.stdout.includes("\"serverInfo\"") &&
      item.stderr.includes("[revela-mcp] startup")
    ))
    child.kill()

    expect(text.stdout).toStartWith("Content-Length:")
    expect(text.stdout).not.toContain("[revela-mcp]")
    expect(text.stderr).toContain("[revela-mcp] request")
    expect(text.stderr).toContain("\"method\":\"initialize\"")
  })

  it("calls research target and findings evaluation tools", async () => {
    const root = tempWorkspace("revela-mcp-research-")
    writeResearchVault(root)
    mkdirSync(join(root, "researches", "pilot"), { recursive: true })
    writeFileSync(join(root, "researches", "pilot", "ops.md"), "- claimId: claim-pilot\n- Source: https://example.com/ops\n", "utf-8")
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "revela_research_targets", arguments: { workspaceRoot: root } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_evaluate_research_findings", arguments: { workspaceRoot: root, findingsFile: "researches/pilot/ops.md" } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":3") && item.stdout.includes("needs_fields"))
    child.kill()

    expect(text.stdout).toContain("research_gap")
    expect(text.stdout).toContain("claim-pilot")
    expect(text.stdout).toContain("needs_fields")
  })

  it("calls the Story read tool with Markdown output", async () => {
    const root = tempWorkspace("revela-mcp-story-")
    writeResearchVault(root)
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "revela_story_read", arguments: { workspaceRoot: root, format: "markdown" } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("Narrative Snapshot"))
    child.kill()

    expect(text.stdout).toContain("claim-pilot")
    expect(text.stdout).toContain("diagnosticsMarkdown")
    expect(text.stdout).toContain("gap-pilot-evidence")
  })
})

function frame(message: unknown): string {
  const body = JSON.stringify(message)
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
}

function collectOutput(child: ReturnType<typeof spawn>) {
  let stdout = ""
  let stderr = ""
  child.stdout?.on("data", (data) => {
    stdout += data.toString()
  })
  child.stderr?.on("data", (data) => {
    stderr += data.toString()
  })

  return {
    until(predicate: (text: { stdout: string; stderr: string }) => boolean): Promise<{ stdout: string; stderr: string }> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error(`Timed out waiting for MCP output. stdout=${stdout} stderr=${stderr}`))
        }, 3000)
        const interval = setInterval(() => {
          const text = { stdout, stderr }
          if (predicate(text)) {
            clearTimeout(timer)
            clearInterval(interval)
            resolve(text)
          }
        }, 10)
      })
    },
  }
}

function writeResearchVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "research-gaps"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:mcp-research\nstatus: needs_research\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Executive committee\nbeliefBefore: Needs proof.\nbeliefAfter: Trusts a bounded pilot.\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:mcp-research\nconfidence: medium\n---\nA bounded pilot is the recommended next step.\n", "utf-8")
  writeFileSync(join(vault, "claims", "pilot.md"), "---\ntype: claim\nid: claim-pilot\nkind: recommendation\nimportance: central\nevidenceRequired: true\n---\nApprove a bounded pilot.\n", "utf-8")
  writeFileSync(join(vault, "research-gaps", "pilot.md"), "---\ntype: research-gap\nid: gap-pilot-evidence\ntargetType: claim\ntargetId: claim-pilot\nquestion: What evidence supports the pilot decision?\nstatus: open\npriority: high\n---\nWhat evidence supports the pilot decision?\n\n## Relations\n\n- depends_on: [[claim-pilot]]\n", "utf-8")
}
