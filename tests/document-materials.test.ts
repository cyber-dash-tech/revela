import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { zipSync, strToU8 } from "fflate"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { extractDocumentMaterials } from "../lib/document-materials/extract"

let workspaceDir = ""

function pngStub(): Uint8Array {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
}

function validPngBuffer(): Uint8Array {
  return new Uint8Array(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1EAAAAASUVORK5CYII=",
    "base64",
  ))
}

function writeZip(relativePath: string, files: Record<string, Uint8Array>): string {
  const filePath = join(workspaceDir, relativePath)
  writeFileSync(filePath, zipSync(files))
  return filePath
}

async function writePdf(
  relativePath: string,
  options: { text: string; includeImage?: boolean },
): Promise<string> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([400, 300])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  page.drawText(options.text, {
    x: 40,
    y: 220,
    size: 18,
    font,
  })

  if (options.includeImage) {
    const image = await pdf.embedPng(validPngBuffer())
    page.drawImage(image, { x: 40, y: 80, width: 120, height: 120 })
  }

  const filePath = join(workspaceDir, relativePath)
  writeFileSync(filePath, await pdf.save())
  return filePath
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "revela-doc-materials-"))
})

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true })
})

describe("extractDocumentMaterials", () => {
  it("extracts pptx text and maps embedded images to slides", async () => {
    writeZip("deck.pptx", {
      "ppt/slides/slide1.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="120" y="80"/><a:ext cx="640" cy="120"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Growth doubled</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
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

    const result = await extractDocumentMaterials("deck.pptx", workspaceDir)

    expect(result.status).toBe("processed")
    expect(result.type).toBe("pptx")
    expect(result.source).toBe("deck.pptx")
    expect(result.text_path).toContain(".opencode/revela/doc-materials/")
    expect(result.images).toHaveLength(1)
    expect(result.images?.[0].page_or_slide).toBe("slide-01")
    expect(result.slides).toEqual([
      {
        slide: "slide-01",
        elements: [
          {
            id: "slide-01-element-01",
            kind: "text",
            zOrder: 1,
            bbox: { x: 120, y: 80, w: 640, h: 120 },
            text: "Growth doubled",
          },
        ],
      },
    ])
    expect(existsSync(join(workspaceDir, result.images![0].path))).toBe(true)
    expect(readFileSync(join(workspaceDir, result.text_path!), "utf-8")).toContain("Growth doubled")
    expect(JSON.parse(readFileSync(join(workspaceDir, result.manifest_path!), "utf-8"))).toMatchObject({
      source: "deck.pptx",
      type: "pptx",
      slides: [
        {
          slide: "slide-01",
          elements: [
            expect.objectContaining({
              kind: "text",
              zOrder: 1,
              bbox: { x: 120, y: 80, w: 640, h: 120 },
              text: "Growth doubled",
            }),
          ],
        },
      ],
      images: [
        expect.objectContaining({
          source_ref: "ppt/media/image1.png",
        }),
      ],
    })
  })

  it("filters low-value pptx assets into skipped_assets", async () => {
    writeZip("filtered-deck.pptx", {
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
      "ppt/media/unmapped-shadow.png": pngStub(),
    })

    const result = await extractDocumentMaterials("filtered-deck.pptx", workspaceDir)

    expect(result.status).toBe("processed")
    expect(result.images).toHaveLength(1)
    expect(result.images?.[0].source_ref).toBe("ppt/media/hero-photo.png")
    expect(result.slides).toEqual([
      {
        slide: "slide-01",
        elements: [
          {
            id: "slide-01-element-01",
            kind: "text",
            zOrder: 1,
            text: "Visual slide",
          },
        ],
      },
    ])
    expect(result.skipped_assets).toEqual([
      {
        source_ref: "ppt/media/logo-icon.png",
        page_or_slide: "slide-01",
        reason: "low_value_asset",
        kind: "icon",
      },
      {
        source_ref: "ppt/media/transparent-overlay.svg",
        page_or_slide: "slide-01",
        reason: "svg_asset",
        kind: "svg",
      },
      {
        source_ref: "ppt/media/unmapped-shadow.png",
        reason: "unmapped_media",
        kind: "overlay",
      },
    ])

    const manifest = JSON.parse(readFileSync(join(workspaceDir, result.manifest_path!), "utf-8"))
    expect(manifest.images).toHaveLength(1)
    expect(manifest.skipped_assets).toEqual(result.skipped_assets)
  })

  it("extracts bbox for text, image, and shape elements", async () => {
    writeZip("layout-deck.pptx", {
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
            <p:sp>
              <p:spPr><a:xfrm><a:off x="120" y="80"/><a:ext cx="640" cy="120"/></a:xfrm></p:spPr>
              <p:txBody><a:p><a:r><a:t>Headline</a:t></a:r></a:p></p:txBody>
            </p:sp>
            <p:pic>
              <p:nvPicPr><p:cNvPr id="2" name="Hero image"/></p:nvPicPr>
              <p:spPr><a:xfrm><a:off x="400" y="240"/><a:ext cx="1280" cy="720"/></a:xfrm></p:spPr>
              <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
            </p:pic>
            <p:cxnSp>
              <p:spPr><a:xfrm><a:off x="1800" y="980"/><a:ext cx="60" cy="40"/></a:xfrm></p:spPr>
            </p:cxnSp>
          </p:spTree></p:cSld>
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

    const result = await extractDocumentMaterials("layout-deck.pptx", workspaceDir)

    expect(result.slides).toEqual([
      {
        slide: "slide-01",
        width: 1920,
        height: 1080,
        elements: [
          {
            id: "slide-01-element-01",
            kind: "text",
            zOrder: 1,
            bbox: { x: 120, y: 80, w: 640, h: 120 },
            text: "Headline",
          },
          {
            id: "slide-01-element-02",
            kind: "image",
            zOrder: 2,
            bbox: { x: 400, y: 240, w: 1280, h: 720 },
            likelyHeroImage: true,
            name: "Hero image",
            source_ref: "ppt/media/image1.png",
            path: result.images?.[0].path,
            asset_status: "kept",
          },
          {
            id: "slide-01-element-03",
            kind: "shape",
            zOrder: 3,
            bbox: { x: 1800, y: 980, w: 60, h: 40 },
            likelyDecoration: true,
          },
        ],
      },
    ])
  })

  it("adds heuristic role flags for background, logo, and overlays", async () => {
    writeZip("heuristics-deck.pptx", {
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
              <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1920" cy="700"/></a:xfrm></p:spPr>
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

    const result = await extractDocumentMaterials("heuristics-deck.pptx", workspaceDir)
    const elements = result.slides?.[0].elements ?? []

    expect(elements).toEqual([
      expect.objectContaining({
        kind: "image",
        source_ref: "ppt/media/background.png",
        likelyBackground: true,
      }),
      expect.objectContaining({
        kind: "image",
        source_ref: "ppt/media/company-logo.png",
        likelyLogo: true,
      }),
      expect.objectContaining({
        kind: "image",
        source_ref: "ppt/media/transparent-overlay.svg",
        asset_status: "skipped",
        likelyOverlayMask: true,
      }),
      expect.objectContaining({
        kind: "shape",
        likelyOverlayMask: true,
      }),
    ])
  })

  it("extracts docx images with document-wide association", async () => {
    writeZip("brief.docx", {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Default Extension="png" ContentType="image/png"/>
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
      "word/media/image1.png": pngStub(),
    })

    const result = await extractDocumentMaterials("brief.docx", workspaceDir)

    expect(result.status).toBe("processed")
    expect(result.type).toBe("docx")
    expect(result.images).toHaveLength(1)
    expect(result.images?.[0].note).toBe("Document-wide association")
    expect(readFileSync(join(workspaceDir, result.text_path!), "utf-8")).toContain("Quarterly summary")
  })

  it("extracts xlsx sheet text and sheet-level image mappings", async () => {
    writeZip("model.xlsx", {
      "xl/sharedStrings.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Revenue</t></si></sst>`
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row></sheetData>
        </worksheet>`
      ),
      "xl/worksheets/_rels/sheet1.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
        </Relationships>`
      ),
      "xl/drawings/drawing1.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <xdr:twoCellAnchor><xdr:pic><xdr:blipFill><a:blip r:embed="rIdImg1"/></xdr:blipFill></xdr:pic></xdr:twoCellAnchor>
        </xdr:wsDr>`
      ),
      "xl/drawings/_rels/drawing1.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`
      ),
      "xl/media/image1.png": pngStub(),
    })

    const result = await extractDocumentMaterials("model.xlsx", workspaceDir)

    expect(result.status).toBe("processed")
    expect(result.type).toBe("xlsx")
    expect(result.images).toHaveLength(1)
    expect(result.images?.[0].page_or_slide).toBe("sheet-01")
    expect(result.text_path).toBeDefined()
    expect(result.tables).toEqual([
      {
        path: result.text_path!,
        source_ref: "workbook",
        note: "Sheet text and tables extracted to text file",
      },
    ])
    expect(readFileSync(join(workspaceDir, result.text_path!), "utf-8")).toContain("Revenue\t42")
  })

  it("extracts pdf text and embedded images", async () => {
    await writePdf("report.pdf", {
      text: "Battery demand is accelerating",
      includeImage: true,
    })

    const result = await extractDocumentMaterials("report.pdf", workspaceDir)

    expect(result.status).toBe("processed")
    expect(result.type).toBe("pdf")
    expect(result.images).toHaveLength(1)
    expect(result.images?.[0]).toEqual(
      expect.objectContaining({
        page_or_slide: "page-01",
        source_ref: expect.stringContaining("pdf/page-01/"),
      }),
    )
    expect(existsSync(join(workspaceDir, result.images![0].path))).toBe(true)
    expect(readFileSync(join(workspaceDir, result.text_path!), "utf-8")).toContain("Battery demand is accelerating")
    expect(JSON.parse(readFileSync(join(workspaceDir, result.manifest_path!), "utf-8"))).toMatchObject({
      source: "report.pdf",
      type: "pdf",
      images: [
        expect.objectContaining({
          page_or_slide: "page-01",
        }),
      ],
    })
  })

  it("extracts pdf text even when no embedded images exist", async () => {
    await writePdf("text-only.pdf", {
      text: "No visual assets on this page",
      includeImage: false,
    })

    const result = await extractDocumentMaterials("text-only.pdf", workspaceDir)

    expect(result.status).toBe("processed")
    expect(result.type).toBe("pdf")
    expect(result.images).toEqual([])
    expect(readFileSync(join(workspaceDir, result.text_path!), "utf-8")).toContain("No visual assets on this page")
  })

  it("skips unsupported file types", async () => {
    writeFileSync(join(workspaceDir, "notes.md"), "plain text", "utf-8")

    const result = await extractDocumentMaterials("notes.md", workspaceDir)

    expect(result).toEqual({
      status: "skipped",
      source: "notes.md",
      type: "other",
      reason: "unsupported_file_type",
    })
  })

  it("reuses cached manifest on repeated extraction", async () => {
    writeZip("deck.pptx", {
      "ppt/slides/slide1.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="50" y="60"/><a:ext cx="400" cy="100"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Repeatable cache</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:spPr><a:xfrm><a:off x="600" y="200"/><a:ext cx="800" cy="500"/></a:xfrm></p:spPr><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree></p:cSld>
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

    const first = await extractDocumentMaterials("deck.pptx", workspaceDir)
    const second = await extractDocumentMaterials("deck.pptx", workspaceDir)

    expect(first.slides?.[0].elements).toEqual([
      {
        id: "slide-01-element-01",
        kind: "text",
        zOrder: 1,
        bbox: { x: 50, y: 60, w: 400, h: 100 },
        text: "Repeatable cache",
      },
      {
        id: "slide-01-element-02",
        kind: "image",
        zOrder: 2,
        bbox: { x: 600, y: 200, w: 800, h: 500 },
        source_ref: "ppt/media/image1.png",
        path: first.images?.[0].path,
        asset_status: "kept",
      },
    ])
    expect(second).toEqual(first)
  })

  it("reuses cached manifest on repeated pdf extraction", async () => {
    await writePdf("cached.pdf", {
      text: "Cached PDF extraction",
      includeImage: true,
    })

    const first = await extractDocumentMaterials("cached.pdf", workspaceDir)
    const second = await extractDocumentMaterials("cached.pdf", workspaceDir)

    expect(first.type).toBe("pdf")
    expect(first.images).toHaveLength(1)
    expect(second).toEqual(first)
  })
})
