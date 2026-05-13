import { describe, expect, it } from "bun:test"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { basename, join } from "path"
import {
  applySpeakerNotesToPptx,
  enforceMinimumPptxFontSize,
  extractImageAssetRefsForPptx,
  inlineImageAssets,
  resolveDomToPptxBundlePath,
} from "../lib/pptx/export"
import { buildPptxNotesPrompt, parsePptxArgs, resolvePptxDeck } from "../lib/commands/pptx"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("resolveDomToPptxBundlePath", () => {
  it("resolves the browser bundle through package resolution", () => {
    const bundlePath = resolveDomToPptxBundlePath()

    expect(basename(bundlePath)).toBe("dom-to-pptx.bundle.js")
    expect(existsSync(bundlePath)).toBe(true)
  })
})

describe("extractImageAssetRefsForPptx", () => {
  it("captures quoted local image refs with spaces", () => {
    const refs = extractImageAssetRefsForPptx(`
      <img src="../cover page pic.png">
      <div style="background-image: url('../hero image.png')"></div>
      <img src=../plain.png>
    `)

    expect(refs).toContain("../cover page pic.png")
    expect(refs).toContain("../hero image.png")
    expect(refs).toContain("../plain.png")
  })
})

describe("inlineImageAssets", () => {
  it("inlines local image refs with spaces before PPTX export", async () => {
    const tempRoot = tempWorkspace("revela-pptx-test-")

    try {
      const slidesDir = join(tempRoot, "slides")
      const imagePath = join(tempRoot, "cover page pic.png")
      const htmlPath = join(slidesDir, "deck.html")
      const png1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

      mkdirSync(slidesDir)
      writeFileSync(imagePath, png1x1, "base64")

      const html = `
        <img src="../cover page pic.png">
        <div style="background-image: url('../cover page pic.png')"></div>
      `

      const inlined = await inlineImageAssets(html, htmlPath)

      expect(inlined).toContain("data:image/png;base64,")
      expect(inlined).not.toContain("../cover page pic.png")
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})

describe("enforceMinimumPptxFontSize", () => {
  it("raises slide text sizes below 6pt without changing larger sizes", () => {
    const pptxBytes = zipSync({
      "ppt/slides/slide1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld>
            <a:rPr sz="450"/>
            <a:defRPr sz="599"/>
            <a:endParaRPr sz="600"/>
            <a:rPr sz="900"/>
            <a:rPr sz="not-a-number"/>
          </p:cSld>
        </p:sld>`),
      "ppt/theme/theme1.xml": strToU8(`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:rPr sz="450"/></a:theme>`),
    })

    const patched = unzipSync(enforceMinimumPptxFontSize(pptxBytes))
    const slideXml = strFromU8(patched["ppt/slides/slide1.xml"])
    const themeXml = strFromU8(patched["ppt/theme/theme1.xml"])

    expect(slideXml).toContain('sz="600"')
    expect(slideXml).not.toContain('sz="450"')
    expect(slideXml).not.toContain('sz="599"')
    expect(slideXml).toContain('sz="900"')
    expect(slideXml).toContain('sz="not-a-number"')
    expect(themeXml).toContain('sz="450"')
  })
})

describe("applySpeakerNotesToPptx", () => {
  it("writes escaped multiline speaker notes into notes slides", () => {
    const pptxBytes = zipSync({
      "ppt/notesSlides/notesSlide1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld>
            <p:spTree>
              <p:sp>
                <p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
                <p:txBody><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody>
              </p:sp>
              <p:sp>
                <p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr>
                <p:txBody><a:p><a:fld type="slidenum"><a:t>1</a:t></a:fld></a:p></p:txBody>
              </p:sp>
            </p:spTree>
          </p:cSld>
        </p:notes>`),
      "ppt/notesSlides/notesSlide2.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld><p:spTree><p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
            <p:txBody><a:p><a:r><a:t>old</a:t></a:r></a:p></p:txBody>
          </p:sp></p:spTree></p:cSld>
        </p:notes>`),
    })

    const patched = unzipSync(applySpeakerNotesToPptx(pptxBytes, ["Lead & learn <fast>\nSecond line", null]))
    const slide1Notes = strFromU8(patched["ppt/notesSlides/notesSlide1.xml"])
    const slide2Notes = strFromU8(patched["ppt/notesSlides/notesSlide2.xml"])

    expect(slide1Notes).toContain("Lead &amp; learn &lt;fast&gt;\nSecond line")
    expect(slide1Notes).not.toContain("Lead & learn <fast>")
    expect(slide1Notes).toContain("<a:t>1</a:t>")
    expect(slide2Notes).not.toContain("old")
  })
})

describe("parsePptxArgs", () => {
  it("keeps the file optional and detects --notes", () => {
    expect(parsePptxArgs("")).toEqual({ filePath: "", notes: false })
    expect(parsePptxArgs("--notes")).toEqual({ filePath: "", notes: true })
    expect(parsePptxArgs("decks/demo.html --notes")).toEqual({ filePath: "decks/demo.html", notes: true })
    expect(parsePptxArgs("--notes decks/demo.html")).toEqual({ filePath: "decks/demo.html", notes: true })
  })
})

describe("resolvePptxDeck", () => {
  it("uses DECKS.json active deck outputPath first", () => {
    const tempRoot = tempWorkspace("revela-pptx-command-test-")

    try {
      mkdirSync(join(tempRoot, "decks"))
      writeFileSync(join(tempRoot, "decks", "state.html"), "<html></html>")
      writeFileSync(join(tempRoot, "decks", "other.html"), "<html></html>")
      writeFileSync(join(tempRoot, "DECKS.json"), JSON.stringify({
        version: 1,
        activeDeck: "state",
        workspace: { sourceMaterials: [], preferences: { user: [], workflow: [] }, deckMemory: [], openQuestions: [] },
        decks: {
          state: {
            slug: "state",
            status: "ready",
            goal: "Demo",
            outputPath: "decks/state.html",
            theme: {},
            requiredInputs: {},
            researchPlan: [],
            slides: [],
            assets: [],
            writeReadiness: { status: "ready", blockers: [] },
          },
        },
      }))

      expect(resolvePptxDeck(tempRoot)).toMatchObject({ file: "decks/state.html", source: "render-target" })
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it("falls back to the only HTML file in decks/", () => {
    const tempRoot = tempWorkspace("revela-pptx-command-test-")

    try {
      mkdirSync(join(tempRoot, "decks"))
      writeFileSync(join(tempRoot, "decks", "only.html"), "<html></html>")

      expect(resolvePptxDeck(tempRoot).file).toBe("decks/only.html")
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it("requires an explicit file when multiple fallback decks exist", () => {
    const tempRoot = tempWorkspace("revela-pptx-command-test-")

    try {
      mkdirSync(join(tempRoot, "decks"))
      writeFileSync(join(tempRoot, "decks", "a.html"), "<html></html>")
      writeFileSync(join(tempRoot, "decks", "b.html"), "<html></html>")

      expect(() => resolvePptxDeck(tempRoot)).toThrow("multiple deck HTML files")
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})

describe("buildPptxNotesPrompt", () => {
  it("instructs the agent to pass structured speaker notes to revela-pptx", () => {
    const prompt = buildPptxNotesPrompt({
      file: "decks/demo.html",
      absoluteFile: "/workspace/decks/demo.html",
      source: "fallback",
    })

    expect(prompt).toContain("revela-pptx")
    expect(prompt).toContain("speakerNotes")
    expect(prompt).toContain("1-based slide indexes")
    expect(prompt).toContain("decks/demo.html")
    expect(prompt).toContain("presenter-facing talk tracks")
    expect(prompt).toContain("pyramid-style communication")
    expect(prompt).toContain("first bullet is the top-line conclusion")
    expect(prompt).toContain("Do not label bullets as What, Why, or How")
    expect(prompt).toContain("Do not mention design-system or implementation terms")
    expect(prompt).toContain("stat-card")
    expect(prompt).toContain("Avoid meta commentary")
  })
})
