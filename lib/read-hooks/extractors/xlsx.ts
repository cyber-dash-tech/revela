/**
 * lib/read-hooks/extractors/xlsx.ts
 *
 * XLSX text extraction using fflate (ZIP decompression) + @xmldom/xmldom (XML parsing).
 * Pure JS, zero native dependencies.
 *
 * XLSX is a ZIP archive. Text values are stored in xl/sharedStrings.xml;
 * cell references index into that shared table. Sheet data lives in
 * xl/worksheets/sheetN.xml.
 */

import { unzipSync } from "fflate"
import { DOMParser } from "@xmldom/xmldom"

/**
 * Extract tabular text from all sheets in an XLSX buffer.
 * Returns sheets in order, each prefixed with "--- Sheet N ---".
 * Cells are tab-separated, rows are newline-separated.
 */
export async function extractXlsx(buf: Buffer): Promise<string> {
  const files = unzipSync(new Uint8Array(buf))
  const parser = new DOMParser()

  // 1. Parse sharedStrings.xml — all string values are stored here by index
  const sharedStrings: string[] = []
  const ssFile = files["xl/sharedStrings.xml"]
  if (ssFile) {
    const doc = parser.parseFromString(new TextDecoder().decode(ssFile), "text/xml")
    const siNodes = doc.getElementsByTagName("si")
    for (let i = 0; i < siNodes.length; i++) {
      const tNodes = siNodes[i].getElementsByTagName("t")
      const parts: string[] = []
      for (let j = 0; j < tNodes.length; j++) {
        parts.push(tNodes[j].textContent ?? "")
      }
      sharedStrings.push(parts.join(""))
    }
  }

  // 2. Parse each worksheet
  const sheets: string[] = []
  const sheetFiles = Object.keys(files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)![0], 10)
      const nb = parseInt(b.match(/\d+/)![0], 10)
      return na - nb
    })

  for (const path of sheetFiles) {
    const xml = new TextDecoder().decode(files[path])
    const doc = parser.parseFromString(xml, "text/xml")
    const rows = doc.getElementsByTagName("row")
    const rowTexts: string[] = []

    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].getElementsByTagName("c")
      const cellValues: string[] = []

      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c]
        const type = cell.getAttribute("t")
        const vNode = cell.getElementsByTagName("v")[0]
        const v = vNode?.textContent ?? ""
        // type="s" → shared string index; otherwise use raw value
        cellValues.push(type === "s" ? (sharedStrings[parseInt(v, 10)] ?? v) : v)
      }

      if (cellValues.some(Boolean)) {
        rowTexts.push(cellValues.join("\t"))
      }
    }

    if (rowTexts.length) {
      const sheetNum = path.match(/\d+/)![0]
      sheets.push(`--- Sheet ${sheetNum} ---\n${rowTexts.join("\n")}`)
    }
  }

  return sheets.join("\n\n")
}
