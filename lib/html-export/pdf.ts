import { PDFDocument } from "pdf-lib"
import { readFileSync, renameSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { randomBytes } from "crypto"

export async function writeSinglePagePdfFromPng(pngPath: string, outputPath: string, width: number, height: number): Promise<void> {
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(new Uint8Array(readFileSync(pngPath)))
  const page = pdf.addPage([width, height])
  page.drawImage(image, { x: 0, y: 0, width, height })

  const tmpPath = join(dirname(outputPath), `.revela-${randomBytes(6).toString("hex")}.pdf`)
  writeFileSync(tmpPath, await pdf.save())
  renameSync(tmpPath, outputPath)
}
