import { describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import {
  exportDeckToPdf,
  extractImageAssetRefsForPdf,
  inlineImageAssetsForPdf,
} from "../lib/pdf/export"
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib"
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
