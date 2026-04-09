/**
 * lib/read-hooks/extractors/pptx.ts
 *
 * PPTX text extraction using fflate (ZIP decompression) + @xmldom/xmldom (XML parsing).
 * Pure JS, zero native dependencies.
 *
 * PPTX is a ZIP archive containing slide XML files at ppt/slides/slideN.xml.
 * Text content is stored in <a:t> elements under the DrawingML namespace.
 */

import { unzipSync } from "fflate"
import { DOMParser } from "@xmldom/xmldom"

const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"

/**
 * Extract text from all slides in a PPTX buffer.
 * Returns slides in order, each prefixed with "--- Slide N ---".
 */
export async function extractPptx(buf: Buffer): Promise<string> {
  const files = unzipSync(new Uint8Array(buf))
  const parser = new DOMParser()
  const slides: string[] = []

  // Collect and sort slide files by slide number
  const slideFiles = Object.keys(files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)![0], 10)
      const nb = parseInt(b.match(/\d+/)![0], 10)
      return na - nb
    })

  for (const path of slideFiles) {
    const xml = new TextDecoder().decode(files[path])
    const doc = parser.parseFromString(xml, "text/xml")

    // Extract all <a:t> text nodes
    const textNodes = doc.getElementsByTagNameNS(DRAWINGML_NS, "t")
    const texts: string[] = []
    for (let i = 0; i < textNodes.length; i++) {
      const t = textNodes[i].textContent?.trim()
      if (t) texts.push(t)
    }

    if (texts.length) {
      const slideNum = path.match(/\d+/)![0]
      slides.push(`--- Slide ${slideNum} ---\n${texts.join("\n")}`)
    }
  }

  return slides.join("\n\n")
}
