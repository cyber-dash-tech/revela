import { existsSync, mkdirSync, writeFileSync } from "fs"
import { dirname, isAbsolute, normalize, relative, resolve } from "path"
import { activeDesign, getDesignSection } from "../design/designs"
import { templateDeckCss } from "../page-templates"

export type DeckFoundationMode = "create" | "repair"
export type DeckFoundationStatus = "created" | "updated"

export interface CreateDeckFoundationInput {
  workspaceRoot: string
  outputPath: string
  title: string
  language: string
  designName?: string
  mode?: DeckFoundationMode
  overwrite?: boolean
}

export interface CreateDeckFoundationResult {
  ok: true
  outputPath: string
  design: string
  includedSections: string[]
  status: DeckFoundationStatus
  next: string[]
}

interface FoundationParts {
  fontLinks: string[]
  cssBlocks: string[]
  scriptBlocks: string[]
}

const SLIDES_START = "<!-- revela-slides:start -->"
const SLIDES_END = "<!-- revela-slides:end -->"

export function createDeckFoundation(input: CreateDeckFoundationInput): CreateDeckFoundationResult {
  const outputPath = normalizeOutputPath(input.outputPath)
  const targetPath = safeWorkspaceFilePath(input.workspaceRoot, outputPath)
  const mode = input.mode ?? "create"
  const canOverwrite = input.overwrite === true || mode === "repair"
  const existed = existsSync(targetPath)

  if (existed && !canOverwrite) {
    throw new Error(`Deck HTML already exists at ${outputPath}. Pass overwrite=true or mode=repair to replace the foundation shell.`)
  }

  const design = input.designName || activeDesign()
  const foundation = getDesignSection("foundation", design)
  const parts = parseFoundationParts(foundation)
  if (parts.cssBlocks.length === 0) throw new Error(`Design '${design}' foundation does not include a CSS code block.`)
  if (parts.scriptBlocks.length === 0) throw new Error(`Design '${design}' foundation does not include a SlidePresentation JavaScript code block.`)

  const html = renderFoundationHtml({
    language: input.language || "en",
    title: input.title || "Revela Deck",
    fontLinks: parts.fontLinks,
    css: [parts.cssBlocks.join("\n\n"), templateDeckCss({ designName: design, designAssetBasePath: designAssetBasePath(input.workspaceRoot, outputPath, design) })].join("\n\n"),
    script: parts.scriptBlocks.map(guardEmptyDeckNavigation).join("\n\n"),
  })

  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, html, "utf-8")

  return {
    ok: true,
    outputPath,
    design,
    includedSections: [
      "design:foundation",
      parts.fontLinks.length > 0 ? "foundation:font-links" : "foundation:font-links:none",
      "foundation:css",
      "foundation:SlidePresentation",
    ],
    status: existed ? "updated" : "created",
    next: [
      "Fetch active design rules before patching slides.",
      "Fetch required layouts and components from the design before adding slide content.",
      "Patch slides between the revela-slides markers chapter by chapter, then run artifact QA.",
    ],
  }
}

function designAssetBasePath(workspaceRoot: string, outputPath: string, designName: string): string | undefined {
  if (!existsSync(resolve(workspaceRoot, `designs/${designName}/assets`))) return undefined
  const fromDir = dirname(outputPath)
  const assetPath = normalize(relative(fromDir, `designs/${designName}/assets`)).replace(/\\/g, "/")
  return assetPath.startsWith(".") ? assetPath : `./${assetPath}`
}

export function normalizeOutputPath(outputPath: string): string {
  const trimmed = outputPath.trim()
  if (!trimmed) throw new Error("outputPath is required")
  if (!trimmed.endsWith(".html")) throw new Error("Deck foundation outputPath must end in .html")
  if (isAbsolute(trimmed)) throw new Error("Deck foundation outputPath must be workspace-relative")
  const segments = trimmed.split(/[\\/]+/)
  if (segments.includes("..")) throw new Error("Deck foundation outputPath must not contain parent-directory traversal")
  return normalize(trimmed).replace(/\\/g, "/")
}

function safeWorkspaceFilePath(workspaceRoot: string, outputPath: string): string {
  const root = resolve(workspaceRoot)
  const target = resolve(root, outputPath)
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error("Deck foundation outputPath must stay inside the workspace")
  }
  return target
}

function parseFoundationParts(foundation: string): FoundationParts {
  const fontLinks = extractFontLinks(foundation)
  const cssBlocks: string[] = []
  const scriptBlocks: string[] = []
  const fenceRe = /```([\w-]*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = fenceRe.exec(foundation)) !== null) {
    const lang = (match[1] || "").toLowerCase()
    const body = match[2].trim()
    if (!body) continue
    if (lang === "css") cssBlocks.push(body)
    if ((lang === "javascript" || lang === "js") && body.includes("class SlidePresentation")) {
      scriptBlocks.push(body)
    }
  }

  return { fontLinks, cssBlocks, scriptBlocks }
}

function extractFontLinks(foundation: string): string[] {
  const links: string[] = []
  const seen = new Set<string>()
  const linkRe = /<link\b[^>]*(?:fonts\.googleapis|fonts\.gstatic|rel=["']preconnect["'])[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(foundation)) !== null) {
    const link = match[0].trim()
    if (seen.has(link)) continue
    seen.add(link)
    links.push(link)
  }
  return links
}

function guardEmptyDeckNavigation(script: string): string {
  return script.replace(
    /new\s+SlidePresentation\s*\(\s*\)\s*;?/g,
    'if (document.querySelector(".slide")) { new SlidePresentation(); }',
  )
}

function renderFoundationHtml(input: {
  language: string
  title: string
  fontLinks: string[]
  css: string
  script: string
}): string {
  const fontLinks = input.fontLinks.map((link) => `    ${link}`).join("\n")
  return [
    "<!DOCTYPE html>",
    `<html lang="${escapeAttribute(input.language)}">`,
    "<head>",
    "    <meta charset=\"UTF-8\">",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
    `    <title>${escapeHtml(input.title)}</title>`,
    fontLinks,
    "    <style>",
    input.css,
    "    </style>",
    "</head>",
    "<body>",
    `    ${SLIDES_START}`,
    `    ${SLIDES_END}`,
    "    <script>",
    input.script,
    "    </script>",
    "</body>",
    "</html>",
    "",
  ].filter((line) => line !== "").join("\n")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttribute(value: string): string {
  return escapeHtml(value.trim() || "en")
}

export function deckFoundationMarkers(): { start: string; end: string } {
  return { start: SLIDES_START, end: SLIDES_END }
}
