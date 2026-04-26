import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { basename, join } from "path"
import {
  extractImageAssetRefsForPptx,
  inlineImageAssets,
  resolveDomToPptxBundlePath,
} from "../lib/pptx/export"

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
    const tempRoot = mkdtempSync(join(tmpdir(), "revela-pptx-test-"))

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
