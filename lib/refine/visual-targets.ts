import { readFileSync, statSync, writeFileSync } from "fs"

export type VisualEditKind = "image" | "text-width" | "box"

export interface VisualEditTarget {
  editId: string
  kind: VisualEditKind
  tagName: "img" | "h1" | "h2" | "h3" | "h4" | "p" | "div" | "figure"
  startOffset: number
  openEndOffset: number
  originalOpenTag: string
  originalStyle: string
}

export interface VisualTargetResizeChange {
  type: "resize"
  editId: string
  kind?: VisualEditKind
  after: {
    stylePatch?: Record<string, unknown>
    width?: number
    height?: number
  }
}

export interface VisualTargetMoveChange {
  type: "move"
  editId: string
  kind?: VisualEditKind
  after: {
    stylePatch?: Record<string, unknown>
    dx?: number
    dy?: number
  }
}

export type VisualTargetChange = VisualTargetResizeChange | VisualTargetMoveChange

export interface ApplyVisualTargetChangesInput {
  file: string
  deckVersion?: string
  targetDeckVersion?: string
  targets: Map<string, VisualEditTarget>
  changes: VisualTargetChange[]
}

export interface ApplyVisualTargetChangesResult {
  ok: true
  deckVersion: string
  changeCount: number
}

const TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "p"])
const BOX_TAGS = new Set(["div", "figure"])
const EDIT_TAGS = new Set(["img", ...TEXT_TAGS, ...BOX_TAGS])
const MAX_DIMENSION_PX = 3840
const MIN_IMAGE_DIMENSION_PX = 24
const MIN_TEXT_WIDTH_PX = 80
const MIN_BOX_WIDTH_PX = 40
const MIN_BOX_HEIGHT_PX = 24

export function annotateVisualEditTargets(html: string): { html: string; targets: Map<string, VisualEditTarget> } {
  const targets = new Map<string, VisualEditTarget>()
  const insertions: Array<{ offset: number; text: string }> = []
  let nextId = 1

  for (const tag of scanOpeningTags(html)) {
    if (!EDIT_TAGS.has(tag.tagName)) continue
    if (BOX_TAGS.has(tag.tagName) && !isSafeBoxTarget(tag.openTag)) continue
    const editId = `rve-${nextId++}`
    const kind: VisualEditKind = tag.tagName === "img" ? "image" : BOX_TAGS.has(tag.tagName) ? "box" : "text-width"
    targets.set(editId, {
      editId,
      kind,
      tagName: tag.tagName as VisualEditTarget["tagName"],
      startOffset: tag.startOffset,
      openEndOffset: tag.openEndOffset,
      originalOpenTag: tag.openTag,
      originalStyle: attrValue(tag.openTag, "style") || "",
    })
    insertions.push({ offset: tag.openEndOffset - (tag.openTag.endsWith("/>") ? 2 : 1), text: ` data-revela-edit-id="${editId}" data-revela-edit-kind="${kind}"` })
  }

  let annotated = html
  for (const insertion of insertions.reverse()) {
    annotated = annotated.slice(0, insertion.offset) + insertion.text + annotated.slice(insertion.offset)
  }
  return { html: annotated, targets }
}

export function applyVisualTargetChanges(input: ApplyVisualTargetChangesInput): ApplyVisualTargetChangesResult {
  const currentVersion = readDeckVersion(input.file).version
  if (input.deckVersion && input.deckVersion !== currentVersion) throw new Error("Deck changed outside Review. Refresh Review before saving visual edits.")
  if (input.targetDeckVersion && input.targetDeckVersion !== currentVersion) throw new Error("Review visual targets are stale. Refresh Review before saving visual edits.")
  if (!input.changes.length) throw new Error("No visual changes to save.")

  let html = readFileSync(input.file, "utf-8")
  const resolved = new Map<string, { target: VisualEditTarget; patch: Record<string, string> }>()
  for (const change of input.changes) {
    const target = input.targets.get(change.editId)
    if (!target) throw new Error("Target is no longer editable. Refresh Review and try again.")
    if (change.kind && change.kind !== target.kind) throw new Error("Visual edit target kind changed. Refresh Review and try again.")
    const currentOpenTag = html.slice(target.startOffset, target.openEndOffset)
    if (currentOpenTag !== target.originalOpenTag) throw new Error("Target is no longer editable. Refresh Review and try again.")
    const patch = normalizeStylePatch(target, change)
    if (!Object.keys(patch).length) throw new Error("Visual change does not contain valid style updates.")
    const existing = resolved.get(target.editId)
    resolved.set(target.editId, { target, patch: { ...(existing?.patch ?? {}), ...patch } })
  }

  for (const { target, patch } of Array.from(resolved.values()).sort((a, b) => b.target.startOffset - a.target.startOffset)) {
    const updatedOpenTag = patchOpenTagStyle(target.originalOpenTag, patch)
    html = html.slice(0, target.startOffset) + updatedOpenTag + html.slice(target.openEndOffset)
  }

  writeFileSync(input.file, html, "utf-8")
  return { ok: true, deckVersion: readDeckVersion(input.file).version, changeCount: input.changes.length }
}

export function readDeckVersion(file: string): { mtimeMs: number; size: number; version: string } {
  const stat = statSync(file)
  return { mtimeMs: stat.mtimeMs, size: stat.size, version: `${stat.mtimeMs}:${stat.size}` }
}

function normalizeStylePatch(target: VisualEditTarget, change: VisualTargetChange): Record<string, string> {
  const input = change.after.stylePatch ?? {}
  if (change.type === "move") return normalizeMovePatch(target, input)
  if (change.type !== "resize") throw new Error(`Unsupported visual change type: ${(change as any).type}`)
  return normalizeResizePatch(target.kind, input)
}

function normalizeResizePatch(kind: VisualEditKind, input: Record<string, unknown>): Record<string, string> {
  const patch: Record<string, string> = {}
  const width = typeof input.width === "string" ? normalizePxValue(input.width, kind === "image" ? MIN_IMAGE_DIMENSION_PX : kind === "box" ? MIN_BOX_WIDTH_PX : MIN_TEXT_WIDTH_PX) : null
  if (width) patch.width = width
  if (kind === "image" || kind === "box") {
    const height = typeof input.height === "string" ? normalizePxValue(input.height, kind === "image" ? MIN_IMAGE_DIMENSION_PX : MIN_BOX_HEIGHT_PX) : null
    if (height) patch.height = height
  } else {
    const maxWidth = typeof input["max-width"] === "string" ? normalizePxValue(input["max-width"], MIN_TEXT_WIDTH_PX) : null
    if (maxWidth) patch["max-width"] = maxWidth
  }
  return patch
}

function normalizeMovePatch(target: VisualEditTarget, input: Record<string, unknown>): Record<string, string> {
  const translate = typeof input.translate === "string" ? normalizeTranslateValue(input.translate) : null
  if (translate) return { translate }
  const transform = typeof input.transform === "string" ? normalizeLegacyTransformValue(input.transform) : null
  return transform ? { translate: transform } : {}
}

function normalizeTranslateValue(value: string): string | null {
  const direct = parseTranslateProperty(value)
  if (direct) return normalizeTranslatePoint(direct)
  return normalizeLegacyTransformValue(value)
}

function normalizeLegacyTransformValue(value: string): string | null {
  const parsed = parseSimpleTranslate(value)
  if (!parsed) return null
  return normalizeTranslatePoint(parsed)
}

function normalizeTranslatePoint(parsed: { x: number; y: number }): string | null {
  const { x, y } = parsed
  if (Math.abs(x) > MAX_DIMENSION_PX || Math.abs(y) > MAX_DIMENSION_PX) return null
  return `${Math.round(x)}px ${Math.round(y)}px`
}

function parseTranslateProperty(value: string): { x: number; y: number } | null {
  const normalized = value.trim()
  const match = /^(-?\d+(?:\.\d+)?)px(?:\s+|\s*,\s*)(-?\d+(?:\.\d+)?)px$/.exec(normalized)
  return match ? finitePoint(Number(match[1]), Number(match[2])) : null
}

function parseSimpleTranslate(value: string): { x: number; y: number } | null {
  const normalized = value.trim()
  if (!normalized || normalized === "none") return { x: 0, y: 0 }
  const translate = /^translate\(\s*(-?\d+(?:\.\d+)?)px(?:\s*,\s*|\s+)(-?\d+(?:\.\d+)?)px\s*\)$/.exec(normalized)
  if (translate) return finitePoint(Number(translate[1]), Number(translate[2]))
  const matrix = /^matrix\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/.exec(normalized)
  if (!matrix) return null
  const a = Number(matrix[1])
  const b = Number(matrix[2])
  const c = Number(matrix[3])
  const d = Number(matrix[4])
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1) return null
  return finitePoint(Number(matrix[5]), Number(matrix[6]))
}

function finitePoint(x: number, y: number): { x: number; y: number } | null {
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function normalizePxValue(value: string, min: number): string | null {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
  if (!match) return null
  const number = Number(match[1])
  if (!Number.isFinite(number) || number < min || number > MAX_DIMENSION_PX) return null
  return `${Math.round(number)}px`
}

function patchOpenTagStyle(openTag: string, patch: Record<string, string>): string {
  const styleMatch = /\sstyle=("([^"]*)"|'([^']*)')/i.exec(openTag)
  const current = styleMatch ? parseStyle(styleMatch[2] ?? styleMatch[3] ?? "") : {}
  const next = serializeStyle({ ...current, ...patch })
  if (styleMatch) return openTag.slice(0, styleMatch.index) + ` style="${escapeAttr(next)}"` + openTag.slice(styleMatch.index + styleMatch[0].length)
  return openTag.replace(/\s*\/?>$/, (ending) => ` style="${escapeAttr(next)}"${ending}`)
}

function parseStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of style.split(";")) {
    const index = part.indexOf(":")
    if (index < 0) continue
    const key = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).trim()
    if (key && value) result[key] = value
  }
  return result
}

function serializeStyle(style: Record<string, string>): string {
  return Object.entries(style).map(([key, value]) => `${key}: ${value}`).join("; ")
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

interface OpenTagRegion {
  tagName: string
  startOffset: number
  openEndOffset: number
  openTag: string
}

function scanOpeningTags(html: string): OpenTagRegion[] {
  const tags: OpenTagRegion[] = []
  let index = 0
  while (index < html.length) {
    const open = html.indexOf("<", index)
    if (open < 0) break
    if (html.startsWith("<!--", open)) {
      const close = html.indexOf("-->", open + 4)
      index = close < 0 ? html.length : close + 3
      continue
    }
    const close = html.indexOf(">", open + 1)
    if (close < 0) break
    const raw = html.slice(open, close + 1)
    const tagName = normalizeName(/^<\s*([a-zA-Z0-9-]+)/.exec(raw)?.[1] || "")
    if (!tagName || /^<\s*[!/]/.test(raw) || /^<\s*\//.test(raw)) {
      index = close + 1
      continue
    }
    tags.push({ tagName, startOffset: open, openEndOffset: close + 1, openTag: raw })
    if (tagName === "script" || tagName === "style") {
      const closeTag = new RegExp(`</\\s*${tagName}\\s*>`, "ig")
      closeTag.lastIndex = close + 1
      const match = closeTag.exec(html)
      index = match ? match.index + match[0].length : close + 1
    } else {
      index = close + 1
    }
  }
  return tags
}

function attrValue(openTag: string, name: string): string | undefined {
  const escaped = escapeRegExp(name)
  const match = new RegExp(`\\s${escaped}=("([^"]*)"|'([^']*)')`, "i").exec(openTag)
  return match ? match[2] ?? match[3] : undefined
}

function isSafeBoxTarget(openTag: string): boolean {
  const tagName = normalizeName(/^<\s*([a-zA-Z0-9-]+)/.exec(openTag)?.[1] || "")
  const className = attrValue(openTag, "class") || ""
  const classes = className.split(/\s+/).map((item) => item.trim().toLowerCase()).filter(Boolean)
  if (tagName === "div" && classes.length === 0) return false
  if (/\s(?:data-chart|data-echarts|_echarts_instance_)\b/i.test(openTag)) return false
  if (classes.some((name) => name === "slide" || name === "slide-canvas" || name === "deck" || name === "page")) return false
  if (classes.some((name) => name.startsWith("revela-") || name.startsWith("echarts-") || name === "echart-container" || name === "echart-panel")) return false
  if (classes.some((name) => /(^|-)echart($|-)/.test(name) || name === "chart-container" || name === "chart-panel")) return false
  return true
}

function normalizeName(value: string | undefined): string {
  return (value || "").trim().toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
