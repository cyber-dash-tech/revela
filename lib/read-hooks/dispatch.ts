import { basename, extname } from "path"
export const OFFICE_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx"])
export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".gif"])

export type ReadStrategy =
  | "before-materialize-document"
  | "after-extract-text"
  | "after-compress-image"
  | "passthrough"

export function classifyReadFile(filePath: string): ReadStrategy {
  const ext = extname(filePath).toLowerCase()
  if (OFFICE_EXTENSIONS.has(ext)) return "before-materialize-document"
  if (ext === ".pdf") return "after-extract-text"
  if (IMAGE_EXTENSIONS.has(ext)) return "after-compress-image"
  return "passthrough"
}

export function formatExtractedText(filePath: string, text: string): string {
  return `[Extracted from: ${basename(filePath)}]\n\n${text}`
}

export function buildOfficeReadView(
  filePath: string,
  text: string,
  images: Array<{ path: string }> | undefined,
): string {
  const lines = [
    `# Extracted from: ${basename(filePath)}`,
    "",
    "## Text",
    "",
    text.trim() || "No text extracted.",
  ]

  lines.push("", "## Images", "")

  if (!images?.length) {
    lines.push("- None")
  } else {
    for (const image of images) lines.push(`- ${image.path}`)
  }

  return lines.join("\n")
}
