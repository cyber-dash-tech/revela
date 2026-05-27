import { describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { designRead } from "../lib/runtime"
import { extractDeckHtmlPatchTargets, runPreWriteChecks } from "../plugins/revela/hooks/revela_guard"
import { extractDeckHtmlTargets, runPostWriteChecks, workspaceRootFromInput } from "../plugins/revela/hooks/revela_post_write_notice"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("Codex plugin hooks", () => {
  it("extracts deck HTML targets from apply_patch payloads", () => {
    const targets = extractDeckHtmlTargets(`*** Begin Patch
*** Update File: decks/demo.html
@@
*** Update File: notes/readme.md
*** End Patch`)

    expect(targets).toEqual(["decks/demo.html"])
  })

  it("extracts deck HTML targets only from patch file headers for pre-write checks", () => {
    expect(extractDeckHtmlPatchTargets(`*** Begin Patch
*** Update File: docs/guide.md
@@
+Mention decks/demo.html in prose.
*** End Patch`)).toEqual([])

    expect(extractDeckHtmlPatchTargets(hookPayload("/tmp/revela-demo", "decks/demo.html"))).toEqual(["decks/demo.html"])
  })

  it("reads workspace root from JSON hook payloads", () => {
    expect(workspaceRootFromInput(JSON.stringify({ cwd: "/tmp/revela-demo" }))).toBe("/tmp/revela-demo")
  })

  it("runs Artifact QA successfully for a valid touched deck", async () => {
    const root = workspace()
    try {
      writeDeck(root, validDeckHtml())

      const result = await runPostWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(true)
      expect(result.messages.join("\n")).toContain("Artifact QA: PASSED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)

  it("fails when a touched deck has no direct slide-canvas", async () => {
    const root = workspace()
    try {
      writeDeck(root, `
        <html><head><style>
          body { margin: 0; }
          .slide { width: 1920px; height: 1080px; }
        </style></head><body>
          <section class="slide" data-slide-index="1"><h1>Missing canvas</h1></section>
        </body></html>
      `)

      const result = await runPostWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(false)
      expect(result.messages.join("\n")).toContain("missing_slide_canvas")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)

  it("keeps narrative markdown notices", async () => {
    const result = await runPostWriteChecks("*** Update File: revela-narrative/claims/demo.md")

    expect(result.ok).toBe(true)
    expect(result.messages.join("\n")).toContain("Revela narrative Markdown changed")
  })

  it("blocks deck patches until active design rules are read", async () => {
    const root = workspace()
    try {
      const result = await runPreWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(false)
      expect(result.messages.join("\n")).toContain("active design rules must be loaded")
      expect(result.messages.join("\n")).toContain('section: "rules"')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("allows deck patches after active design rules are read", async () => {
    const root = workspace()
    try {
      designRead({ workspaceRoot: root, section: "rules" })

      const result = await runPreWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(true)
      expect(result.messages).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("blocks deck patches when the design rules marker is stale or mismatched", async () => {
    const root = workspace()
    try {
      mkdirSync(join(root, ".opencode", "revela", "codex-hooks"), { recursive: true })
      writeFileSync(join(root, ".opencode", "revela", "codex-hooks", "design-rules-read.json"), JSON.stringify({
        designName: "not-the-active-design",
        rulesHash: "stale",
        readAt: new Date().toISOString(),
      }), "utf-8")

      const result = await runPreWriteChecks(hookPayload(root, "decks/demo.html"))

      expect(result.ok).toBe(false)
      expect(result.messages.join("\n")).toContain("active design")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not require design rules for non-deck patches", async () => {
    const result = await runPreWriteChecks("*** Update File: notes/readme.md")

    expect(result.ok).toBe(true)
    expect(result.messages).toEqual([])
  })
})

function workspace(): string {
  const root = tempWorkspace("revela-codex-hook-test-")
  mkdirSync(join(root, "decks"), { recursive: true })
  return root
}

function writeDeck(root: string, html: string): void {
  writeFileSync(join(root, "decks", "demo.html"), html, "utf-8")
}

function hookPayload(root: string, file: string): string {
  return JSON.stringify({ cwd: root, tool_input: { patch: `*** Update File: ${file}` } })
}

function validDeckHtml(): string {
  return `
    <html><head><style>
      body { margin: 0; }
      .slide { width: 1920px; height: 1080px; }
      .slide-canvas { width: 1920px; height: 1080px; }
    </style></head><body>
      <section class="slide" slide-qa="false" data-slide-index="1">
        <div class="slide-canvas"><h1>Valid canvas</h1></div>
      </section>
    </body></html>
  `
}
