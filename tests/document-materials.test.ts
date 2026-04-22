import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { zipSync, strToU8 } from "fflate"
import { extractDocumentMaterials } from "../lib/document-materials/extract"

let workspaceDir = ""

function pngStub(): Uint8Array {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
}

function writeZip(relativePath: string, files: Record<string, Uint8Array>): string {
  const filePath = join(workspaceDir, relativePath)
  writeFileSync(filePath, zipSync(files))
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
          <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Growth doubled</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
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
    expect(existsSync(join(workspaceDir, result.images![0].path))).toBe(true)
    expect(readFileSync(join(workspaceDir, result.text_path!), "utf-8")).toContain("Growth doubled")
    expect(JSON.parse(readFileSync(join(workspaceDir, result.manifest_path!), "utf-8"))).toMatchObject({
      source: "deck.pptx",
      type: "pptx",
    })
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
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Repeatable cache</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
        </p:sld>`
      ),
      "ppt/media/image1.png": pngStub(),
    })

    const first = await extractDocumentMaterials("deck.pptx", workspaceDir)
    const second = await extractDocumentMaterials("deck.pptx", workspaceDir)

    expect(second).toEqual(first)
  })
})
