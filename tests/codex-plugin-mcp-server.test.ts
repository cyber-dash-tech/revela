import { describe, expect, it } from "bun:test"
import { spawn } from "child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { createDeckFoundation, deckFoundationMarkers } from "../lib/deck-html/foundation"
import { seedBuiltinDesigns } from "../lib/design/designs"
import pkg from "../package.json"
import { tempWorkspace } from "./helpers/tool-helpers"
import { zipSync, strToU8 } from "fflate"

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
    expect(text.stdout).toContain("revela_read_deck_plan")
    expect(text.stdout).not.toContain("revela_upsert_deck_plan\\\"")
    expect(text.stdout).toContain("revela_upsert_deck_plan_slide")
    expect(text.stdout).toContain("Template-aware repair helper")
    expect(text.stdout).toContain("revela_list_page_templates")
    expect(text.stdout).toContain("revela_render_template_slide")
    expect(text.stdout).toContain("revela_add_template_slide")
    expect(text.stdout).toContain("revela_page_template_foundation")
    expect(text.stdout).toContain("revela_page_template_vocabulary")
    expect(text.stdout).toContain("revela_render_template_scaffold")
    expect(text.stdout).toContain("revela_add_template_scaffold")
    expect(text.stdout).toContain("revela_research_save")
    expect(text.stdout).toContain("revela_export_png")
    expect(text.stdout).toContain("revela_review_deck_read")
    expect(text.stdout).toContain("revela_open_deck")
    expect(text.stdout).toContain("revela_switch_deck_design")
    expect(text.stdout).not.toContain("revela_review_deck_open")
    expect(text.stdout).not.toContain("revela_research_targets")
    expect(text.stdout).not.toContain("revela_evaluate_research_findings")
    expect(text.stdout).not.toContain("revela_bind_research_findings")
    expect(text.stdout).not.toContain("revela_story_read")
    expect(text.stdout).toContain("revela_design_inventory")
    expect(text.stdout).not.toContain("revela_design_read_layout")
    expect(text.stdout).not.toContain("revela_design_read_component")
    expect(text.stdout).toContain("revela_design_activate")
    expect(text.stdout).toContain("revela_design_create")
    expect(text.stdout).toContain("revela_design_validate")
    expect(text.stdout).toContain("revela_design_draft_create")
    expect(text.stdout).toContain("revela_design_draft_validate")
    expect(text.stdout).toContain("revela_design_draft_install")
    expect(text.stdout).toContain("revela_design_pack")
    expect(text.stdout).toContain("revela_design_install_archive")
    expect(text.stdout).toContain("revela_design_preview")
    expect(text.stdout).toContain("\"builtin\"")
    expect(text.stdout).toContain("user-uploaded or local materials")
    expect(text.stdout).toContain("Must start with assets/")
    expect(text.stdout).toContain("revela_domain_list")
    expect(text.stdout).toContain("revela_domain_read")
    expect(text.stdout).toContain("revela_domain_activate")
    expect(text.stdout).toContain("revela_domain_create")
    expect(text.stdout).toContain("revela_domain_validate")
    expect(text.stdout).toContain("revela_domain_draft_create")
    expect(text.stdout).toContain("revela_domain_draft_validate")
    expect(text.stdout).toContain("revela_domain_draft_install")
    expect(text.stdout).toContain("revela_prepare_local_materials")
    expect(text.stdout).toContain("revela_extract_document_materials")
    expect(text.stdout).toContain("revela_record_material_review")
    expect(text.stdout).toContain("revela_check_material_intake")
    expect(text.stdout).toContain("## Finding: <stable-id>")
    expect(text.stdout).toContain("## Synthesis: <stable-id>")
    expect(text.stdout).toContain("## Analysis: <stable-id>")
    expect(text.stdout).toContain("## Implementation Note: <stable-id>")
    expect(text.stdout).toContain("## Asset Lead: <stable-id>")
    expect(text.stdout).toContain("source, quote/snippet, support scope or Supports")
    expect(text.stdout).toContain("Evidence boundary or unsupported scope")
    expect(text.stdout).toContain("Strength")
    expect(text.stdout).toContain("Interpretation")
    expect(text.stdout).toContain("Decision implication")
    expect(text.stdout).toContain("Confidence")
    expect(text.stdout).toContain("Alternative reading")
    expect(text.stdout).toContain("Deck use")
    expect(text.stdout).toContain("Display note")
  })

  it("reports the package version through the doctor tool", async () => {
    const root = tempWorkspace("revela-mcp-doctor-")
    const home = tempWorkspace("revela-mcp-doctor-home-")
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, HOME: home } })
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
    expect(text.stdout).toContain(`\\\"activeDomain\\\": \\\"general\\\"`)
    expect(text.stdout).toContain("\\\"activeDomainDescription\\\": \\\"General purpose")
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

  it("launches the Codex MCP server from the installed plugin cache", () => {
    const config = JSON.parse(readFileSync(join(repoRoot, "plugins", "revela", ".mcp.json"), "utf-8"))
    const server = config.mcpServers.revela

    expect(server).toEqual({
      cwd: ".",
      command: "bun",
      args: ["./mcp/revela-server.ts"],
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

  it("saves source-linked research findings through MCP", async () => {
    const root = tempWorkspace("revela-mcp-research-")
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "revela_research_save",
        arguments: {
          workspaceRoot: root,
          topic: "pilot",
          filename: "ops",
          content: "Source: https://example.com/ops\nQuote: Pilot reduced cycle time.\nSupports: deck-plan source context only.",
          sources: ["https://example.com/ops"],
        },
      },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("researches/pilot/ops.md"))
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(readFileSync(join(root, "researches", "pilot", "ops.md"), "utf-8")).toContain("Pilot reduced cycle time")
  })

  it("calls design and domain list/read/activate tools", async () => {
    const home = tempWorkspace("revela-mcp-design-domain-home-")
    const root = tempWorkspace("revela-mcp-switch-design-")
    createDeckFoundation({
      workspaceRoot: root,
      outputPath: "decks/switch.html",
      title: "Switch",
      language: "en",
      designName: "starter",
    })
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
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "revela_switch_deck_design", arguments: { workspaceRoot: root, file: "decks/switch.html", name: "summit", openBrowser: false } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":7") && item.stdout.includes("switch-active"))
    child.kill()

    expect(text.stdout).toContain("activeDesign")
    expect(text.stdout).toContain("starter")
    expect(text.stdout).toContain("summit")
    expect(text.stdout).toContain("switch-active")
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

  it("reads design inventory, layouts, and components through MCP tools", async () => {
    const home = tempWorkspace("revela-mcp-design-inventory-home-")
    const name = `mcp-codex-inventory-${Date.now()}`
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
      params: { name: "revela_design_inventory", arguments: { name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "revela_design_read", arguments: { name } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":4") && item.stdout.includes("assets"))
    child.kill()

    const inventoryText = responseTextById(text.stdout, 3)
    expect(inventoryText).toContain("\\\"ok\\\": true")
    expect(inventoryText).not.toContain("\\\"layouts\\\"")
    expect(inventoryText).not.toContain("\\\"components\\\"")
    expect(inventoryText).toContain("\\\"pageTemplates\\\"")
    expect(inventoryText).toContain("\\\"templateId\\\": \\\"timeline\\\"")
    expect(inventoryText).toContain("\\\"slots\\\"")
    expect(inventoryText).toContain("\\\"requiredClasses\\\"")
    expect(text.stdout).toContain("Test Layout")
  })

  it("creates and reads one template deck-plan slide through MCP tools", async () => {
    const root = tempWorkspace("revela-mcp-deck-plan-upsert-")
    writeResearchVault(root)
    const home = tempWorkspace("revela-mcp-deck-plan-upsert-home-")
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
        name: "revela_upsert_deck_plan_slide",
        arguments: {
          workspaceRoot: root,
          designName: "summit",
          slideIndex: 1,
          id: "slide-pilot-proof",
          title: "Pilot Proof",
          chapter: "Decision",
          narrativeRole: "Show why the bounded pilot is the next decision.",
          structural: false,
          template: "key-message-evidence",
          templateContent: {
            title: "Pilot Proof",
            body: "Approve a bounded pilot.",
            items: [
              { label: "Intent evidence", description: "The proposal states the decision need." },
              { label: "Bounded ask", description: "The pilot is scoped as a narrow next step." },
            ],
          },
          visualIntent: { kind: "template", brief: "Use the evidence region for source-backed support." },
          sourceLinks: {
            findings: ["researches/pilot.md"],
            urls: ["https://example.com/pilot"],
            caveats: ["Intent evidence only."],
          },
          caveats: ["Intent evidence only."],
        },
      },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_read_deck_plan", arguments: { workspaceRoot: root } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "revela_upsert_deck_plan_slide",
        arguments: {
          workspaceRoot: root,
          designName: "summit",
          slideIndex: 2,
          title: "Bad",
          chapter: "Decision",
          narrativeRole: "Invalid template.",
          template: "missing-template",
          visualIntent: { kind: "template" },
          sourceLinks: {},
        },
      },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":4") && item.stdout.includes("slide_template_unknown"))
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain("deck-plan.md")
    expect(text.stdout).toContain("\\\"template\\\": \\\"key-message-evidence\\\"")
    expect(text.stdout).toContain("\\\"templateContent\\\"")
    expect(text.stdout).toContain("\\\"sourceLinks\\\"")
    expect(text.stdout).toContain("\\\"htmlWritingBatches\\\"")
    expect(text.stdout).toContain("\\\"maxSlides\\\": 5")
    expect(text.stdout).not.toContain("\\\"slot\\\": \\\"left\\\"")
    expect(text.stdout).toContain("\\\"ok\\\": false")
    expect(text.stdout).toContain("slide_template_unknown")
    expect(readFileSync(join(root, "deck-plan.md"), "utf-8")).toContain("#### Template Content")
  })

  it("lists and renders built-in page templates through MCP tools", async () => {
    const root = tempWorkspace("revela-mcp-page-template-")
    const home = tempWorkspace("revela-mcp-page-template-home-")
    createDeckFoundation({
      workspaceRoot: root,
      outputPath: "decks/templates.html",
      title: "Template MCP",
      language: "en",
      designName: "lucent",
    })
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
      params: { name: "revela_list_page_templates", arguments: {} },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "revela_add_template_slide",
        arguments: {
          workspaceRoot: root,
          outputPath: "decks/templates.html",
          designName: "lucent",
          templateId: "milestone",
          slideIndex: 1,
          content: {
            title: "Journey",
            milestones: [
              { date: "Mar 2019", label: "Launch", description: "Baseline mapping." },
              { date: "Nov 2019", label: "Audit", description: "Evidence sprint." },
              { date: "May 2020", label: "Scale", description: "Operating cadence." },
            ],
          },
        },
      },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "revela_page_template_foundation", arguments: { templateId: "timeline" } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "revela_page_template_vocabulary", arguments: { templateId: "timeline" } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "revela_add_template_scaffold",
        arguments: {
          workspaceRoot: root,
          outputPath: "decks/templates.html",
          designName: "lucent",
          templateId: "claim-supporting-visual",
          slideIndex: 2,
          seed: { title: "Claim scaffold" },
        },
      },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":6") && item.stdout.includes("template-visual-slot-panel"))
    child.kill()

    expect(text.stdout).toContain("milestone")
    expect(text.stdout).toContain("timeline")
    expect(text.stdout).toContain("claim-supporting-visual")
    expect(text.stdout).toContain("\\\"inserted\\\": true")
    const html = readFileSync(join(root, "decks/templates.html"), "utf-8")
    expect(html).toContain('data-template="milestone"')
    expect(html).toContain('data-template="claim-supporting-visual"')
  })

  it("reads bundled design inventory, layouts, components, and validation without seeding user config", async () => {
    const home = tempWorkspace("revela-mcp-bundled-design-home-")
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
      params: { name: "revela_design_inventory", arguments: { name: "summit" } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_design_validate", arguments: { name: "summit" } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":3") && item.stdout.includes("hasDesignMd"))
    child.kill()

    const inventoryText = responseTextById(text.stdout, 2)
    expect(inventoryText).toContain("\\\"ok\\\": true")
    expect(inventoryText).toContain("\\\"name\\\": \\\"summit\\\"")
    expect(inventoryText).not.toContain("\\\"layouts\\\"")
    expect(inventoryText).not.toContain("\\\"components\\\"")
    expect(inventoryText).toContain("\\\"pageTemplates\\\"")
    expect(inventoryText).toContain("\\\"templateId\\\": \\\"timeline\\\"")
    expect(inventoryText).toContain("\\\"slots\\\"")
    expect(text.stdout).toContain("\\\"hasDesignMd\\\": true")
    expect(existsSync(join(home, ".config", "revela", "designs"))).toBe(false)
  })

  it("prefers user designs over bundled designs with the same name", async () => {
    const home = tempWorkspace("revela-mcp-design-override-home-")
    const designDir = join(home, ".config", "revela", "designs", "summit")
    mkdirSync(designDir, { recursive: true })
    writeFileSync(join(designDir, "DESIGN.md"), validDesignMd("summit"), "utf-8")
    writeFileSync(join(designDir, "preview.html"), validPreviewHtml(), "utf-8")

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
      params: { name: "revela_design_inventory", arguments: { name: "summit" } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_design_read", arguments: { name: "summit" } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":3") && item.stdout.includes("Test Layout"))
    child.kill()

    const inventoryText = responseTextById(text.stdout, 2)
    expect(inventoryText).toContain("\\\"pageTemplates\\\"")
    expect(inventoryText).not.toContain("\\\"layouts\\\"")
    expect(inventoryText).not.toContain("\\\"components\\\"")
    expect(text.stdout).toContain("Test Layout")
  })

  it("reports missing designs as not installed without creating user config", async () => {
    const home = tempWorkspace("revela-mcp-missing-design-home-")
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
      params: { name: "revela_design_inventory", arguments: { name: "missing-design" } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("not installed"))
    child.kill()

    expect(text.stdout).toContain("Design 'missing-design' is not installed")
    expect(existsSync(join(home, ".config", "revela", "designs"))).toBe(false)
  })

  it("creates, validates, and installs design drafts through MCP tools", async () => {
    const home = tempWorkspace("revela-mcp-design-draft-home-")
    const root = tempWorkspace("revela-mcp-design-draft-workspace-")
    const name = `mcp-draft-design-${Date.now()}`
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
        name: "revela_design_draft_create",
        arguments: {
          workspaceRoot: root,
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
      params: { name: "revela_design_draft_validate", arguments: { workspaceRoot: root, name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "revela_design_draft_install", arguments: { workspaceRoot: root, name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "revela_design_read", arguments: { name } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":5") && item.stdout.includes("test-layout"))
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain(".revela/drafts/designs")
    expect(text.stdout).toContain("\\\"sourcePath\\\"")
    expect(text.stdout).toContain("test-layout")
  })

  it("packages and installs design archives with assets through MCP tools", async () => {
    const home = tempWorkspace("revela-mcp-design-archive-home-")
    const root = tempWorkspace("revela-mcp-design-archive-workspace-")
    const name = `mcp-archive-design-${Date.now()}`
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
        name: "revela_design_draft_create",
        arguments: {
          workspaceRoot: root,
          name,
          base: "starter",
          designMd: validDesignMd(name).replace("- Keep hierarchy clear.", "- Keep hierarchy clear.\n- Cover backgrounds may use `assets/cover-background.png`."),
          previewHtml: validPreviewHtml().replace("Cover", "Cover <img src=\"assets/cover-background.png\" alt=\"\">"),
          assets: [{
            path: "assets/cover-background.png",
            contentBase64: Buffer.from("mcp fake png bytes", "utf-8").toString("base64"),
          }],
        },
      },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_design_pack", arguments: { workspaceRoot: root, name, source: "draft", overwrite: true } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "revela_design_install_archive",
        arguments: { archivePath: join(root, ".revela", "design-archives", `${name}.tar.gz`) },
      },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "revela_design_validate", arguments: { name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "revela_design_inventory", arguments: { name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "revela_design_read", arguments: { name } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":7") && item.stdout.includes("assets/cover-background.png"))
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain(`${name}.tar.gz`)
    expect(text.stdout).toContain("\\\"archivePath\\\"")
    expect(text.stdout).toContain("\\\"assets\\\"")
    expect(text.stdout).toContain("\\\"kind\\\": \\\"cover-background\\\"")
    expect(text.stdout).toContain("\\\"mimeType\\\": \\\"image/png\\\"")
    expect(text.stdout).toContain("\\\"bytes\\\": 18")
    expect(text.stdout).toContain("test-layout")
    expect(existsSync(join(root, ".revela", "drafts", "designs", name, "assets", "cover-background.png"))).toBe(true)
    expect(existsSync(join(root, ".revela", "design-archives", `${name}.tar.gz`))).toBe(true)
  })

  it("creates and validates domain packages through MCP tools", async () => {
    const home = tempWorkspace("revela-mcp-domain-create-home-")
    const name = `mcp-domain-${Date.now()}`
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
        name: "revela_domain_create",
        arguments: {
          name,
          domainMd: validDomainMd(name),
        },
      },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_domain_validate", arguments: { name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "revela_domain_read", arguments: { name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "revela_domain_list", arguments: {} },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":5") && item.stdout.includes(name))
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain("\\\"files\\\":")
    expect(text.stdout).toContain("INDUSTRY.md")
    expect(text.stdout).toContain("\\\"hasIndustryMd\\\": true")
    expect(text.stdout).toContain("MCP domain guidance")
    expect(text.stdout).toContain("\\\"activeDomain\\\": \\\"general\\\"")
  })

  it("creates, validates, and installs domain drafts through MCP tools", async () => {
    const home = tempWorkspace("revela-mcp-domain-draft-home-")
    const root = tempWorkspace("revela-mcp-domain-draft-workspace-")
    const name = `mcp-draft-domain-${Date.now()}`
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
        name: "revela_domain_draft_create",
        arguments: {
          workspaceRoot: root,
          name,
          domainMd: validDomainMd(name),
        },
      },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "revela_domain_draft_validate", arguments: { workspaceRoot: root, name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "revela_domain_draft_install", arguments: { workspaceRoot: root, name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "revela_domain_read", arguments: { name } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "revela_domain_list", arguments: {} },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":6") && item.stdout.includes(name))
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain(".revela/drafts/domains")
    expect(text.stdout).toContain("\\\"sourcePath\\\"")
    expect(text.stdout).toContain("MCP domain guidance")
    expect(text.stdout).toContain("\\\"activeDomain\\\": \\\"general\\\"")
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
    expect(text.stdout).toContain("Deck-plan:")
    expect(text.stdout).not.toContain("inspectionContext")
    expect(text.stdout).not.toContain("No revela-narrative/")
  }, 60000)

  it("calls material intake tools for a docx source", async () => {
    const root = tempWorkspace("revela-mcp-material-")
    writeDocx(root, "proposal.docx", "Quarterly summary")
    const child = spawn("bun", [serverPath], { stdio: ["pipe", "pipe", "pipe"] })
    const output = collectOutput(child)

    child.stdin.write(frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }))
    child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "revela_prepare_local_materials", arguments: { workspaceRoot: root } },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "revela_record_material_review",
        arguments: {
          workspaceRoot: root,
          sourcePath: "proposal.docx",
          reviewedPaths: [".revela/doc-materials/example/read.md"],
          reviewSummary: "Reviewed the extracted proposal.",
          narrativeDecisions: [{ kind: "ignored", rationale: "No canonical narrative claim was created." }],
        },
      },
    }))
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "revela_check_material_intake", arguments: { workspaceRoot: root } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":4") && item.stdout.includes("proposal.docx"), 10000)
    child.kill()

    expect(text.stdout).toContain("\\\"status\\\": \\\"processed\\\"")
    expect(text.stdout).toContain("\\\"read_view_path\\\"")
    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain("researches/local-materials/proposal-review.md")
  }, 10000)

  it("opens a deck directly from the MCP process", async () => {
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
      params: { name: "revela_open_deck", arguments: { workspaceRoot: root, file: "decks/review.html", openBrowser: false } },
    }))

    const text = await output.until((item) => item.stdout.includes("\"id\":2") && item.stdout.includes("\\\"mode\\\": \\\"direct\\\""), 60000)
    child.kill()

    expect(text.stdout).toContain("\\\"ok\\\": true")
    expect(text.stdout).toContain("\\\"mode\\\": \\\"direct\\\"")
    expect(text.stdout).toContain("\\\"readOnly\\\": true")
    expect(text.stdout).toContain("/decks/review.html")
    expect(text.stdout).not.toContain("/codex-review")
    expect(text.stdout).not.toContain("token=")
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

function responseTextById(stdout: string, id: number): string {
  const messages = parseJsonRpcMessages(stdout)
  const message = messages.find((item) => item.id === id)
  if (!message) throw new Error(`No JSON-RPC response with id ${id}`)
  return JSON.stringify(message)
}

function parseJsonRpcMessages(stdout: string): any[] {
  const messages: any[] = []
  let cursor = 0
  while (cursor < stdout.length) {
    const headerIndex = stdout.indexOf("Content-Length:", cursor)
    if (headerIndex === -1) break
    const lengthMatch = /Content-Length:\s*(\d+)/.exec(stdout.slice(headerIndex, headerIndex + 80))
    if (!lengthMatch) break
    const bodyStart = stdout.indexOf("\r\n\r\n", headerIndex)
    if (bodyStart === -1) break
    const length = Number(lengthMatch[1])
    const start = bodyStart + 4
    const body = stdout.slice(start, start + length)
    try {
      messages.push(JSON.parse(body))
    } catch {
      // Ignore partial frames while the test is still collecting output.
    }
    cursor = start + length
  }
  return messages
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
                <div class="template-eyebrow">Review</div>
                <h2>MCP review smoke</h2>
                <p>This slide validates the review read aggregate tool.</p>
            </div>
        </div>
    </section>`
  writeFileSync(htmlPath, html.replace(`${markers.start}\n    ${markers.end}`, `${markers.start}${slide}\n    ${markers.end}`), "utf-8")
}

function writeDocx(root: string, relativePath: string, text: string): void {
  writeFileSync(join(root, relativePath), zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
      </w:document>`,
    ),
    "word/media/image1.png": new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  }))
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
<html><head><style>
.slide { min-height: 100dvh; display: flex; }
.slide-canvas { width: 1920px; height: 1080px; }
</style></head><body>
<section class="slide" slide-qa="false" data-slide-role="cover"><div class="slide-canvas">Cover</div></section>
<section class="slide" slide-qa="true"><div class="slide-canvas"><div data-preview-component="test-card" class="test-card">Card</div><span data-preview-component="test-badge" class="test-badge">Badge</span></div></section>
<section class="slide" slide-qa="false" data-slide-role="closing"><div class="slide-canvas">Closing</div></section>
</body></html>`
}

function validDomainMd(name: string): string {
  return `---
name: ${name}
description: MCP test domain
author: test
version: 1.0.0
---

# MCP Domain

MCP domain guidance for audience, decision, claims, objections, risks, and research gaps.
`
}
