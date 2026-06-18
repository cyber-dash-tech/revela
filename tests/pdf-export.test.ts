import { describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import {
  exportDeckToPdf,
  exportDeckToPng,
  extractImageAssetRefsForPdf,
  inlineImageAssetsForPdf,
} from "../lib/pdf/export"
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib"
import { Jimp } from "jimp"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("extractImageAssetRefsForPdf", () => {
  it("captures quoted local image refs with spaces", () => {
    const refs = extractImageAssetRefsForPdf(`
      <img src="../cover page pic.png">
      <div style="background-image: url('../hero image.png')"></div>
      <img src=../plain.png>
    `)

    expect(refs).toContain("../cover page pic.png")
    expect(refs).toContain("../hero image.png")
    expect(refs).toContain("../plain.png")
  })
})

describe("inlineImageAssetsForPdf", () => {
  it("inlines local image refs with spaces before PDF export", async () => {
    const tempRoot = tempWorkspace("revela-pdf-test-")

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

      const inlined = await inlineImageAssetsForPdf(html, htmlPath)

      expect(inlined).toContain("data:image/png;base64,")
      expect(inlined).not.toContain("../cover page pic.png")
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})

function writeTwoSlideDeck(path: string, mode: "slide-canvas" | "slide-as-canvas"): void {
  const slideOneInner = mode === "slide-canvas"
    ? `<div class="slide-canvas canvas-one"><h1>Canvas One</h1></div>`
    : `<h1>Slide One</h1>`
  const slideTwoInner = mode === "slide-canvas"
    ? `<div class="slide-canvas canvas-two"><h1>Canvas Two</h1></div>`
    : `<h1>Slide Two</h1>`

  writeFileSync(path, `
    <!doctype html>
    <html>
      <head>
        <style>
          html, body { margin: 0; padding: 0; overflow: visible; }
          .slide { width: 1920px; height: 1080px; position: relative; font-family: Arial, sans-serif; }
          .slide-canvas { width: 1920px; height: 1080px; position: relative; }
          .slide-as-one { background: rgb(224, 24, 64); color: white; }
          .slide-as-two { background: rgb(24, 72, 224); color: white; }
          .canvas-one { background: rgb(16, 156, 96); color: white; }
          .canvas-two { background: rgb(240, 164, 32); color: black; }
          h1 { margin: 0; padding: 120px; font-size: 144px; }
        </style>
      </head>
      <body>
        <section class="slide slide-as-one" data-slide-index="1">${slideOneInner}</section>
        <section class="slide slide-as-two" data-slide-index="2">${slideTwoInner}</section>
      </body>
    </html>
  `)
}

async function embeddedPageImageChecksums(pdfPath: string): Promise<number[]> {
  const doc = await PDFDocument.load(await Bun.file(pdfPath).arrayBuffer())

  return doc.getPages().map((page) => {
    const resources = page.node.Resources()
    const xObjects = resources?.lookup(PDFName.of("XObject"), PDFDict)
    if (!xObjects) return 0

    let checksum = 0
    for (const name of xObjects.keys()) {
      const xObject = xObjects.lookup(name)
      if (!(xObject instanceof PDFRawStream)) continue
      const bytes = xObject.contents
      for (let i = 0; i < bytes.length; i++) {
        checksum = (checksum + (bytes[i] * (i + 1))) % 2147483647
      }
    }
    return checksum
  })
}

describe("exportDeckToPdf", () => {
  it("exports each .slide > .slide-canvas as a distinct PDF page", async () => {
    const root = tempWorkspace("revela-pdf-deck-test-")

    try {
      const deck = join(root, "deck.html")
      writeTwoSlideDeck(deck, "slide-canvas")

      const result = await exportDeckToPdf(deck)
      const doc = await PDFDocument.load(await Bun.file(result.outputPath).arrayBuffer())
      const checksums = await embeddedPageImageChecksums(result.outputPath)

      expect(result.slideCount).toBe(2)
      expect(doc.getPageCount()).toBe(2)
      expect(new Set(checksums).size).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 20000)

  it("exports each slide-as-canvas .slide as a distinct PDF page", async () => {
    const root = tempWorkspace("revela-pdf-deck-test-")

    try {
      const deck = join(root, "deck.html")
      writeTwoSlideDeck(deck, "slide-as-canvas")

      const result = await exportDeckToPdf(deck)
      const doc = await PDFDocument.load(await Bun.file(result.outputPath).arrayBuffer())
      const checksums = await embeddedPageImageChecksums(result.outputPath)

      expect(result.slideCount).toBe(2)
      expect(doc.getPageCount()).toBe(2)
      expect(new Set(checksums).size).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 20000)
})

describe("exportDeckToPng", () => {
  it("exports unscaled slide canvases while preserving relative preview CSS", async () => {
    const root = tempWorkspace("revela-png-deck-test-")

    try {
      const deck = join(root, "preview.html")
      const css = join(root, "design.css")
      writeFileSync(css, `
        html, body { margin: 0; padding: 0; overflow: visible; }
        .slide { min-height: 100dvh; display: flex; align-items: center; justify-content: center; }
        .slide-canvas { width: 1920px; height: 1080px; transform-origin: center center; position: relative; overflow: hidden; }
        .marker { position: absolute; inset: 0; background: rgb(12, 34, 56); }
        .corner { position: absolute; right: 0; bottom: 0; width: 240px; height: 180px; background: rgb(230, 180, 40); }
      `)
      writeFileSync(deck, `
        <!doctype html>
        <html>
          <head>
            <link rel="stylesheet" href="./design.css">
          </head>
          <body>
            <section class="slide" data-slide-index="1">
              <div class="slide-canvas">
                <div class="marker"></div>
                <div class="corner"></div>
              </div>
            </section>
            <script>
              document.querySelectorAll('.slide-canvas').forEach((canvas) => {
                canvas.style.transform = 'scale(0.25)'
              })
            </script>
          </body>
        </html>
      `)

      const result = await exportDeckToPng(deck)
      const image = await Jimp.read(result.files[0])

      expect(result.slideCount).toBe(1)
      expect(image.bitmap.width).toBe(1920)
      expect(image.bitmap.height).toBe(1080)
      expect(image.getPixelColor(12, 12)).toBe(0x0c2238ff)
      expect(image.getPixelColor(1880, 1040)).toBe(0xe6b428ff)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 20000)

  it("reports Chrome launch override failures with repair context", async () => {
    const root = tempWorkspace("revela-png-launch-test-")
    const originalRevelaChromePath = process.env.REVELA_CHROME_PATH
    const originalPuppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH

    try {
      const deck = join(root, "deck.html")
      writeTwoSlideDeck(deck, "slide-canvas")
      process.env.REVELA_CHROME_PATH = "/definitely/missing/chrome"
      delete process.env.PUPPETEER_EXECUTABLE_PATH

      await expect(exportDeckToPng(deck)).rejects.toThrow(/REVELA_CHROME_PATH/)
      await expect(exportDeckToPng(deck)).rejects.toThrow(/valid Chrome\/Chromium binary/)
    } finally {
      if (originalRevelaChromePath === undefined) delete process.env.REVELA_CHROME_PATH
      else process.env.REVELA_CHROME_PATH = originalRevelaChromePath

      if (originalPuppeteerExecutablePath === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH
      else process.env.PUPPETEER_EXECUTABLE_PATH = originalPuppeteerExecutablePath

      rmSync(root, { recursive: true, force: true })
    }
  })
})
