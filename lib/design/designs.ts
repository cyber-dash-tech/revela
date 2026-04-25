/**
 * DesignManager — manage revela visual design templates.
 *
 * Designs are stored in ~/.config/revela/designs/<name>/.
 * Each design directory contains DESIGN.md (required) and optionally preview.html.
 *
 * Built-in designs are shipped with the npm package under designs/ and seeded
 * to the config directory on first run.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs"
import { join, resolve, basename } from "path"
import { tmpdir } from "os"
import { parseFrontmatter } from "../frontmatter"
import {
  DESIGNS_DIR,
  DEFAULT_DESIGN,
  loadConfig,
  saveConfig,
} from "../config"
import { childLog } from "../log"

const designLog = childLog("designs")

// Seed directory: built-in designs shipped with this package.
const SEED_DIR = resolve(__dirname, "../..", "designs")

export interface DesignInfo {
  name: string
  description: string
  author: string
  version: string
  internal: boolean
  skillText: string
}

export interface ListDesignsOptions {
  includeInternal?: boolean
}

export interface CreateDesignPackageArgs {
  name: string
  base?: string
  designMd: string
  previewHtml: string
  overwrite?: boolean
}

export interface CreateDesignPackageResult {
  ok: true
  name: string
  path: string
  files: string[]
  base?: string
  overwritten: boolean
}

export interface ValidateDesignPackageResult {
  ok: boolean
  name: string
  path: string
  hasDesignMd: boolean
  hasPreview: boolean
  hasMarkers: boolean
  sections: string[]
  layouts: string[]
  components: string[]
  errors: string[]
}

export interface DesignPreviewInfo {
  name: string
  designDir: string
  previewPath: string
  hasPreview: boolean
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/**
 * Copy built-in designs from the package to ~/.config/revela/designs/.
 * Always overwrites to keep bundled designs up to date.
 * User-created designs (not in the seed directory) are never touched.
 */
export function seedBuiltinDesigns(): void {
  if (!existsSync(SEED_DIR)) return
  mkdirSync(DESIGNS_DIR, { recursive: true })

  for (const entry of readdirSync(SEED_DIR)) {
    const src = join(SEED_DIR, entry)
    if (!statSync(src).isDirectory()) continue
    if (!existsSync(join(src, "DESIGN.md"))) continue

    const dst = join(DESIGNS_DIR, entry)
    mkdirSync(dst, { recursive: true })
    cpSync(src, dst, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Parse a DESIGN.md file into DesignInfo. Returns null on any error. */
export function parseDesignFile(filePath: string): DesignInfo | null {
  try {
    const text = readFileSync(filePath, "utf-8")
    const { meta, body } = parseFrontmatter(text)
    return {
      name: meta.name || basename(join(filePath, "..")),
      description: meta.description || "",
      author: meta.author || "unknown",
      version: meta.version || "0.0.0",
      internal: meta.internal === "true",
      skillText: body,
    }
  } catch (e) {
    designLog.warn("failed to parse design file — skipping", {
      filePath,
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List installed designs, sorted by name. Internal designs are hidden by default. */
export function listDesigns(options: ListDesignsOptions = {}): DesignInfo[] {
  if (!existsSync(DESIGNS_DIR)) return []
  const results: DesignInfo[] = []
  const includeInternal = options.includeInternal ?? false

  for (const entry of readdirSync(DESIGNS_DIR).sort()) {
    const dir = join(DESIGNS_DIR, entry)
    if (!statSync(dir).isDirectory()) continue
    const mdPath = join(dir, "DESIGN.md")
    if (!existsSync(mdPath)) continue
    const info = parseDesignFile(mdPath)
    if (info && (includeInternal || !info.internal)) results.push(info)
  }
  return results
}

/** Get the name of the currently active design. */
export function activeDesign(): string {
  const cfg = loadConfig()
  return cfg.activeDesign || cfg.activeTemplate || DEFAULT_DESIGN
}

/** Set the active design. Throws if design is not installed. */
export function activateDesign(name: string): void {
  if (!designExists(name)) {
    throw new Error(`Design '${name}' is not installed`)
  }
  const cfg = loadConfig()
  cfg.activeDesign = name
  saveConfig(cfg)
}

/** Get the skill text body from a design's DESIGN.md. */
export function getDesignSkillMd(name?: string): string {
  const designName = name || activeDesign()
  const mdPath = join(DESIGNS_DIR, designName, "DESIGN.md")
  if (!existsSync(mdPath)) {
    throw new Error(`Design '${designName}' is not installed`)
  }
  const info = parseDesignFile(mdPath)
  if (!info) {
    throw new Error(`Failed to parse DESIGN.md for '${designName}'`)
  }
  return info.skillText
}

/** Resolve a design's preview.html path. Throws if the design is not installed. */
export function resolveDesignPreview(name?: string): DesignPreviewInfo {
  const designName = normalizeDesignName(name || activeDesign())
  const designDir = join(DESIGNS_DIR, designName)
  const mdPath = join(designDir, "DESIGN.md")
  if (!existsSync(designDir) || !existsSync(mdPath)) {
    throw new Error(`Design '${designName}' is not installed`)
  }

  const previewPath = join(designDir, "preview.html")
  return {
    name: designName,
    designDir,
    previewPath,
    hasPreview: existsSync(previewPath),
  }
}

/** Normalize and validate a design package name. */
export function normalizeDesignName(name: string): string {
  const normalized = name.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
    throw new Error("Design name must be kebab-case using lowercase letters, numbers, and hyphens")
  }
  return normalized
}

/** Create a local design package in ~/.config/revela/designs/<name>/. */
export function createDesignPackage(args: CreateDesignPackageArgs): CreateDesignPackageResult {
  const name = normalizeDesignName(args.name)
  const designMd = args.designMd?.trim()
  const previewHtml = args.previewHtml?.trim()

  if (!designMd) throw new Error("designMd is required")
  if (!previewHtml) throw new Error("previewHtml is required")

  const target = join(DESIGNS_DIR, name)
  const existed = existsSync(target)
  if (existed && !args.overwrite) {
    throw new Error(`Design '${name}' already exists. Pass overwrite=true to replace it.`)
  }

  mkdirSync(DESIGNS_DIR, { recursive: true })
  if (existed) {
    rmSync(target, { recursive: true, force: true })
  }
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, "DESIGN.md"), `${designMd}\n`, "utf-8")
  writeFileSync(join(target, "preview.html"), `${previewHtml}\n`, "utf-8")

  const validation = validateDesignPackage(name)
  if (!validation.ok) {
    throw new Error(`Created design package is invalid: ${validation.errors.join("; ")}`)
  }

  return {
    ok: true,
    name,
    path: target,
    files: ["DESIGN.md", "preview.html"],
    base: args.base,
    overwritten: existed,
  }
}

/** Validate a local design package for the minimum Revela design contract. */
export function validateDesignPackage(nameInput: string): ValidateDesignPackageResult {
  let name = nameInput
  const errors: string[] = []
  try {
    name = normalizeDesignName(nameInput)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  const dir = join(DESIGNS_DIR, name)
  const mdPath = join(dir, "DESIGN.md")
  const previewPath = join(dir, "preview.html")
  const hasDesignMd = existsSync(mdPath)
  const hasPreview = existsSync(previewPath)
  let hasMarkers = false
  let sections: string[] = []
  let layouts: string[] = []
  let components: string[] = []

  if (!existsSync(dir)) errors.push(`Design directory does not exist: ${dir}`)
  if (!hasDesignMd) errors.push("DESIGN.md is missing")
  if (!hasPreview) errors.push("preview.html is missing")

  if (hasDesignMd) {
    const info = parseDesignFile(mdPath)
    if (!info) {
      errors.push("DESIGN.md could not be parsed")
    } else {
      const parsed = parseDesignSections(info.skillText)
      hasMarkers = parsed.hasMarkers
      sections = Object.keys(parsed.sections)
      layouts = Object.keys(parsed.layouts)
      components = Object.keys(parsed.components)

      if (!hasMarkers) errors.push("DESIGN.md must include marker sections")
      if (!parsed.sections.foundation) errors.push("@design:foundation section is missing")
      if (!parsed.sections.rules) errors.push("@design:rules section is missing")
      if (layouts.length === 0) errors.push("At least one @layout section is required")
      if (components.length === 0) errors.push("At least one @component section is required")
    }
  }

  if (hasPreview) {
    const preview = readFileSync(previewPath, "utf-8")
    if (!preview.includes('<section class="slide"')) errors.push("preview.html must include slide sections")
    if (!preview.includes("slide-qa=")) errors.push("preview.html slides must include slide-qa attributes")
    if (!preview.includes("slide-canvas")) errors.push("preview.html must include .slide-canvas")
  }

  return {
    ok: errors.length === 0,
    name,
    path: dir,
    hasDesignMd,
    hasPreview,
    hasMarkers,
    sections,
    layouts,
    components,
    errors,
  }
}

// ---------------------------------------------------------------------------
// Marker-based section / component parsing
// ---------------------------------------------------------------------------

export interface LayoutInfo {
  /** Full text content of the layout block (without marker lines). */
  content: string
  /** Whether this layout type should be QA-checked for balance/rhythm. */
  qa: boolean
}

export interface DesignSections {
  /** Map of @design:<name> section → extracted content (without marker lines). */
  sections: Record<string, string>
  /** Map of @layout:<name> → LayoutInfo with content + qa flag. */
  layouts: Record<string, LayoutInfo>
  /** Map of @component:<name> → extracted content (without marker lines). */
  components: Record<string, string>
  /** Whether the DESIGN.md has any markers at all. */
  hasMarkers: boolean
}

/**
 * Parse a DESIGN.md body (no frontmatter) into sections, layouts, and components
 * using the three-layer HTML comment marker convention:
 *   <!-- @design:<name>:start --> … <!-- @design:<name>:end -->
 *   <!-- @layout:<name>:start qa=true|false --> … <!-- @layout:<name>:end -->
 *   <!-- @component:<name>:start --> … <!-- @component:<name>:end -->
 *
 * The `qa` attribute on layout markers defaults to `true` when omitted.
 * Returns an object with empty maps and hasMarkers=false when no markers found.
 */
export function parseDesignSections(body: string): DesignSections {
  const sections: Record<string, string> = {}
  const layouts: Record<string, LayoutInfo> = {}
  const components: Record<string, string> = {}

  const sectionRe   = /<!--\s*@design:(\w[\w-]*):start\s*-->([\s\S]*?)<!--\s*@design:\1:end\s*-->/g
  const layoutRe    = /<!--\s*@layout:(\w[\w-]*):start(?:\s+qa=(true|false))?\s*-->([\s\S]*?)<!--\s*@layout:\1:end\s*-->/g
  const componentRe = /<!--\s*@component:(\w[\w-]*):start\s*-->([\s\S]*?)<!--\s*@component:\1:end\s*-->/g

  let hasMarkers = false
  let match: RegExpExecArray | null

  while ((match = sectionRe.exec(body)) !== null) {
    hasMarkers = true
    sections[match[1]] = match[2].trim()
  }

  while ((match = layoutRe.exec(body)) !== null) {
    hasMarkers = true
    const qaAttr = match[2]
    // qa defaults to true when attribute is omitted
    const qa = qaAttr === "false" ? false : true
    layouts[match[1]] = { content: match[3].trim(), qa }
  }

  while ((match = componentRe.exec(body)) !== null) {
    hasMarkers = true
    components[match[1]] = match[2].trim()
  }

  return { sections, layouts, components, hasMarkers }
}

/**
 * Generate a compact Component Index table from parsed components.
 * Lists each component name with a one-line description (first non-empty
 * text line of the component block, stripped of markdown heading markers).
 */
export function generateComponentIndex(components: Record<string, string>): string {
  const names = Object.keys(components)
  if (names.length === 0) return ""

  const rows = names.map((name) => {
    const body = components[name]
    // Extract first non-empty non-marker line as a short description
    const firstLine = body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("<!--") && !l.startsWith("```"))
    // Strip markdown heading markers
    const desc = firstLine
      ? firstLine.replace(/^#+\s*/, "").replace(/\(.*?\)/, "").trim()
      : ""
    return `| \`${name}\` | ${desc} |`
  })

  return [
    "### Component Index",
    "",
    "| Component | Description |",
    "|---|---|",
    ...rows,
    "",
    "_Use `revela-designs` tool with `action: \"read\"` and `component: \"<name>\"` to get full CSS/HTML for any component._",
  ].join("\n")
}

/**
 * Generate a compact Layout Index table from parsed layouts.
 * Lists each layout name with the QA flag and a one-line description.
 */
export function generateLayoutIndex(layouts: Record<string, LayoutInfo>): string {
  const names = Object.keys(layouts)
  if (names.length === 0) return ""

  const rows = names.map((name) => {
    const { content, qa } = layouts[name]
    const firstLine = content
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("<!--") && !l.startsWith("```"))
    const desc = firstLine
      ? firstLine.replace(/^#+\s*/, "").replace(/\(.*?\)/, "").trim()
      : ""
    const qaIcon = qa ? "✓" : "—"
    return `| \`${name}\` | ${qaIcon} | ${desc} |`
  })

  return [
    "### Layout Index",
    "",
    "| Layout | QA | Description |",
    "|---|---|---|",
    ...rows,
    "",
    "_Use `revela-designs` tool with `action: \"read\"` and `layout: \"<name>\"` to get full HTML/CSS for any layout._",
  ].join("\n")
}

/**
 * Get the raw text of one or more named layouts from a DESIGN.md.
 * @param layoutNames - Comma-separated layout names or an array.
 * @param designName - Design to read from (defaults to active).
 */
export function getDesignLayout(
  layoutNames: string | string[],
  designName?: string,
): string {
  const name = designName || activeDesign()
  const mdPath = join(DESIGNS_DIR, name, "DESIGN.md")
  if (!existsSync(mdPath)) {
    throw new Error(`Design '${name}' is not installed`)
  }
  const text = readFileSync(mdPath, "utf-8")
  const { body } = parseFrontmatter(text)
  const { layouts, hasMarkers } = parseDesignSections(body)

  if (!hasMarkers) {
    throw new Error(`Design '${name}' has no markers — use getDesignSkillMd() for full text`)
  }

  const names = Array.isArray(layoutNames)
    ? layoutNames
    : layoutNames.split(",").map((s) => s.trim())

  const parts: string[] = []
  for (const layoutName of names) {
    if (!(layoutName in layouts)) {
      throw new Error(`Layout '${layoutName}' not found in design '${name}'`)
    }
    const { content, qa } = layouts[layoutName]
    parts.push(`### Layout: ${layoutName} (qa=${qa})\n\n${content}`)
  }
  return parts.join("\n\n---\n\n")
}

/**
 * Get the raw text of a named section from a DESIGN.md.
 * Throws if the design is not installed or the section doesn't exist.
 */
export function getDesignSection(sectionName: string, designName?: string): string {
  const name = designName || activeDesign()
  const mdPath = join(DESIGNS_DIR, name, "DESIGN.md")
  if (!existsSync(mdPath)) {
    throw new Error(`Design '${name}' is not installed`)
  }
  const text = readFileSync(mdPath, "utf-8")
  const { body } = parseFrontmatter(text)
  const { sections, hasMarkers } = parseDesignSections(body)

  if (!hasMarkers) {
    throw new Error(`Design '${name}' has no markers — use getDesignSkillMd() for full text`)
  }
  if (!(sectionName in sections)) {
    throw new Error(`Section '${sectionName}' not found in design '${name}'`)
  }
  return sections[sectionName]
}

/**
 * Get the raw text of one or more named components from a DESIGN.md.
 * @param componentNames - Comma-separated component names or an array.
 * @param designName - Design to read from (defaults to active).
 */
export function getDesignComponent(
  componentNames: string | string[],
  designName?: string,
): string {
  const name = designName || activeDesign()
  const mdPath = join(DESIGNS_DIR, name, "DESIGN.md")
  if (!existsSync(mdPath)) {
    throw new Error(`Design '${name}' is not installed`)
  }
  const text = readFileSync(mdPath, "utf-8")
  const { body } = parseFrontmatter(text)
  const { components, hasMarkers } = parseDesignSections(body)

  if (!hasMarkers) {
    throw new Error(`Design '${name}' has no markers — use getDesignSkillMd() for full text`)
  }

  const names = Array.isArray(componentNames)
    ? componentNames
    : componentNames.split(",").map((s) => s.trim())

  const parts: string[] = []
  for (const compName of names) {
    if (!(compName in components)) {
      throw new Error(`Component '${compName}' not found in design '${name}'`)
    }
    parts.push(`### Component: ${compName}\n\n${components[compName]}`)
  }
  return parts.join("\n\n---\n\n")
}

/** Remove an installed design. Throws if not found. */
export function removeDesign(name: string): void {
  const dir = join(DESIGNS_DIR, name)
  if (!existsSync(dir)) {
    throw new Error(`Design '${name}' is not installed`)
  }
  rmSync(dir, { recursive: true, force: true })
  // Reset active design if it was the removed one
  if (activeDesign() === name) {
    activateDesign(DEFAULT_DESIGN)
  }
}

/**
 * Install a design from a source.
 *
 * Supported sources:
 * - Local path (starts with `./ ` or `/` or exists on disk)
 * - URL (starts with `http://` or `https://`) — downloads zip
 * - GitHub shorthand `github:user/repo` — converted to zip URL
 *
 * Returns the installed design name.
 */
export async function installDesign(
  source: string,
  name?: string,
): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return installFromUrl(source, name)
  }
  if (source.startsWith("github:")) {
    const repo = source.slice("github:".length)
    const url = `https://github.com/${repo}/archive/refs/heads/main.zip`
    return installFromUrl(url, name)
  }
  // Local path
  return installFromPath(source, name)
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function designExists(name: string): boolean {
  const dir = join(DESIGNS_DIR, name)
  return existsSync(dir) && existsSync(join(dir, "DESIGN.md"))
}

function installFromPath(srcPath: string, name?: string): string {
  const resolved = resolve(srcPath)
  if (!existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`)
  }
  if (!existsSync(join(resolved, "DESIGN.md"))) {
    throw new Error(`No DESIGN.md found in ${resolved}`)
  }
  const info = parseDesignFile(join(resolved, "DESIGN.md"))
  const designName = name || info?.name || basename(resolved)
  const target = join(DESIGNS_DIR, designName)

  mkdirSync(DESIGNS_DIR, { recursive: true })
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
  }
  cpSync(resolved, target, { recursive: true })
  return designName
}

// ---------------------------------------------------------------------------
// Design class vocabulary extraction
// ---------------------------------------------------------------------------

/**
 * The set of CSS class names that are always allowed, regardless of design.
 * These are structural/behavioural classes used by every presentation.
 */
const UNIVERSAL_CLASSES = new Set([
  "slide",
  "slide-canvas",
  "visible",
  "reveal",
  "editable",
  "page",
  "bg",
  "fg",
  "overlay",
  "alt",
  "strong",
])

/**
 * CSS class prefixes that are always exempt from compliance checks.
 * Third-party libraries (icons, charts) generate classes with these prefixes.
 */
export const DEFAULT_PREFIX_EXEMPTIONS: string[] = ["lucide-", "echarts-", "editable-"]

export interface DesignClassVocabulary {
  /** Complete set of allowed CSS class names. */
  classes: Set<string>
  /** Class name prefixes that bypass compliance checks. */
  prefixExemptions: string[]
}

/**
 * Extract all CSS class names defined in a DESIGN.md and return a closed
 * vocabulary of allowed class names for compliance checking.
 *
 * Extraction sources:
 * - @design:foundation — parses CSS `.class-name` selectors in code blocks
 * - @layout:xxx — parses HTML class="..." attributes and CSS selectors
 * - @component:xxx — same as layouts
 *
 * UNIVERSAL_CLASSES and DEFAULT_PREFIX_EXEMPTIONS are always included.
 *
 * Falls back to UNIVERSAL_CLASSES-only when the design has no markers.
 */
export function extractDesignClasses(designName?: string): DesignClassVocabulary {
  const name = designName || activeDesign()
  const mdPath = join(DESIGNS_DIR, name, "DESIGN.md")

  if (!existsSync(mdPath)) {
    return { classes: new Set(UNIVERSAL_CLASSES), prefixExemptions: DEFAULT_PREFIX_EXEMPTIONS }
  }

  const raw = readFileSync(mdPath, "utf-8")
  const { body } = parseFrontmatter(raw)
  const { sections, layouts, components, hasMarkers } = parseDesignSections(body)

  if (!hasMarkers) {
    // No markers — can't extract a reliable vocabulary; return universal only
    return { classes: new Set(UNIVERSAL_CLASSES), prefixExemptions: DEFAULT_PREFIX_EXEMPTIONS }
  }

  const classes = new Set(UNIVERSAL_CLASSES)

  // Regex patterns for extraction (stateless — reset lastIndex before each use)
  const htmlClassRe = /class="([^"]*)"/g
  const cssClassRe = /\.([a-zA-Z_][\w-]*)/g

  /** Extract CSS class names from a CSS string (selector context only).
   * Strips url(...) and string literals before scanning to avoid false positives
   * from inline SVG data URIs and other non-selector content.
   */
  function extractFromCss(css: string): void {
    // Remove url(...) values (may contain encoded paths like w3.org, data URIs, etc.)
    const stripped = css
      .replace(/url\([^)]*\)/gi, "url()")
      // Remove quoted strings (single or double)
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''")
    cssClassRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = cssClassRe.exec(stripped)) !== null) {
      if (m[1]) classes.add(m[1])
    }
  }

  /** Extract CSS class names from an HTML string (class="..." attributes only). */
  function extractFromHtml(html: string): void {
    htmlClassRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = htmlClassRe.exec(html)) !== null) {
      for (const cls of m[1].split(/\s+/)) {
        if (cls.trim()) classes.add(cls.trim())
      }
    }
    // Also scan inline <style>...</style> blocks inside HTML snippets
    const styleBlockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi
    styleBlockRe.lastIndex = 0
    while ((m = styleBlockRe.exec(html)) !== null) {
      extractFromCss(m[1])
    }
  }

  /**
   * Scan a DESIGN.md section body and extract CSS class names only from:
   *   - ```css ... ``` code blocks  → CSS selector extraction
   *   - ```html ... ``` code blocks → HTML class="..." attribute extraction
   *   - <style>...</style> blocks   → CSS selector extraction
   *
   * Skips ```javascript / ```js / ```ts code blocks entirely to avoid
   * extracting JS method names (e.g. .classList, .forEach) as class names.
   */
  function extractFromSection(text: string): void {
    // Match fenced code blocks: ```<lang>\n...\n```
    const fenceRe = /```(\w*)\n([\s\S]*?)```/g
    let m: RegExpExecArray | null
    fenceRe.lastIndex = 0
    while ((m = fenceRe.exec(text)) !== null) {
      const lang = m[1].toLowerCase()
      const body = m[2]
      if (lang === "css" || lang === "scss" || lang === "less") {
        extractFromCss(body)
      } else if (lang === "html" || lang === "xml" || lang === "") {
        // Unknown-lang fences in DESIGN.md are usually HTML snippets
        extractFromHtml(body)
      }
      // javascript / js / ts / typescript → skip entirely
    }

    // Also scan top-level <style>...</style> outside code blocks
    const styleBlockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi
    styleBlockRe.lastIndex = 0
    while ((m = styleBlockRe.exec(text)) !== null) {
      extractFromCss(m[1])
    }
  }

  // Extract from all sections (foundation, rules, etc.)
  for (const content of Object.values(sections)) {
    extractFromSection(content)
  }

  // Extract from all layouts
  for (const { content } of Object.values(layouts)) {
    extractFromSection(content)
  }

  // Extract from all components
  for (const content of Object.values(components)) {
    extractFromSection(content)
  }

  return { classes, prefixExemptions: DEFAULT_PREFIX_EXEMPTIONS }
}

async function installFromUrl(url: string, name?: string): Promise<string> {
  // Download zip to temp dir
  const tmp = join(tmpdir(), `revela-design-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })

  try {
    const zipPath = join(tmp, "design.zip")
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`)
    }
    const buffer = new Uint8Array(await response.arrayBuffer())
    writeFileSync(zipPath, buffer)

    // Extract using Bun's built-in or system unzip
    const extractDir = join(tmp, "extracted")
    mkdirSync(extractDir)

    // Use system unzip (available on macOS/Linux)
    const proc = Bun.spawnSync(["unzip", "-q", "-o", zipPath, "-d", extractDir])
    if (proc.exitCode !== 0) {
      throw new Error(`Failed to extract zip: ${proc.stderr.toString()}`)
    }

    // Find DESIGN.md in extracted contents (GitHub zips wrap in a subdirectory)
    const candidates = [extractDir]
    for (const entry of readdirSync(extractDir)) {
      const p = join(extractDir, entry)
      if (statSync(p).isDirectory()) candidates.push(p)
    }

    for (const candidate of candidates) {
      if (existsSync(join(candidate, "DESIGN.md"))) {
        return installFromPath(candidate, name)
      }
    }
    throw new Error("No DESIGN.md found inside the downloaded zip")
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
