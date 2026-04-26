import { describe, expect, it } from "bun:test"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { basename, join } from "path"
import {
  enforceMinimumPptxFontSize,
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

describe("enforceMinimumPptxFontSize", () => {
  it("raises slide text sizes below 8pt without changing larger sizes", () => {
    const pptxBytes = zipSync({
      "ppt/slides/slide1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld>
            <a:rPr sz="450"/>
            <a:defRPr sz="799"/>
            <a:endParaRPr sz="800"/>
            <a:rPr sz="900"/>
            <a:rPr sz="not-a-number"/>
          </p:cSld>
        </p:sld>`),
      "ppt/theme/theme1.xml": strToU8(`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:rPr sz="450"/></a:theme>`),
    })

    const patched = unzipSync(enforceMinimumPptxFontSize(pptxBytes))
    const slideXml = strFromU8(patched["ppt/slides/slide1.xml"])
    const themeXml = strFromU8(patched["ppt/theme/theme1.xml"])

    expect(slideXml).toContain('sz="800"')
    expect(slideXml).not.toContain('sz="450"')
    expect(slideXml).not.toContain('sz="799"')
    expect(slideXml).toContain('sz="900"')
    expect(slideXml).toContain('sz="not-a-number"')
    expect(themeXml).toContain('sz="450"')
  })
})
