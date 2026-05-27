import { existsSync, readFileSync } from "fs"
import { relative, resolve, sep } from "path"
import { hasDecksState, readDecksState, type DeckSpec } from "../decks-state"
import { resolveActiveHtmlDeckPath, normalizeWorkspacePath } from "../workspace-state/render-targets"

export type DeckHtmlContractStatus = "valid" | "invalid" | "skipped"

export type DeckHtmlContractIssueType =
  | "file_not_found"
  | "no_matching_deck_spec"
  | "missing_slide_section"
  | "partial_deck"
  | "extra_slide"
  | "missing_data_slide_index"
  | "invalid_data_slide_index"
  | "duplicate_data_slide_index"
  | "slide_index_order"
  | "legacy_data_index_noncanonical"
  | "missing_slide_canvas"
  | "multiple_slide_canvas"
  | "slide_canvas_not_direct_child"

export interface DeckHtmlContractIssue {
  type: DeckHtmlContractIssueType
  severity: "error" | "warning"
  message: string
  slidePosition?: number
  expectedIndex?: number
  actualIndex?: number
}

export interface DeckHtmlContractReport {
  status: DeckHtmlContractStatus
  ok: boolean
  workspaceRoot: string
  filePath: string
  deckSlug?: string
  activeHtmlPath?: string
  expectedIndexes: number[]
  actualIndexes: number[]
  issues: DeckHtmlContractIssue[]
  warnings: DeckHtmlContractIssue[]
}

interface SlideSectionAttrs {
  position: number
  dataSlideIndex?: string
  dataIndex?: string
  directSlideCanvasCount: number
  descendantSlideCanvasCount: number
}

export function validateDeckHtmlContract(workspaceRoot: string, filePath: string): DeckHtmlContractReport {
  const root = resolve(workspaceRoot)
  const absoluteFile = resolve(root, filePath)
  const relativeFile = workspaceRelative(root, absoluteFile)
  const base: Omit<DeckHtmlContractReport, "status" | "ok"> = {
    workspaceRoot: root,
    filePath: relativeFile,
    expectedIndexes: [],
    actualIndexes: [],
    issues: [],
    warnings: [],
  }

  if (!hasDecksState(root)) return skipped(base, "No DECKS.json exists; deck HTML contract validation is skipped.")

  const state = readDecksState(root)
  const activeHtmlPath = resolveActiveHtmlDeckPath(state)
  const activeKey = state.activeDeck || singleDeckKey(state.decks)
  const deck = activeKey ? state.decks[activeKey] : undefined
  const normalizedActive = normalizeWorkspacePath(activeHtmlPath ?? "")
  const normalizedTarget = normalizeWorkspacePath(relativeFile)

  base.activeHtmlPath = normalizedActive || undefined
  base.deckSlug = deck?.slug

  if (!deck || !normalizedActive || normalizedActive !== normalizedTarget) {
    return skipped(base, `No matching active deck spec exists for ${relativeFile}; deck HTML contract validation is skipped.`)
  }

  if (!existsSync(absoluteFile)) {
    base.issues.push({
      type: "file_not_found",
      severity: "error",
      message: `Deck HTML file not found: ${relativeFile}`,
    })
    return finalize(base)
  }

  const html = readFileSync(absoluteFile, "utf-8")
  const sections = extractSlideSections(html)
  base.expectedIndexes = expectedSlideIndexes(deck)

  if (sections.length === 0) {
    base.issues.push({
      type: "missing_slide_section",
      severity: "error",
      message: "Deck HTML must contain one <section class=\"slide\"> element per slide spec.",
    })
    return finalize(base)
  }

  if (base.expectedIndexes.length > 0 && sections.length !== base.expectedIndexes.length) {
    const partial = sections.length < base.expectedIndexes.length
    base.warnings.push({
      type: partial ? "partial_deck" : "extra_slide",
      severity: "warning",
      message: partial
        ? `Deck HTML currently has ${sections.length} slide sections while the cached DECKS.json projection has ${base.expectedIndexes.length}. This is allowed during chapter-by-chapter authoring.`
        : `Deck HTML has ${sections.length} slide sections while the cached DECKS.json projection has ${base.expectedIndexes.length}. Treat the cached slide projection as compatibility context, not the artifact source of truth.`,
    })
  }

  const seen = new Set<number>()
  let previousIndex = 0
  sections.forEach((section, offset) => {
    const expectedIndex = base.expectedIndexes[offset]
    if (section.directSlideCanvasCount === 0) {
      base.issues.push({
        type: section.descendantSlideCanvasCount > 0 ? "slide_canvas_not_direct_child" : "missing_slide_canvas",
        severity: "error",
        message: section.descendantSlideCanvasCount > 0
          ? `Slide ${section.position} has .slide-canvas, but it must be a direct child of the .slide section.`
          : `Slide ${section.position} is missing a direct .slide-canvas child.`,
        slidePosition: section.position,
        expectedIndex,
      })
    } else if (section.directSlideCanvasCount > 1) {
      base.issues.push({
        type: "multiple_slide_canvas",
        severity: "error",
        message: `Slide ${section.position} has ${section.directSlideCanvasCount} direct .slide-canvas children; expected exactly one.`,
        slidePosition: section.position,
        expectedIndex,
      })
    }

    if (section.dataIndex !== undefined) {
      base.warnings.push({
        type: "legacy_data_index_noncanonical",
        severity: "warning",
        message: `Slide ${section.position} has legacy data-index; use data-slide-index as the canonical slide identity.`,
        slidePosition: section.position,
      })
    }

    if (section.dataSlideIndex === undefined) {
      base.issues.push({
        type: "missing_data_slide_index",
        severity: "error",
        message: `Slide ${section.position} is missing data-slide-index.`,
        slidePosition: section.position,
        expectedIndex,
      })
      return
    }

    const actualIndex = Number(section.dataSlideIndex)
    if (!Number.isInteger(actualIndex) || actualIndex < 1 || String(actualIndex) !== section.dataSlideIndex.trim()) {
      base.issues.push({
        type: "invalid_data_slide_index",
        severity: "error",
        message: `Slide ${section.position} has invalid data-slide-index=${JSON.stringify(section.dataSlideIndex)}; expected a positive 1-based integer.`,
        slidePosition: section.position,
        expectedIndex,
      })
      return
    }

    base.actualIndexes.push(actualIndex)
    if (seen.has(actualIndex)) {
      base.issues.push({
        type: "duplicate_data_slide_index",
        severity: "error",
        message: `Slide ${section.position} repeats data-slide-index=${actualIndex}.`,
        slidePosition: section.position,
        actualIndex,
      })
    }
    seen.add(actualIndex)

    if (actualIndex <= previousIndex) {
      base.issues.push({
        type: "slide_index_order",
        severity: "error",
        message: `Slide ${section.position} has data-slide-index=${actualIndex}, but slide indexes must increase in DOM order.`,
        slidePosition: section.position,
        expectedIndex,
        actualIndex,
      })
    }
    previousIndex = actualIndex

    if (base.expectedIndexes.length > 0 && !base.expectedIndexes.includes(actualIndex)) {
      base.warnings.push({
        type: "extra_slide",
        severity: "warning",
        message: `Slide ${section.position} has data-slide-index=${actualIndex}, which is not present in the cached DECKS.json slide projection.`,
        slidePosition: section.position,
        actualIndex,
      })
    }
  })

  return finalize(base)
}

export function assertDeckHtmlContractValid(workspaceRoot: string, filePath: string): void {
  const report = validateDeckHtmlContract(workspaceRoot, filePath)
  if (report.status !== "invalid") return
  throw new Error(
    "Deck HTML contract validation failed. Fix slide identity before inspection or export.\n\n" +
    formatDeckHtmlContractReport(report)
  )
}

export function formatDeckHtmlContractReport(report: DeckHtmlContractReport): string {
  const lines = [
    `Status: ${report.status}`,
    `File: ${report.filePath}`,
  ]
  if (report.deckSlug) lines.push(`Deck: ${report.deckSlug}`)
  if (report.activeHtmlPath) lines.push(`Active HTML target: ${report.activeHtmlPath}`)
  if (report.expectedIndexes.length > 0) lines.push(`Expected slide indexes: ${report.expectedIndexes.join(", ")}`)
  if (report.actualIndexes.length > 0) lines.push(`Actual slide indexes: ${report.actualIndexes.join(", ")}`)

  if (report.issues.length > 0) {
    lines.push("", "Errors:")
    for (const issue of report.issues) lines.push(`- ${issue.message}`)
  }
  if (report.warnings.length > 0) {
    lines.push("", "Warnings:")
    for (const warning of report.warnings) lines.push(`- ${warning.message}`)
  }
  if (report.status === "skipped" && report.warnings.length > 0) {
    lines.push("", "Note: skipped reports do not block standalone HTML files.")
  }

  return lines.join("\n")
}

function extractSlideSections(html: string): SlideSectionAttrs[] {
  const sections: SlideSectionAttrs[] = []
  const sectionPattern = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi
  let match: RegExpExecArray | null
  while ((match = sectionPattern.exec(html))) {
    const attrs = match[1] ?? ""
    if (!/\bclass\s*=\s*(["'])[^"']*\bslide\b[^"']*\1/i.test(attrs)) continue
    const body = match[2] ?? ""
    const directSlideCanvasCount = countDirectSlideCanvasChildren(body)
    const descendantSlideCanvasCount = countSlideCanvasDescendants(body)
    sections.push({
      position: sections.length + 1,
      dataSlideIndex: readAttr(attrs, "data-slide-index"),
      dataIndex: readAttr(attrs, "data-index"),
      directSlideCanvasCount,
      descendantSlideCanvasCount,
    })
  }
  return sections
}

function countSlideCanvasDescendants(html: string): number {
  const pattern = /<([a-z][\w:-]*)\b([^>]*)>/gi
  let count = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    const attrs = match[2] ?? ""
    if (hasClass(attrs, "slide-canvas")) count++
  }
  return count
}

function countDirectSlideCanvasChildren(html: string): number {
  let depth = 0
  let count = 0
  const pattern = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)\b([^>]*)>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    const token = match[0]
    if (token.startsWith("<!--")) continue
    const tag = match[1]?.toLowerCase()
    if (!tag) continue
    if (token.startsWith("</")) {
      depth = Math.max(0, depth - 1)
      continue
    }
    const attrs = match[2] ?? ""
    if (depth === 0 && hasClass(attrs, "slide-canvas")) count++
    if (!isVoidTag(tag) && !/\/\s*>$/.test(token)) depth++
  }
  return count
}

function hasClass(attrs: string, className: string): boolean {
  const classAttr = readAttr(attrs, "class")
  return classAttr?.split(/\s+/).includes(className) ?? false
}

function readAttr(attrs: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "i")
  return pattern.exec(attrs)?.[2]
}

function expectedSlideIndexes(deck: DeckSpec): number[] {
  return deck.slides.map((slide) => slide.index)
}

function finalize(base: Omit<DeckHtmlContractReport, "status" | "ok">): DeckHtmlContractReport {
  const status: DeckHtmlContractStatus = base.issues.length > 0 ? "invalid" : "valid"
  return { ...base, status, ok: status === "valid" }
}

function skipped(base: Omit<DeckHtmlContractReport, "status" | "ok">, message: string): DeckHtmlContractReport {
  return {
    ...base,
    status: "skipped",
    ok: true,
    warnings: [{ type: "no_matching_deck_spec", severity: "warning", message }],
  }
}

function singleDeckKey(decks: Record<string, DeckSpec>): string | undefined {
  const keys = Object.keys(decks)
  return keys.length === 1 ? keys[0] : undefined
}

function workspaceRelative(root: string, target: string): string {
  return relative(root, target).split(sep).join("/")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isVoidTag(tag: string): boolean {
  return new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]).has(tag)
}
