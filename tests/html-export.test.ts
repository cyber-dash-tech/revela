import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { PDFDocument } from "pdf-lib"
import { Jimp } from "jimp"
import { launchChrome } from "../lib/browser/chrome"
import { detectDeckHtml, detectDeckHtmlWithBrowser } from "../lib/html-export/deck-detect"
import { chooseSelector } from "../lib/html-export/selectors"
import { findTrimmedHeight, parseHexColor } from "../lib/html-export/trim"
import { writeSinglePagePdfFromPng } from "../lib/html-export/pdf"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("chooseSelector", () => {
  it("uses explicit selectors and otherwise tries poster-first defaults", () => {
    expect(chooseSelector(".custom")).toEqual({ selector: ".custom", attempted: [".custom"] })
    expect(chooseSelector()).toEqual({ selector: ".poster", attempted: [".poster", ".artifact", "main", "body"] })
  })
})

describe("trim helpers", () => {
  it("parses valid hex colors and falls back on invalid values", () => {
    expect(parseHexColor("#0a1020")).toEqual({ r: 10, g: 16, b: 32 })
    expect(parseHexColor("invalid")).toEqual({ r: 2, g: 6, b: 21 })
  })

  it("trims only background-like bottom rows", () => {
    const image = new Jimp({ width: 10, height: 20, color: 0x020615ff })
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 10; x++) {
        image.setPixelColor(0xffffffff, x, y)
      }
    }

    expect(findTrimmedHeight(image, { enabled: true, color: "#020615", threshold: 0, padding: 0 })).toBe(12)
    expect(findTrimmedHeight(image, { enabled: false })).toBe(20)
  })
})

describe("writeSinglePagePdfFromPng", () => {
  it("creates a one-page PDF with the requested dimensions", async () => {
    const root = tempWorkspace("revela-html-pdf-test-")
    try {
      const png = join(root, "image.png")
      const pdf = join(root, "image.pdf")
      const pngBuffer = await (new Jimp({ width: 12, height: 18, color: 0xff0000ff }).getBuffer as any)("image/png")
      writeFileSync(png, new Uint8Array(pngBuffer))

      await writeSinglePagePdfFromPng(png, pdf, 12, 18)

      expect(existsSync(pdf)).toBe(true)
      const doc = await PDFDocument.load(await Bun.file(pdf).arrayBuffer())
      expect(doc.getPageCount()).toBe(1)
      expect(doc.getPage(0).getSize()).toEqual({ width: 12, height: 18 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("detectDeckHtml", () => {
  it("accepts valid deck structure and rejects poster HTML", async () => {
    const root = tempWorkspace("revela-deck-detect-test-")
    try {
      const deck = join(root, "deck.html")
      const poster = join(root, "poster.html")
      writeFileSync(deck, `
        <!doctype html><html><body>
          <section class="slide" data-slide-index="1"><div class="slide-canvas"></div></section>
          <section class="slide" data-slide-index="2"><div class="slide-canvas"></div></section>
        </body></html>
      `)
      writeFileSync(poster, `<!doctype html><html><body><main class="poster">Poster</main></body></html>`)

      const browser = await launchChrome({ allowFileAccess: true })
      try {
        expect(await detectDeckHtmlWithBrowser(browser, deck)).toMatchObject({
          isDeck: true,
          slideCount: 2,
          reason: "valid deck contract: slide-canvas",
        })
        expect(await detectDeckHtmlWithBrowser(browser, poster)).toMatchObject({ isDeck: false, slideCount: 0 })
      } finally {
        await browser.close().catch(() => undefined)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)

  it("accepts slide elements that render as the 1920x1080 canvas", async () => {
    const root = tempWorkspace("revela-deck-detect-test-")
    try {
      const deck = join(root, "deck.html")
      writeFileSync(deck, `
        <!doctype html><html><head>
          <style>
            body { margin: 0; }
            .slide { width: 1920px; height: 1080px; }
          </style>
        </head><body>
          <section class="slide" data-slide-index="1"></section>
        </body></html>
      `)

      const result = await detectDeckHtml(deck)
      expect(result).toMatchObject({
        isDeck: true,
        slideCount: 1,
        reason: "valid deck contract: slide-as-canvas",
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)

  it("rejects slide elements without a canvas marker or 1920x1080 dimensions", async () => {
    const root = tempWorkspace("revela-deck-detect-test-")
    try {
      const deck = join(root, "deck.html")
      writeFileSync(deck, `
        <!doctype html><html><head>
          <style>
            body { margin: 0; }
            .slide { width: 1200px; height: 800px; }
          </style>
        </head><body>
          <section class="slide" data-slide-index="1"></section>
        </body></html>
      `)

      const result = await detectDeckHtml(deck)
      expect(result).toMatchObject({
        isDeck: false,
        slideCount: 1,
        reason: ".slide 1 has no .slide-canvas and is not 1920x1080",
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)

  it("rejects duplicate slide indexes", async () => {
    const root = tempWorkspace("revela-deck-detect-test-")
    try {
      mkdirSync(root, { recursive: true })
      const deck = join(root, "deck.html")
      writeFileSync(deck, `
        <!doctype html><html><body>
          <section class="slide" data-slide-index="1"><div class="slide-canvas"></div></section>
          <section class="slide" data-slide-index="1"><div class="slide-canvas"></div></section>
        </body></html>
      `)

      const result = await detectDeckHtml(deck)
      expect(result.isDeck).toBe(false)
      expect(result.reason).toContain("duplicate")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)

  it("rejects missing and non-sequential slide indexes", async () => {
    const root = tempWorkspace("revela-deck-detect-test-")
    try {
      const missingIndexDeck = join(root, "missing-index.html")
      const nonSequentialDeck = join(root, "non-sequential.html")
      writeFileSync(missingIndexDeck, `
        <!doctype html><html><body>
          <section class="slide"><div class="slide-canvas"></div></section>
        </body></html>
      `)
      writeFileSync(nonSequentialDeck, `
        <!doctype html><html><body>
          <section class="slide" data-slide-index="1"><div class="slide-canvas"></div></section>
          <section class="slide" data-slide-index="3"><div class="slide-canvas"></div></section>
        </body></html>
      `)

      const browser = await launchChrome({ allowFileAccess: true })
      try {
        expect(await detectDeckHtmlWithBrowser(browser, missingIndexDeck)).toMatchObject({
          isDeck: false,
          reason: "slide 1 is missing data-slide-index",
        })
        expect(await detectDeckHtmlWithBrowser(browser, nonSequentialDeck)).toMatchObject({
          isDeck: false,
          reason: 'slide 2 has data-slide-index "3", expected "2"',
        })
      } finally {
        await browser.close().catch(() => undefined)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 10000)
})
