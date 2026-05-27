import { describe, expect, it } from "bun:test"
import { spawn } from "child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { createDeckFoundation, deckFoundationMarkers } from "../lib/deck-html/foundation"
import { seedBuiltinDesigns } from "../lib/design/designs"
import pkg from "../package.json"
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
    expect(text.stdout).toContain("revela_review_deck_read")
    expect(text.stdout).toContain("revela_review_deck_open")
    expect(text.stdout).toContain("revela_design_activate")
    expect(text.stdout).toContain("revela_design_create")
    expect(text.stdout).toContain("revela_design_validate")
    expect(text.stdout).toContain("revela_domain_list")
    expect(text.stdout).toContain("revela_domain_read")
    expect(text.stdout).toContain("revela_domain_activate")
  })

  it("reports the package version through the doctor tool", async () => {
    const root = tempWorkspace("revela-mcp-doctor-")
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "revela_doctor", arguments: { workspaceRoot: root } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes(pkg.version))
    child.kill()

    expect(text.stdout).toContain(`\\\"version\\\": \\\"${pkg.version}\\\"`)
    expect(text.stdout).toContain(`\\\"workspaceRoot\\\": \\\"${root}`)
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
    const pluginRoot = join(cacheRoot, "plugins", "cache", "revela", "revela", "0.1.0")
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

  it("uses the published npm package as the Codex MCP launcher", () => {
    const config = JSON.parse(readFileSync(join(repoRoot, "plugins", "revela", ".mcp.json"), "utf-8"))
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8"))
    const server = config.mcpServers.revela

    expect(server).toEqual({
      command: "npx",
      args: ["-y", `@cyber-dash-tech/revela@${pkg.version}`, "mcp"],
    })
  })

  it("does not keep the legacy Codex marketplace clone resolver in .mcp.json", () => {
    const config = JSON.parse(readFileSync(join(repoRoot, "plugins", "revela", ".mcp.json"), "utf-8"))
    const server = config.mcpServers.revela
    const configText = JSON.stringify(server)

    expect(configText).not.toContain("--eval")
    expect(configText).not.toContain("bin/revela.ts")
    expect(configText).not.toContain(".codex")
    expect(configText).not.toContain("marketplaces")
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

  it("calls design and domain list/read/activate tools", async () => {
    const home = tempWorkspace("revela-mcp-design-domain-home-")
    const child = spawn("bun", [serverPath], {
      env: { ...process.env, HOME: home },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "revela_design_activate", arguments: { name: "starter" } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_design_list", arguments: {} },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "revela_domain_read", arguments: { name: "consulting" } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "revela_domain_activate", arguments: { name: "general" } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "revela_domain_list", arguments: {} },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":6") && item.stdout.includes("activeDomain"))
    child.kill()

    expect(text.stdout).toContain("activeDesign")
    expect(text.stdout).toContain("starter")
    expect(text.stdout).toContain("consulting")
    expect(text.stdout).toContain("activeDomain")
    expect(text.stdout).toContain("general")
  })

  it("creates and validates design packages through MCP tools", async () => {
    const home = tempWorkspace("revela-mcp-design-create-home-")
    const name = `mcp-codex-design-${Date.now()}`
    const child = spawn("bun", [serverPath], {
      env: { ...process.env, HOME: home },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "revela_design_create",
        arguments: {
          name,
          base: "starter",
          designMd: validDesignMd(name),
          previewHtml: validPreviewHtml(),
        },
      },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_design_validate", arguments: { name } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":3") && item.stdout.includes("test-badge"))
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain(name)
    expect(text.stdout).toContain("\\\"base\\\": \\\"starter\\\"")
    expect(text.stdout).toContain("test-layout")
    expect(text.stdout).toContain("test-card")
  })

  it("calls the Review deck read tool with Markdown output", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-mcp-review-")
    writeReviewDeck(root, "decks/review.html")
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "revela_review_deck_read", arguments: { workspaceRoot: root, file: "decks/review.html", format: "markdown" } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("Review Deck Read"), 60000)
    child.kill()

    expect(text.stdout).toContain("Artifact QA: passed")
    expect(text.stdout).toContain("No revela-narrative/")
    expect(text.stdout).toContain("inspectionContext")
  }, 60000)

  it("opens a Codex-backed Review deck server from the MCP process", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-mcp-review-open-")
    writeReviewDeck(root, "decks/review.html")
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "revela_review_deck_open", arguments: { workspaceRoot: root, file: "decks/review.html", openBrowser: false } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("codex-exec"), 60000)
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain("\\\"bridge\\\": \\\"codex-exec\\\"")
    expect(text.stdout).toContain("\\\"mode\\\": \\\"edit\\\"")
    expect(text.stdout).toContain("/codex-review?token=")
    expect(text.stdout).not.toContain("\\\"reviewRead\\\"")
  }, 60000)
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
    until(predicate: (text: { stdout: string; stderr: string }) => boolean, timeoutMs = 3000): Promise<{ stdout: string; stderr: string }> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error(`Timed out waiting for MCP output. stdout=${stdout} stderr=${stderr}`))
        }, timeoutMs)
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

function writeReviewDeck(root: string, outputPath: string): void {
  createDeckFoundation({
    workspaceRoot: root,
    outputPath,
    title: "Review MCP Smoke",
    language: "en",
    designName: "starter",
  })
  const htmlPath = join(root, outputPath)
  const markers = deckFoundationMarkers()
  const html = readFileSync(htmlPath, "utf-8")
  const slide = `
    <section class="slide" slide-qa="false" data-slide-index="1">
        <div class="slide-canvas">
            <div class="page">
                <div class="eyebrow">Review</div>
                <h2>MCP review smoke</h2>
                <p>This slide validates the review read aggregate tool.</p>
            </div>
        </div>
    </section>`
  writeFileSync(htmlPath, html.replace(`${markers.start}\n    ${markers.end}`, `${markers.start}${slide}\n    ${markers.end}`), "utf-8")
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

function validDesignMd(name: string): string {
  return `---
name: ${name}
description: MCP test design
author: test
version: 1.0.0
---

<!-- @design:foundation:start -->
### Foundation
\`\`\`css
.test-card { color: red; }
.test-badge { color: blue; }
\`\`\`
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
### Rules
- Keep hierarchy clear.
<!-- @design:rules:end -->

<!-- @layout:test-layout:start qa=true -->
#### Test Layout
\`\`\`html
<section class="slide" slide-qa="true"><div class="slide-canvas"></div></section>
\`\`\`
<!-- @layout:test-layout:end -->

<!-- @component:test-card:start -->
#### Test Card
\`\`\`html
<div class="test-card">Card</div>
\`\`\`
<!-- @component:test-card:end -->

<!-- @component:test-badge:start -->
#### Test Badge
\`\`\`html
<span class="test-badge">Badge</span>
\`\`\`
<!-- @component:test-badge:end -->`
}

function validPreviewHtml(): string {
  return `<!doctype html>
<html><body>
<section class="slide" slide-qa="false" data-slide-role="cover"><div class="slide-canvas">Cover</div></section>
<section class="slide" slide-qa="true"><div class="slide-canvas"><div data-preview-component="test-card" class="test-card">Card</div><span data-preview-component="test-badge" class="test-badge">Badge</span></div></section>
<section class="slide" slide-qa="false" data-slide-role="closing"><div class="slide-canvas">Closing</div></section>
</body></html>`
}
