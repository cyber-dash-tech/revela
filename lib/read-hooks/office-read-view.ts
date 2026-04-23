import { readFileSync } from "fs"
import { join } from "path"
import type { PptxSlide } from "../document-materials/extract"
import { extractDocumentMaterials } from "../document-materials/extract"
import { buildOfficeReadView } from "./dispatch"
import { extractDocx } from "./extractors/docx"
import { extractPptx } from "./extractors/pptx"
import { extractXlsx } from "./extractors/xlsx"
import { formatExtractedText } from "./dispatch"

const HANDLERS: Record<string, (buf: Buffer) => Promise<string>> = {
  ".docx": extractDocx,
  ".pptx": extractPptx,
  ".xlsx": extractXlsx,
}

function buildPptxStructureHints(slides: PptxSlide[] | undefined): string {
  if (!slides?.length) return ""

  const lines = ["", "## Slide Structure", ""]
  for (const slide of slides) {
    const textCount = slide.elements.filter((element) => element.kind === "text").length
    const keptImageCount = slide.elements.filter((element) => element.kind === "image" && element.asset_status === "kept").length
    const skippedImageCount = slide.elements.filter((element) => element.kind === "image" && element.asset_status === "skipped").length
    const shapeCount = slide.elements.filter((element) => element.kind === "shape").length
    const summary = [
      textCount > 0 ? `${textCount} text` : null,
      keptImageCount > 0 ? `${keptImageCount} kept image` : null,
      skippedImageCount > 0 ? `${skippedImageCount} skipped image` : null,
      shapeCount > 0 ? `${shapeCount} shape` : null,
    ].filter(Boolean).join(", ") || "no parsed elements"
    lines.push(`- ${slide.slide}: ${summary}`)

    const roleSummary = [
      countRole(slide, (element) => element.likelyBackground, "background image"),
      countRole(slide, (element) => element.likelyHeroImage, "hero image"),
      countRole(slide, (element) => element.likelyLogo, "logo"),
      countRole(slide, (element) => element.likelyOverlayMask, "overlay"),
      countRole(slide, (element) => element.likelyDecoration, "decoration"),
    ].filter(Boolean).join(", ")
    if (roleSummary) lines.push(`  likely roles: ${roleSummary}`)
  }

  return lines.join("\n")
}

function countRole(
  slide: PptxSlide,
  predicate: (element: PptxSlide["elements"][number]) => boolean | undefined,
  label: string,
): string | null {
  const count = slide.elements.filter(predicate).length
  if (count === 0) return null
  return `${count} ${label}${count === 1 ? "" : "s"}`
}

export async function createOfficeReadView(filePath: string, workspaceDir: string): Promise<string> {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase()
  const handler = HANDLERS[ext]
  if (!handler) throw new Error(`unsupported office file type: ${ext}`)

  const materialized = await extractDocumentMaterials(filePath, workspaceDir)

  if (materialized.status === "processed" && materialized.text_path) {
    const textPath = join(workspaceDir, materialized.text_path)
    const extracted = readFileSync(textPath, "utf-8")
    const text = extracted.replace(/^\[Extracted from: .*?\]\n\n/, "")
    const view = buildOfficeReadView(filePath, text, materialized.images)
    return filePath.toLowerCase().endsWith(".pptx")
      ? view + buildPptxStructureHints(materialized.slides)
      : view
  }

  const buf = readFileSync(filePath)
  const text = await handler(buf)
  return formatExtractedText(filePath, text)
}
