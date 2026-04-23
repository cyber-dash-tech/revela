import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { zipSync, strToU8 } from "fflate"
import { preRead } from "../lib/read-hooks/pre-read"

let workspaceDir = ""
let previousCwd = ""

function pngStub(): Uint8Array {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
}

function writeZip(relativePath: string, files: Record<string, Uint8Array>): string {
  const filePath = join(workspaceDir, relativePath)
  writeFileSync(filePath, zipSync(files))
  return filePath
}

beforeEach(() => {
  previousCwd = process.cwd()
  workspaceDir = mkdtempSync(join(tmpdir(), "revela-pre-read-"))
  process.chdir(workspaceDir)
})

afterEach(() => {
  process.chdir(previousCwd)
  rmSync(workspaceDir, { recursive: true, force: true })
})

describe("preRead", () => {
  it("materializes office documents into a markdown read view", async () => {
    const filePath = writeZip("deck.pptx", {
      "ppt/slides/slide1.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Growth doubled</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree></p:cSld>
        </p:sld>`
      ),
      "ppt/slides/_rels/slide1.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`
      ),
      "ppt/media/image1.png": pngStub(),
    })

    const args = { filePath }
    await preRead(args)

    expect(args.filePath.endsWith(".md")).toBe(true)
    expect(existsSync(args.filePath)).toBe(true)

    const view = readFileSync(args.filePath, "utf-8")
    expect(view).toContain("# Extracted from: deck.pptx")
    expect(view).toContain("## Text")
    expect(view).toContain("Growth doubled")
    expect(view).toContain("## Images")
    expect(view).toContain(".opencode/revela/doc-materials/")
    expect(view).toContain("images/slide-01-image-01.png")
    expect(view).toContain("## Slide Structure")
    expect(view).toContain("slide-01: 1 text, 1 kept image")
  })

  it("only lists kept pptx images in the markdown read view", async () => {
    const filePath = writeZip("filtered-deck.pptx", {
      "ppt/slides/slide1.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Visual slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
        </p:sld>`
      ),
      "ppt/slides/_rels/slide1.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/hero-photo.png"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo-icon.png"/>
          <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/transparent-overlay.svg"/>
        </Relationships>`
      ),
      "ppt/media/hero-photo.png": pngStub(),
      "ppt/media/logo-icon.png": pngStub(),
      "ppt/media/transparent-overlay.svg": strToU8(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`),
    })

    const args = { filePath }
    await preRead(args)

    const view = readFileSync(args.filePath, "utf-8")
    expect(view).toContain("images/slide-01-image-01.png")
    expect(view).not.toContain("logo-icon")
    expect(view).not.toContain("transparent-overlay")
  })

  it("surfaces pptx heuristic roles in the markdown read view", async () => {
    const filePath = writeZip("heuristics-deck.pptx", {
      "ppt/presentation.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:sldSz cx="1920" cy="1080"/>
        </p:presentation>`
      ),
      "ppt/slides/slide1.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:cSld><p:spTree>
            <p:pic>
              <p:nvPicPr><p:cNvPr id="1" name="Background image"/></p:nvPicPr>
              <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1920" cy="1080"/></a:xfrm></p:spPr>
              <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
            </p:pic>
            <p:pic>
              <p:nvPicPr><p:cNvPr id="2" name="Company logo"/></p:nvPicPr>
              <p:spPr><a:xfrm><a:off x="1710" y="40"/><a:ext cx="120" cy="80"/></a:xfrm></p:spPr>
              <p:blipFill><a:blip r:embed="rId2"/></p:blipFill>
            </p:pic>
            <p:pic>
              <p:nvPicPr><p:cNvPr id="3" name="Overlay asset"/></p:nvPicPr>
              <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1920" cy="1080"/></a:xfrm></p:spPr>
              <p:blipFill><a:blip r:embed="rId3"/></p:blipFill>
            </p:pic>
            <p:sp>
              <p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="400" cy="120"/></a:xfrm></p:spPr>
              <p:txBody><a:p><a:r><a:t>Visual summary</a:t></a:r></a:p></p:txBody>
            </p:sp>
          </p:spTree></p:cSld>
        </p:sld>`
      ),
      "ppt/slides/_rels/slide1.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/background.png"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/company-logo.png"/>
          <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/transparent-overlay.svg"/>
        </Relationships>`
      ),
      "ppt/media/background.png": pngStub(),
      "ppt/media/company-logo.png": pngStub(),
      "ppt/media/transparent-overlay.svg": strToU8(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`),
    })

    const args = { filePath }
    await preRead(args)

    const view = readFileSync(args.filePath, "utf-8")
    expect(view).toContain("slide-01: 1 text, 1 kept image, 2 skipped image")
    expect(view).toContain("likely roles: 1 background image, 1 logo, 2 overlays")
  })

  it("lists no images when the office document has none", async () => {
    const filePath = writeZip("brief.docx", {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        </Relationships>`
      ),
      "word/document.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body><w:p><w:r><w:t>Quarterly summary</w:t></w:r></w:p></w:body>
        </w:document>`
      ),
    })

    const args = { filePath }
    await preRead(args)

    const view = readFileSync(args.filePath, "utf-8")
    expect(view).toContain("Quarterly summary")
    expect(view).toContain("## Images")
    expect(view).toContain("- None")
  })

  it("passes through non-office files", async () => {
    const filePath = join(workspaceDir, "notes.md")
    writeFileSync(filePath, "plain text", "utf-8")

    const args = { filePath }
    await preRead(args)

    expect(args.filePath).toBe(filePath)
  })
})
