import { existsSync, readFileSync } from "fs"
import { relative, resolve, sep } from "path"
import { hasDecksState, readDecksState, type DeckSpec } from "../decks-state"
import { resolveActiveHtmlDeckPath, normalizeWorkspacePath } from "../workspace-state/render-targets"

export type DeckHtmlContractStatus = "valid" | "invalid" | "skipped"

export type DeckHtmlContractIssueType =
  | "file_not_found"
  | "no_matching_deck_spec"
  | "missing_slide_section"
  | "slide_count_mismatch"
  | "missing_data_slide_index"
  | "invalid_data_slide_index"
  | "duplicate_data_slide_index"
  | "slide_index_mismatch"
  | "legacy_data_index_noncanonical"

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

  if (sections.length !== base.expectedIndexes.length) {
    base.issues.push({
      type: "slide_count_mismatch",
      severity: "error",
      message: `Deck HTML has ${sections.length} slide sections, but DECKS.json expects ${base.expectedIndexes.length}.`,
    })
  }

  const seen = new Set<number>()
  sections.forEach((section, offset) => {
    const expectedIndex = base.expectedIndexes[offset]
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

    if (expectedIndex !== undefined && actualIndex !== expectedIndex) {
      base.issues.push({
        type: "slide_index_mismatch",
        severity: "error",
        message: `Slide ${section.position} has data-slide-index=${actualIndex}, but DECKS.json expects ${expectedIndex}.`,
        slidePosition: section.position,
        expectedIndex,
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
  const sectionTagPattern = /<section\b([^>]*)>/gi
  let match: RegExpExecArray | null
  while ((match = sectionTagPattern.exec(html))) {
    const attrs = match[1] ?? ""
    if (!/\bclass\s*=\s*(["'])[^"']*\bslide\b[^"']*\1/i.test(attrs)) continue
    sections.push({
      position: sections.length + 1,
      dataSlideIndex: readAttr(attrs, "data-slide-index"),
      dataIndex: readAttr(attrs, "data-index"),
    })
  }
  return sections
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
