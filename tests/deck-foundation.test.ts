import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { createDeckFoundation, deckFoundationMarkers, normalizeOutputPath } from "../lib/deck-html/foundation"
import { validateDeckHtmlContract } from "../lib/deck-html/contract"
import { seedBuiltinDesigns } from "../lib/design/designs"
import { runArtifactQA } from "../lib/qa/artifact"
import deckFoundationTool from "../tools/deck-foundation"
import { executeTool, tempWorkspace } from "./helpers/tool-helpers"

describe("deck foundation helper", () => {
  it("creates a file-native deck shell without DECKS.json", () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-foundation-")
    try {
      const result = createDeckFoundation({
        workspaceRoot: root,
        outputPath: "decks/demo.html",
        title: "Demo & Deck",
        language: "zh-CN",
        designName: "starter",
      })

      const htmlPath = join(root, "decks", "demo.html")
      const html = readFileSync(htmlPath, "utf-8")
      const markers = deckFoundationMarkers()

      expect(result).toEqual(expect.objectContaining({
        ok: true,
        outputPath: "decks/demo.html",
        design: "starter",
        status: "created",
      }))
      expect(result.includedSections).toContain("design:foundation")
      expect(result.next.join(" ")).toContain("Fetch active design rules")
      expect(existsSync(join(root, "DECKS.json"))).toBe(false)
      expect(html).toContain("<!DOCTYPE html>")
      expect(html).toContain('<html lang="zh-CN">')
      expect(html).toContain("<title>Demo &amp; Deck</title>")
      expect(html).toContain("fonts.googleapis.com")
      expect(html).toContain('<link rel="stylesheet" href="./_revela-design/starter/design.css">')
      expect(html).toContain("class SlidePresentation")
      expect(html).toContain(markers.start)
      expect(html).toContain(markers.end)
      expect(html).toContain('if (document.querySelector(".slide")) { new SlidePresentation(); }')
      expect(html).not.toContain('<section class="slide"')
      expect(existsSync(join(root, "decks", "_revela-design", "starter", "design.css"))).toBe(true)

      const contract = validateDeckHtmlContract(root, "decks/demo.html")
      expect(contract.status).toBe("skipped")
      expect(contract.ok).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("protects existing deck files unless overwrite or repair is explicit", () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-foundation-overwrite-")
    try {
      createDeckFoundation({
        workspaceRoot: root,
        outputPath: "decks/demo.html",
        title: "First",
        language: "en",
        designName: "starter",
      })

      expect(() => createDeckFoundation({
        workspaceRoot: root,
        outputPath: "decks/demo.html",
        title: "Second",
        language: "en",
        designName: "starter",
      })).toThrow("already exists")

      const repaired = createDeckFoundation({
        workspaceRoot: root,
        outputPath: "decks/demo.html",
        title: "Second",
        language: "en",
        designName: "starter",
        mode: "repair",
      })

      expect(repaired.status).toBe("updated")
      expect(readFileSync(join(root, "decks", "demo.html"), "utf-8")).toContain("<title>Second</title>")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("normalizes safe workspace-relative html paths", () => {
    expect(normalizeOutputPath("decks/demo.html")).toBe("decks/demo.html")
    expect(() => normalizeOutputPath("/tmp/demo.html")).toThrow("workspace-relative")
    expect(() => normalizeOutputPath("../demo.html")).toThrow("parent-directory")
    expect(() => normalizeOutputPath("decks/demo.txt")).toThrow(".html")
  })

  it("exposes compact JSON through the tool", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-foundation-tool-")
    try {
      const result = await executeTool<any>(deckFoundationTool as any, {
        outputPath: "decks/tool.html",
        title: "Tool Deck",
        language: "en",
        designName: "starter",
      }, root)

      expect(result.ok).toBe(true)
      expect(result.outputPath).toBe("decks/tool.html")
      expect(result.design).toBe("starter")
      expect(result.includedSections).toContain("foundation:SlidePresentation")
      expect(result.includedSections).toContain("design-css:fallback")
      expect(existsSync(join(root, "decks", "tool.html"))).toBe(true)
      expect(existsSync(join(root, "decks", "_revela-design", "starter", "design.css"))).toBe(true)
      expect(existsSync(join(root, "DECKS.json"))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("produces a shell that can host a minimal slide passing artifact QA", async () => {
    seedBuiltinDesigns()
    const root = tempWorkspace("revela-foundation-qa-")
    try {
      createDeckFoundation({
        workspaceRoot: root,
        outputPath: "decks/qa-smoke.html",
        title: "QA Smoke",
        language: "en",
        designName: "starter",
      })

      const htmlPath = join(root, "decks", "qa-smoke.html")
      const markers = deckFoundationMarkers()
      const html = readFileSync(htmlPath, "utf-8")
      const slide = `
    <section class="slide" slide-qa="false" data-slide-index="1">
        <div class="slide-canvas">
            <div class="page">
                <div class="eyebrow">Foundation QA</div>
                <h2>Ready shell</h2>
                <p>This minimal slide verifies the generated foundation can host deck content.</p>
            </div>
        </div>
    </section>`
      writeFileSync(htmlPath, html.replace(`${markers.start}\n    ${markers.end}`, `${markers.start}${slide}\n    ${markers.end}`), "utf-8")

      const report = await runArtifactQA({ workspaceRoot: root, filePath: htmlPath })

      expect(report.passed).toBe(true)
      expect(report.hardErrorCount).toBe(0)
      expect(report.sections.join("\n")).not.toContain("remote asset URL")
      expect(readFileSync(htmlPath, "utf-8")).toContain('if (document.querySelector(".slide")) { new SlidePresentation(); }')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60000)
})
