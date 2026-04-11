/**
 * lib/qa/checks.ts
 *
 * Pure geometry-based layout checks — no class-name dependency.
 *
 * All checks operate on SlideMetrics produced by measure.ts.
 * The checks are designed to be design-system-agnostic: they detect
 * structural layout problems regardless of CSS class names or component types.
 */

import type { SlideMetrics, ElementInfo, Rect } from "./measure"
import { CANVAS_W, CANVAS_H } from "./measure"

// ── Types ────────────────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "warning" | "info"

export interface LayoutIssue {
  type:
    | "underfill"        // canvas not filled enough
    | "bottom_whitespace" // large gap at bottom of slide
    | "asymmetry"        // side-by-side elements with large height difference
    | "density_imbalance" // side-by-side columns with very different content density
    | "overflow"         // element exceeds canvas bounds
    | "sparse"           // very few visible elements
    | "card_height_variance" // cards in same row have very different heights
  severity: IssueSeverity
  /** Human-readable description for the LLM to act on */
  detail: string
  /** Measured values for traceability */
  data?: Record<string, number | string>
}

export interface SlideReport {
  index: number
  title: string
  issues: LayoutIssue[]
}

export interface QAReport {
  file: string
  slides: SlideReport[]
  totalIssues: number
  errorCount: number
  warningCount: number
  summary: string
}

// ── Slide type registry — single source of truth ─────────────────────────────

/**
 * All valid values for the `data-slide-type` attribute on `<section class="slide">`.
 *
 * This is the single source of truth consumed by:
 *   - QA checks (EXEMPT_TYPES below)
 *   - prompt-builder.ts (injected into SKILL.md via <!-- @slide-types --> placeholder)
 */
export const SLIDE_TYPES = [
  "cover",
  "toc",
  "content",
  "summary",
  "closing",
  "divider",
  "thank-you",
] as const

export type SlideType = (typeof SLIDE_TYPES)[number]

// ── Thresholds (tunable) ─────────────────────────────────────────────────────

/**
 * Slide types that are intentionally sparse, centred, or structurally
 * different from "content" slides. Fill ratio and bottom-whitespace checks
 * are skipped for these types.
 *
 * The AI populates `data-slide-type` on each `<section class="slide">`.
 * When the attribute is absent (old HTML), we fall back to geometry.
 */
export const EXEMPT_TYPES: ReadonlySet<string> = new Set<SlideType>([
  "cover",
  "toc",
  "closing",
  "divider",
  "summary",
  "thank-you",
])

const T = {
  /** Canvas fill ratio below this → underfill warning */
  FILL_WARN: 0.55,
  /** Canvas fill ratio below this → underfill error */
  FILL_ERROR: 0.40,
  /** Bottom whitespace (px inside 1080-height canvas) above this → warning */
  BOTTOM_WS_WARN: 200,
  /** Bottom whitespace above this → error */
  BOTTOM_WS_ERROR: 350,
  /** Height asymmetry ratio (shorter/taller) below this → warning */
  ASYM_WARN: 0.70,
  /** Height asymmetry ratio below this → error */
  ASYM_ERROR: 0.50,
  /** Content density ratio (fewer/more leaf elements) for side-by-side columns → warning */
  DENSITY_WARN: 0.55,
  /** Content density ratio below this → error */
  DENSITY_ERROR: 0.35,
  /** Min horizontal overlap fraction to consider two elements "in the same row" */
  ROW_OVERLAP: 0.3,
  /** Min width of an element to be considered a "column" (not just an icon) */
  COL_MIN_WIDTH: 200,
  /** Visible top-level element count below this → sparse */
  SPARSE_THRESHOLD: 2,
  /** Card height ratio (min/max in same row) below this → variance warning */
  CARD_VAR_WARN: 0.65,
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Vertical overlap between two rects [0..1] relative to the shorter one. */
function verticalOverlap(a: Rect, b: Rect): number {
  const overlapTop = Math.max(a.top, b.top)
  const overlapBot = Math.min(a.bottom, b.bottom)
  const overlap = Math.max(0, overlapBot - overlapTop)
  const shorter = Math.min(a.height, b.height)
  return shorter > 0 ? overlap / shorter : 0
}

/** Horizontal overlap [0..1] relative to the shorter width. */
function horizontalOverlap(a: Rect, b: Rect): number {
  const ol = Math.max(a.left, b.left)
  const or = Math.min(a.right, b.right)
  const overlap = Math.max(0, or - ol)
  const shorter = Math.min(a.width, b.width)
  return shorter > 0 ? overlap / shorter : 0
}

/**
 * Group a list of elements into "rows": elements whose vertical centres are
 * close enough that they appear side-by-side.
 *
 * Returns an array of rows; each row is an array of ElementInfo sorted left→right.
 */
function groupIntoRows(elements: ElementInfo[]): ElementInfo[][] {
  // Only consider elements wide enough to be layout columns
  const candidates = elements.filter(
    (e) => e.visible && e.rect.width >= T.COL_MIN_WIDTH
  )
  if (candidates.length === 0) return []

  const rows: ElementInfo[][] = []
  const assigned = new Set<number>()

  for (let i = 0; i < candidates.length; i++) {
    if (assigned.has(i)) continue
    const row: ElementInfo[] = [candidates[i]]
    assigned.add(i)

    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned.has(j)) continue
      // Two elements are in the same row if they have significant vertical overlap
      if (verticalOverlap(candidates[i].rect, candidates[j].rect) >= T.ROW_OVERLAP) {
        row.push(candidates[j])
        assigned.add(j)
      }
    }

    if (row.length > 1) {
      rows.push(row.sort((a, b) => a.rect.left - b.rect.left))
    }
  }

  return rows
}

// ── Individual checks ────────────────────────────────────────────────────────

/** Check 1: Canvas fill ratio (content area / total canvas area) */
function checkFill(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const { contentRect, canvasRect, elements } = metrics

  if (contentRect.width === 0 || contentRect.height === 0) {
    issues.push({
      type: "sparse",
      severity: "error",
      detail: "Slide appears to have no visible content.",
    })
    return issues
  }

  // If the slide has an explicit type, use it — no geometry guessing needed
  if (metrics.slideType && EXEMPT_TYPES.has(metrics.slideType)) return []

  // Fallback for HTML without data-slide-type: detect cover/title slides by
  // geometry (single dominant column aligned to the centre of the canvas).
  const isCoverLike = (() => {
    const contentCenterX = (contentRect.left + contentRect.right) / 2
    const canvasCenterX = canvasRect.width / 2
    const centerOffset = Math.abs(contentCenterX - canvasCenterX) / canvasRect.width
    const maxElemWidth = Math.max(...elements.map((e) => e.rect.width))
    const isCentered = centerOffset < 0.15 && maxElemWidth < canvasRect.width * 0.65
    return isCentered
  })()

  if (isCoverLike) return [] // Skip fill check for cover/title slides (geometry fallback)

  // Compute content area relative to canvas dimensions
  const canvasArea = CANVAS_W * CANVAS_H
  const contentArea = contentRect.width * contentRect.height
  const fillRatio = contentArea / canvasArea

  if (fillRatio < T.FILL_ERROR) {
    issues.push({
      type: "underfill",
      severity: "error",
      detail: `Canvas fill ratio is very low (${Math.round(fillRatio * 100)}%). Content only occupies ${Math.round(contentRect.width)}×${Math.round(contentRect.height)}px of the 1920×1080 canvas.`,
      data: { fillRatio: Math.round(fillRatio * 100) },
    })
  } else if (fillRatio < T.FILL_WARN) {
    issues.push({
      type: "underfill",
      severity: "warning",
      detail: `Canvas fill ratio is low (${Math.round(fillRatio * 100)}%). Content area: ${Math.round(contentRect.width)}×${Math.round(contentRect.height)}px. Consider expanding content or reducing whitespace.`,
      data: { fillRatio: Math.round(fillRatio * 100) },
    })
  }

  return issues
}

/** Check 2: Bottom whitespace — gap between last content element and canvas bottom */
function checkBottomWhitespace(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const { contentRect, canvasRect, elements } = metrics

  if (contentRect.height === 0) return issues

  // If the slide has an explicit type, use it — no geometry guessing needed
  if (metrics.slideType && EXEMPT_TYPES.has(metrics.slideType)) return []

  // Fallback geometry: skip cover/title slides (intentionally centred with bottom space)
  const isCoverLike = (() => {
    const contentCenterX = (contentRect.left + contentRect.right) / 2
    const canvasCenterX = canvasRect.width / 2
    const centerOffset = Math.abs(contentCenterX - canvasCenterX) / canvasRect.width
    const maxElemWidth = Math.max(...elements.map((e) => e.rect.width))
    return centerOffset < 0.15 && maxElemWidth < canvasRect.width * 0.65
  })()

  if (isCoverLike) return []

  // contentRect is in canvas-relative coords; canvasRect.bottom is the canvas height
  const gap = canvasRect.bottom - contentRect.bottom

  if (gap > T.BOTTOM_WS_ERROR) {
    issues.push({
      type: "bottom_whitespace",
      severity: "error",
      detail: `${Math.round(gap)}px of empty space at the bottom of the slide (canvas bottom: ${Math.round(canvasRect.bottom)}px, last content: ${Math.round(contentRect.bottom)}px). The slide looks notably under-filled.`,
      data: { gapPx: Math.round(gap) },
    })
  } else if (gap > T.BOTTOM_WS_WARN) {
    issues.push({
      type: "bottom_whitespace",
      severity: "warning",
      detail: `${Math.round(gap)}px empty gap at the bottom of the slide. Consider adding content, increasing padding, or using flex-grow to distribute space.`,
      data: { gapPx: Math.round(gap) },
    })
  }

  return issues
}

/** Check 3: Overflow — elements extending beyond the canvas boundaries */
function checkOverflow(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const { canvasRect } = metrics

  function walkElements(els: ElementInfo[]) {
    for (const el of els) {
      if (!el.visible) continue
      const r = el.rect
      // Allow a small tolerance (2px) for sub-pixel rendering
      const tol = 2
      if (
        r.left < canvasRect.left - tol ||
        r.top < canvasRect.top - tol ||
        r.right > canvasRect.right + tol ||
        r.bottom > canvasRect.bottom + tol
      ) {
        issues.push({
          type: "overflow",
          severity: "error",
          detail: `Element \`${el.selector}\` overflows the canvas: rect(${Math.round(r.left)}, ${Math.round(r.top)}, ${Math.round(r.right)}, ${Math.round(r.bottom)}) vs canvas(${Math.round(canvasRect.left)}, ${Math.round(canvasRect.top)}, ${Math.round(canvasRect.right)}, ${Math.round(canvasRect.bottom)})`,
        })
      }
      if (el.children.length > 0) walkElements(el.children)
    }
  }

  walkElements(metrics.elements)
  return issues
}

/** Check 4: Asymmetry — side-by-side elements with large height difference */
function checkAsymmetry(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []

  // Check at the top level of .slide-canvas children
  const rows = groupIntoRows(metrics.elements)

  for (const row of rows) {
    if (row.length < 2) continue

    const heights = row.map((e) => e.rect.height)
    const minH = Math.min(...heights)
    const maxH = Math.max(...heights)

    if (maxH === 0) continue
    const ratio = minH / maxH

    if (ratio < T.ASYM_ERROR) {
      issues.push({
        type: "asymmetry",
        severity: "error",
        detail: `Side-by-side columns have a severe height mismatch: [${heights.map((h) => Math.round(h) + "px").join(" vs ")}] (ratio ${Math.round(ratio * 100)}%). The shorter column appears nearly empty next to the taller one.`,
        data: { ratio: Math.round(ratio * 100), minH: Math.round(minH), maxH: Math.round(maxH) },
      })
    } else if (ratio < T.ASYM_WARN) {
      issues.push({
        type: "asymmetry",
        severity: "warning",
        detail: `Side-by-side columns have unequal heights: [${heights.map((h) => Math.round(h) + "px").join(" vs ")}] (ratio ${Math.round(ratio * 100)}%). Consider equalising content density or using align-items: stretch with matching visual weight.`,
        data: { ratio: Math.round(ratio * 100), minH: Math.round(minH), maxH: Math.round(maxH) },
      })
    }

    // Also recursively check inside each column for nested rows
    for (const col of row) {
      if (col.children.length >= 2) {
        const nestedRows = groupIntoRows(col.children)
        for (const nestedRow of nestedRows) {
          if (nestedRow.length < 2) continue
          const nh = nestedRow.map((e) => e.rect.height)
          const nMin = Math.min(...nh)
          const nMax = Math.max(...nh)
          if (nMax === 0) continue
          const nRatio = nMin / nMax
          if (nRatio < T.CARD_VAR_WARN) {
            issues.push({
              type: "card_height_variance",
              severity: "warning",
              detail: `Nested row inside \`${col.selector}\` has card height variance: [${nh.map((h) => Math.round(h) + "px").join(", ")}] (min/max ratio ${Math.round(nRatio * 100)}%). Cards in the same row should be visually balanced.`,
              data: { ratio: Math.round(nRatio * 100) },
            })
          }
        }
      }
    }
  }

  return issues
}

/** Check 5: Sparse slide — very few top-level elements */
function checkSparse(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []

  // Exempt structural slides — they are intentionally minimal
  if (metrics.slideType && EXEMPT_TYPES.has(metrics.slideType)) return []

  const visibleCount = metrics.elements.filter((e) => e.visible).length

  if (visibleCount < T.SPARSE_THRESHOLD) {
    issues.push({
      type: "sparse",
      severity: "warning",
      detail: `Slide has only ${visibleCount} visible top-level element(s). This may result in a lot of empty space.`,
      data: { visibleCount },
    })
  }

  return issues
}

/**
 * Count all leaf (no-child) descendants of an ElementInfo tree.
 */
function countLeaves(el: ElementInfo): number {
  if (el.children.length === 0) return 1
  return el.children.reduce((sum, ch) => sum + countLeaves(ch), 0)
}

/**
 * Compute the actual content height of an element: from its topmost child's top
 * to its bottommost child's bottom (ignoring CSS stretch padding).
 */
function contentHeight(el: ElementInfo): number {
  if (el.children.length === 0) return el.rect.height
  let top = Infinity, bottom = -Infinity
  function walk(list: ElementInfo[]) {
    for (const ch of list) {
      if (!ch.visible) continue
      top = Math.min(top, ch.rect.top)
      bottom = Math.max(bottom, ch.rect.bottom)
      if (ch.children.length > 0) walk(ch.children)
    }
  }
  walk(el.children)
  return top === Infinity ? el.rect.height : bottom - top
}

/**
 * Check 6: Content density imbalance in side-by-side columns.
 *
 * CSS `align-items: stretch` makes all columns the same height visually, so
 * a pure height asymmetry check won't catch imbalanced content density.
 * This check counts leaf elements and actual content height in each column.
 */
function checkDensityImbalance(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []

  // Find rows at the top level
  const rows = groupIntoRows(metrics.elements)

  for (const row of rows) {
    if (row.length < 2) continue

    const leafCounts = row.map(countLeaves)
    const contentHeights = row.map(contentHeight)

    // Check leaf count ratio
    const minLeaves = Math.min(...leafCounts)
    const maxLeaves = Math.max(...leafCounts)
    if (maxLeaves > 0) {
      const ratio = minLeaves / maxLeaves
      if (ratio < T.DENSITY_ERROR) {
        issues.push({
          type: "density_imbalance",
          severity: "error",
          detail: `Side-by-side columns have very unequal content density: [${leafCounts.join(" vs ")}] elements. The sparse column may feel nearly empty. Add more content to the lighter column or reduce content in the heavier one.`,
          data: { ratio: Math.round(ratio * 100), leafCounts: leafCounts.join(",") },
        })
      } else if (ratio < T.DENSITY_WARN) {
        issues.push({
          type: "density_imbalance",
          severity: "warning",
          detail: `Side-by-side columns have unequal content density: [${leafCounts.join(" vs ")}] elements. Consider balancing content between columns.`,
          data: { ratio: Math.round(ratio * 100), leafCounts: leafCounts.join(",") },
        })
      }
    }

    // Check actual content height ratio (ignoring CSS stretch)
    const minCH = Math.min(...contentHeights)
    const maxCH = Math.max(...contentHeights)
    if (maxCH > 50) { // only check if columns have meaningful content
      const chRatio = minCH / maxCH
      if (chRatio < T.ASYM_ERROR) {
        issues.push({
          type: "density_imbalance",
          severity: "error",
          detail: `Side-by-side columns have very different actual content heights: [${contentHeights.map((h) => Math.round(h) + "px").join(" vs ")}] (CSS stretch hides this — ratio ${Math.round(chRatio * 100)}%). The column with less content will have large internal whitespace.`,
          data: { ratio: Math.round(chRatio * 100), contentHeights: contentHeights.map(Math.round).join(",") },
        })
      } else if (chRatio < T.ASYM_WARN) {
        issues.push({
          type: "density_imbalance",
          severity: "warning",
          detail: `Side-by-side columns have different actual content heights: [${contentHeights.map((h) => Math.round(h) + "px").join(" vs ")}] (ratio ${Math.round(chRatio * 100)}%). Consider equalising content density.`,
          data: { ratio: Math.round(chRatio * 100), contentHeights: contentHeights.map(Math.round).join(",") },
        })
      }
    }
  }

  // Also check one level deep (containers that hold two-column layouts)
  for (const el of metrics.elements) {
    if (el.children.length >= 2) {
      const nestedRows = groupIntoRows(el.children)
      for (const nestedRow of nestedRows) {
        if (nestedRow.length < 2) continue
        const nLeaves = nestedRow.map(countLeaves)
        const nCH = nestedRow.map(contentHeight)
        const minNL = Math.min(...nLeaves)
        const maxNL = Math.max(...nLeaves)
        const minNCH = Math.min(...nCH)
        const maxNCH = Math.max(...nCH)

        if (maxNL > 0 && minNL / maxNL < T.DENSITY_WARN) {
          const ratio = minNL / maxNL
          issues.push({
            type: "density_imbalance",
            severity: ratio < T.DENSITY_ERROR ? "error" : "warning",
            detail: `Nested side-by-side columns inside \`${el.selector}\` have unequal content: [${nLeaves.join(" vs ")}] elements (ratio ${Math.round(ratio * 100)}%).`,
            data: { ratio: Math.round(ratio * 100) },
          })
        }
        if (maxNCH > 50 && minNCH / maxNCH < T.ASYM_WARN) {
          const chRatio = minNCH / maxNCH
          issues.push({
            type: "density_imbalance",
            severity: chRatio < T.ASYM_ERROR ? "error" : "warning",
            detail: `Nested columns inside \`${el.selector}\` have different actual content heights: [${nCH.map((h) => Math.round(h) + "px").join(" vs ")}] (ratio ${Math.round(chRatio * 100)}%).`,
            data: { ratio: Math.round(chRatio * 100) },
          })
        }
      }
    }
  }

  return issues
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Run all checks on a set of slide metrics and produce a QA report.
 */
export function runChecks(filePath: string, allMetrics: SlideMetrics[]): QAReport {
  const slides: SlideReport[] = []

  for (const metrics of allMetrics) {
    const issues: LayoutIssue[] = [
      ...checkFill(metrics),
      ...checkBottomWhitespace(metrics),
      ...checkOverflow(metrics),
      ...checkAsymmetry(metrics),
      ...checkSparse(metrics),
      ...checkDensityImbalance(metrics),
    ]

    slides.push({ index: metrics.index, title: metrics.title, issues })
  }

  const totalIssues = slides.reduce((s, r) => s + r.issues.length, 0)
  const errorCount = slides.reduce(
    (s, r) => s + r.issues.filter((i) => i.severity === "error").length,
    0
  )
  const warningCount = slides.reduce(
    (s, r) => s + r.issues.filter((i) => i.severity === "warning").length,
    0
  )

  const summary =
    totalIssues === 0
      ? "All slides passed layout QA."
      : `Found ${totalIssues} issue(s): ${errorCount} error(s), ${warningCount} warning(s) across ${slides.filter((s) => s.issues.length > 0).length} slide(s).`

  return { file: filePath, slides, totalIssues, errorCount, warningCount, summary }
}

// ── Report formatter ─────────────────────────────────────────────────────────

/**
 * Format a QAReport into a markdown string suitable for the LLM to read.
 */
export function formatReport(report: QAReport): string {
  if (report.totalIssues === 0) {
    return `## Layout QA: PASSED\n\nAll ${report.slides.length} slide(s) passed layout checks. No issues found.`
  }

  const lines: string[] = [
    `## Layout QA Report`,
    ``,
    `**File:** \`${report.file}\``,
    `**Result:** ${report.errorCount > 0 ? "FAILED" : "WARNINGS"} — ${report.summary}`,
    ``,
  ]

  for (const slide of report.slides) {
    if (slide.issues.length === 0) continue
    lines.push(`### Slide ${slide.index + 1}: ${slide.title}`)
    for (const issue of slide.issues) {
      const icon = issue.severity === "error" ? "🔴" : "🟡"
      lines.push(`- ${icon} **${issue.type}**: ${issue.detail}`)
    }
    lines.push("")
  }

  lines.push(
    `### Action Required`,
    ``,
    `Please fix the above layout issues in the HTML file. For each issue:`,
    `- **underfill / bottom_whitespace**: expand content to fill the slide, use \`flex: 1\` on containers, add more content blocks, or reduce top padding.`,
    `- **asymmetry**: ensure side-by-side columns have matching visual weight — equalise item count, use \`align-items: stretch\`, or adjust heights explicitly.`,
    `- **density_imbalance**: add more items to the sparse column, reduce items in the dense column, or switch to a single-column layout. CSS stretch hides height differences but not visual emptiness.`,
    `- **overflow**: reduce font size, padding, or content amount for the affected element.`,
    `- **card_height_variance**: ensure cards in the same row have similar content density, or use \`align-items: stretch\` on the grid.`,
    `- **sparse**: add more content components, increase font sizes, or use a layout with fewer columns.`,
  )

  return lines.join("\n")
}
