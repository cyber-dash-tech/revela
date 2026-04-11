/**
 * lib/qa/checks.ts
 *
 * Geometry-based layout quality checks — four orthogonal visual dimensions.
 *
 * Dimension 1: Overflow   — elements exceed canvas bounds (correctness)
 * Dimension 2: Balance    — content centroid & distribution (fill, sparsity)
 * Dimension 3: Symmetry   — side-by-side element consistency (height, density)
 * Dimension 4: Rhythm     — spacing regularity & internal whitespace
 *
 * All checks operate on SlideMetrics produced by measure.ts.
 * Design-system-agnostic: no CSS class-name assumptions.
 */

import type { SlideMetrics, ElementInfo, Rect } from "./measure"
import { CANVAS_W, CANVAS_H } from "./measure"

// ── Types ─────────────────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "warning" | "info"

export interface LayoutIssue {
  type: "overflow" | "balance" | "symmetry" | "rhythm"
  /** Sub-category within the dimension */
  sub?: "centroid_offset" | "bottom_gap" | "sparse"
      | "height_mismatch" | "density_mismatch"
      | "gap_variance"
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

// ── Slide type registry — single source of truth ──────────────────────────────

/**
 * All valid values for the `data-slide-type` attribute on `<section class="slide">`.
 *
 * Single source of truth consumed by:
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

/**
 * Slide types that are intentionally sparse, centred, or structurally
 * different from "content" slides. Balance and rhythm checks are skipped
 * for these types (overflow and symmetry still apply).
 */
export const EXEMPT_TYPES: ReadonlySet<string> = new Set<SlideType>([
  "cover",
  "toc",
  "closing",
  "divider",
  "summary",
  "thank-you",
])

// ── Thresholds ────────────────────────────────────────────────────────────────

const T = {
  // Balance — centroid offset (fraction of canvas half-dimension)
  CENTROID_WARN: 0.25,
  CENTROID_ERROR: 0.35,
  // Balance — bottom gap (px)
  BOTTOM_GAP_WARN: 200,
  BOTTOM_GAP_ERROR: 350,
  // Balance — sparse: fewer than this many visible top-level elements
  SPARSE_THRESHOLD: 2,
  // Symmetry — min/max ratio for height, content-height, leaf count
  SYM_WARN: 0.70,
  SYM_ERROR: 0.50,
  // Symmetry — min element width to be considered a layout column
  COL_MIN_WIDTH: 200,
  // Symmetry — min vertical overlap fraction to consider elements "in the same row"
  ROW_OVERLAP: 0.30,
  // Rhythm — gap variance: coefficient of variation threshold
  GAP_CV_WARN: 0.60,
  GAP_CV_ERROR: 1.00,
  // Rhythm — min mean gap (px) to bother checking variance
  GAP_MIN_MEAN: 10,
  // Rhythm — min children count to check gap variance
  GAP_MIN_CHILDREN: 3,
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Vertical overlap [0..1] relative to the shorter element. */
function verticalOverlap(a: Rect, b: Rect): number {
  const overlapTop = Math.max(a.top, b.top)
  const overlapBot = Math.min(a.bottom, b.bottom)
  const overlap = Math.max(0, overlapBot - overlapTop)
  const shorter = Math.min(a.height, b.height)
  return shorter > 0 ? overlap / shorter : 0
}

/** Horizontal overlap [0..1] relative to the shorter element. */
function horizontalOverlap(a: Rect, b: Rect): number {
  const ol = Math.max(a.left, b.left)
  const or = Math.min(a.right, b.right)
  const overlap = Math.max(0, or - ol)
  const shorter = Math.min(a.width, b.width)
  return shorter > 0 ? overlap / shorter : 0
}

/**
 * Group elements into rows: elements with significant vertical overlap are
 * considered side-by-side. Each row is sorted left→right.
 * Only elements wide enough to be layout columns are considered.
 */
function groupIntoRows(elements: ElementInfo[]): ElementInfo[][] {
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

/** Count all leaf (no-child) descendants. */
/**
 * Sum of bounding-box areas of all visible leaf descendants.
 * More accurate than leaf count for density comparisons — charts and large
 * containers contribute proportionally to their visual footprint.
 */
function leafArea(el: ElementInfo): number {
  if (el.children.length === 0) {
    return el.visible ? el.rect.width * el.rect.height : 0
  }
  return el.children.reduce((sum, ch) => sum + leafArea(ch), 0)
}

/**
 * Actual content height of an element: from topmost child top to bottommost
 * child bottom. Ignores CSS stretch padding on the container itself.
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

/** Collect all visible leaf elements recursively. */
function collectLeaves(el: ElementInfo): ElementInfo[] {
  if (el.children.length === 0) return el.visible ? [el] : []
  return el.children.flatMap(collectLeaves)
}

// ── Dimension 1: Overflow ─────────────────────────────────────────────────────

/**
 * Check 1: Overflow — elements extending beyond canvas boundaries.
 * Hard correctness check; applies to all slide types.
 */
function checkOverflow(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const { canvasRect } = metrics
  const tol = 2 // 2px sub-pixel tolerance

  function walk(els: ElementInfo[]) {
    for (const el of els) {
      if (!el.visible) continue
      const r = el.rect
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
      if (el.children.length > 0) walk(el.children)
    }
  }

  walk(metrics.elements)
  return issues
}

// ── Dimension 2: Balance ──────────────────────────────────────────────────────

/**
 * Check 2: Balance — content centroid, bottom gap, sparsity.
 * Skipped for EXEMPT_TYPES (cover, closing, etc.).
 *
 * Sub-checks:
 *   - centroid_offset: weighted centroid deviates too far from canvas centre
 *   - bottom_gap: large empty gap at bottom of slide
 *   - sparse: too few visible top-level elements
 */
function checkBalance(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const { elements, contentRect, canvasRect } = metrics

  // Guard: no content at all
  if (contentRect.width === 0 || contentRect.height === 0) {
    issues.push({
      type: "balance",
      sub: "sparse",
      severity: "error",
      detail: "Slide appears to have no visible content.",
    })
    return issues
  }

  // Exempt structural slides
  if (metrics.slideType && EXEMPT_TYPES.has(metrics.slideType)) return []

  // Geometry fallback for old HTML without data-slide-type:
  // detect cover-like slides (single centred column)
  const contentCenterX = (contentRect.left + contentRect.right) / 2
  const canvasCenterX = canvasRect.width / 2
  const centerOffsetFrac = Math.abs(contentCenterX - canvasCenterX) / canvasRect.width
  const maxElemWidth = Math.max(...elements.map((e) => e.rect.width))
  const isCoverLike = centerOffsetFrac < 0.15 && maxElemWidth < canvasRect.width * 0.65
  if (isCoverLike) return []

  // ── Sub-check: sparse ────────────────────────────────────────────────────
  const visibleCount = elements.filter((e) => e.visible).length
  if (visibleCount < T.SPARSE_THRESHOLD) {
    issues.push({
      type: "balance",
      sub: "sparse",
      severity: "warning",
      detail: `Slide has only ${visibleCount} visible top-level element(s). This may result in a lot of empty space.`,
      data: { visibleCount },
    })
  }

  // ── Sub-check: centroid offset ───────────────────────────────────────────
  // Collect all leaf elements and compute area-weighted centroid
  const leaves = elements.flatMap(collectLeaves)
  if (leaves.length > 0) {
    let totalArea = 0
    let weightedX = 0
    let weightedY = 0

    for (const leaf of leaves) {
      const area = leaf.rect.width * leaf.rect.height
      const cx = (leaf.rect.left + leaf.rect.right) / 2
      const cy = (leaf.rect.top + leaf.rect.bottom) / 2
      totalArea += area
      weightedX += cx * area
      weightedY += cy * area
    }

    if (totalArea > 0) {
      const centroidX = weightedX / totalArea
      const centroidY = weightedY / totalArea

      // Normalise offset by half-canvas dimensions so both axes are comparable
      const offsetX = Math.abs(centroidX - canvasRect.width / 2) / (canvasRect.width / 2)
      const offsetY = Math.abs(centroidY - canvasRect.height / 2) / (canvasRect.height / 2)
      const offset = Math.max(offsetX, offsetY)

      if (offset > T.CENTROID_ERROR) {
        issues.push({
          type: "balance",
          sub: "centroid_offset",
          severity: "error",
          detail: `Content centroid is far off-centre (${Math.round(offset * 100)}% offset). Content is concentrated in one area of the slide — consider distributing it more evenly.`,
          data: { offsetPct: Math.round(offset * 100), centroidX: Math.round(centroidX), centroidY: Math.round(centroidY) },
        })
      } else if (offset > T.CENTROID_WARN) {
        issues.push({
          type: "balance",
          sub: "centroid_offset",
          severity: "warning",
          detail: `Content centroid is slightly off-centre (${Math.round(offset * 100)}% offset). Consider balancing the visual weight across the slide.`,
          data: { offsetPct: Math.round(offset * 100), centroidX: Math.round(centroidX), centroidY: Math.round(centroidY) },
        })
      }
    }
  }

  // ── Sub-check: bottom gap ────────────────────────────────────────────────
  const bottomGap = canvasRect.bottom - contentRect.bottom

  if (bottomGap > T.BOTTOM_GAP_ERROR) {
    issues.push({
      type: "balance",
      sub: "bottom_gap",
      severity: "error",
      detail: `${Math.round(bottomGap)}px of empty space at the bottom of the slide (last content at ${Math.round(contentRect.bottom)}px, canvas bottom at ${Math.round(canvasRect.bottom)}px). The slide looks notably under-filled.`,
      data: { gapPx: Math.round(bottomGap) },
    })
  } else if (bottomGap > T.BOTTOM_GAP_WARN) {
    issues.push({
      type: "balance",
      sub: "bottom_gap",
      severity: "warning",
      detail: `${Math.round(bottomGap)}px empty gap at the bottom of the slide. Consider adding content, increasing padding, or using flex-grow to distribute vertical space.`,
      data: { gapPx: Math.round(bottomGap) },
    })
  }

  return issues
}

// ── Dimension 3: Symmetry ─────────────────────────────────────────────────────

/**
 * Check 3: Symmetry — side-by-side elements should be visually balanced.
 *
 * For each row of side-by-side columns, checks three sub-metrics and reports
 * the most severe finding:
 *   - height_mismatch:   rendered height ratio
 *   - density_mismatch:  actual content height ratio (strips CSS stretch)
 *   - leaf count ratio:  proxy for content density imbalance
 *
 * Applies at top-level and one level deep (nested rows inside columns).
 */
function checkSymmetry(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []

  function checkRow(row: ElementInfo[], parentSelector?: string) {
    if (row.length < 2) return

    const heights     = row.map((e) => e.rect.height)
    const contHeights = row.map(contentHeight)
    const areas       = row.map(leafArea)

    const minH  = Math.min(...heights),    maxH  = Math.max(...heights)
    const minCH = Math.min(...contHeights), maxCH = Math.max(...contHeights)
    const minA  = Math.min(...areas),       maxA  = Math.max(...areas)

    const hRatio  = maxH  > 0 ? minH  / maxH  : 1
    const chRatio = maxCH > 50 ? minCH / maxCH : 1  // skip tiny containers
    const aRatio  = maxA  > 0 ? minA  / maxA  : 1

    // Height mismatch (rendered boxes)
    if (hRatio < T.SYM_ERROR) {
      issues.push({
        type: "symmetry",
        sub: "height_mismatch",
        severity: "error",
        detail: `${parentSelector ? `Columns inside \`${parentSelector}\`` : "Side-by-side columns"} have a severe height mismatch: [${heights.map((h) => Math.round(h) + "px").join(" vs ")}] (ratio ${Math.round(hRatio * 100)}%). The shorter column looks nearly empty.`,
        data: { ratio: Math.round(hRatio * 100), minH: Math.round(minH), maxH: Math.round(maxH) },
      })
    } else if (hRatio < T.SYM_WARN) {
      issues.push({
        type: "symmetry",
        sub: "height_mismatch",
        severity: "warning",
        detail: `${parentSelector ? `Columns inside \`${parentSelector}\`` : "Side-by-side columns"} have unequal heights: [${heights.map((h) => Math.round(h) + "px").join(" vs ")}] (ratio ${Math.round(hRatio * 100)}%). Consider equalising content density.`,
        data: { ratio: Math.round(hRatio * 100), minH: Math.round(minH), maxH: Math.round(maxH) },
      })
    }

    // Density mismatch (actual content height, ignores CSS stretch)
    if (maxCH > 50 && chRatio < T.SYM_ERROR) {
      issues.push({
        type: "symmetry",
        sub: "density_mismatch",
        severity: "error",
        detail: `${parentSelector ? `Columns inside \`${parentSelector}\`` : "Side-by-side columns"} have very different actual content heights: [${contHeights.map((h) => Math.round(h) + "px").join(" vs ")}] (ratio ${Math.round(chRatio * 100)}%). CSS stretch hides this — the sparser column will have large internal whitespace.`,
        data: { ratio: Math.round(chRatio * 100), contentHeights: contHeights.map(Math.round).join(",") },
      })
    } else if (maxCH > 50 && chRatio < T.SYM_WARN) {
      issues.push({
        type: "symmetry",
        sub: "density_mismatch",
        severity: "warning",
        detail: `${parentSelector ? `Columns inside \`${parentSelector}\`` : "Side-by-side columns"} have different actual content heights: [${contHeights.map((h) => Math.round(h) + "px").join(" vs ")}] (ratio ${Math.round(chRatio * 100)}%). Consider equalising content density.`,
        data: { ratio: Math.round(chRatio * 100), contentHeights: contHeights.map(Math.round).join(",") },
      })
    }

    // Area imbalance (sum of leaf bounding-box areas — robust to chart containers)
    if (maxA > 0 && aRatio < T.SYM_ERROR) {
      issues.push({
        type: "symmetry",
        sub: "density_mismatch",
        severity: "error",
        detail: `${parentSelector ? `Columns inside \`${parentSelector}\`` : "Side-by-side columns"} have very unequal content area: [${areas.map((a) => Math.round(a / 1000) + "k").join(" vs ")}]px² (ratio ${Math.round(aRatio * 100)}%). The sparse column may feel nearly empty.`,
        data: { ratio: Math.round(aRatio * 100), areas: areas.map((a) => Math.round(a / 1000)).join(",") },
      })
    } else if (maxA > 0 && aRatio < T.SYM_WARN) {
      issues.push({
        type: "symmetry",
        sub: "density_mismatch",
        severity: "warning",
        detail: `${parentSelector ? `Columns inside \`${parentSelector}\`` : "Side-by-side columns"} have unequal content area: [${areas.map((a) => Math.round(a / 1000) + "k").join(" vs ")}]px² (ratio ${Math.round(aRatio * 100)}%). Consider balancing content between columns.`,
        data: { ratio: Math.round(aRatio * 100), areas: areas.map((a) => Math.round(a / 1000)).join(",") },
      })
    }
  }

  // Top-level rows (elements that are side-by-side at the top level)
  const topRows = groupIntoRows(metrics.elements)
  for (const row of topRows) {
    checkRow(row)
    // One level deep: check nested rows inside each column
    for (const col of row) {
      if (col.children.length >= 2) {
        const nestedRows = groupIntoRows(col.children)
        for (const nestedRow of nestedRows) {
          checkRow(nestedRow, col.selector)
        }
      }
    }
  }

  // Also check children of every top-level element that is NOT itself part of a row.
  // This catches containers like .two-col whose children are side-by-side columns,
  // even when the container itself is stacked vertically (no top-level sibling to pair with).
  const inTopRow = new Set(topRows.flat().map((e) => e.selector))
  for (const el of metrics.elements) {
    if (!el.visible || inTopRow.has(el.selector)) continue
    if (el.children.length >= 2) {
      const childRows = groupIntoRows(el.children)
      for (const row of childRows) {
        checkRow(row, el.selector)
      }
    }
  }

  return issues
}

// ── Dimension 4: Rhythm ───────────────────────────────────────────────────────

/**
 * Coefficient of variation: stddev / mean. Returns 0 if mean is 0.
 */
function cv(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

/**
 * Check 4: Rhythm — spacing regularity between stacked siblings.
 *
 * Sub-checks:
 *   - gap_variance: vertical gaps between stacked siblings are uneven
 */
function checkRhythm(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []

  // Exempt structural slides
  if (metrics.slideType && EXEMPT_TYPES.has(metrics.slideType)) return []

  function checkContainer(els: ElementInfo[], containerSelector?: string) {
    if (els.length < 2) return

    // Identify vertically-stacked children (high horizontal overlap, low vertical overlap)
    const visibleEls = els.filter((e) => e.visible).sort((a, b) => a.rect.top - b.rect.top)
    if (visibleEls.length < T.GAP_MIN_CHILDREN) return

    // Check if elements are mostly stacked (not side-by-side)
    // Heuristic: average horizontal overlap > 0.5 among adjacent pairs
    let hOverlapSum = 0
    for (let i = 0; i < visibleEls.length - 1; i++) {
      hOverlapSum += horizontalOverlap(visibleEls[i].rect, visibleEls[i + 1].rect)
    }
    const avgHOverlap = hOverlapSum / (visibleEls.length - 1)
    if (avgHOverlap < 0.5) return // Side-by-side layout, not stacked

    // Compute gaps between adjacent stacked elements
    const gaps: number[] = []
    for (let i = 0; i < visibleEls.length - 1; i++) {
      const gap = visibleEls[i + 1].rect.top - visibleEls[i].rect.bottom
      if (gap >= 0) gaps.push(gap) // negative gap = overlapping, skip
    }
    if (gaps.length < 2) return

    const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
    if (meanGap < T.GAP_MIN_MEAN) return

    const gapCV = cv(gaps)
    const label = containerSelector ? `inside \`${containerSelector}\`` : "in slide"

    if (gapCV > T.GAP_CV_ERROR) {
      issues.push({
        type: "rhythm",
        sub: "gap_variance",
        severity: "error",
        detail: `Gaps between stacked elements ${label} are highly irregular (CV=${Math.round(gapCV * 100)}%, gaps=[${gaps.map(Math.round).join(", ")}]px). Use consistent gap or padding values.`,
        data: { cv: Math.round(gapCV * 100), gaps: gaps.map(Math.round).join(",") },
      })
    } else if (gapCV > T.GAP_CV_WARN) {
      issues.push({
        type: "rhythm",
        sub: "gap_variance",
        severity: "warning",
        detail: `Gaps between stacked elements ${label} are uneven (CV=${Math.round(gapCV * 100)}%, gaps=[${gaps.map(Math.round).join(", ")}]px). Consider using a consistent gap or flex spacing.`,
        data: { cv: Math.round(gapCV * 100), gaps: gaps.map(Math.round).join(",") },
      })
    }
  }

  // Check at top-level and one level deep
  checkContainer(metrics.elements)
  for (const el of metrics.elements) {
    if (el.children.length > 0) {
      checkContainer(el.children, el.selector)
    }
  }

  return issues
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run all four dimension checks on a set of slide metrics and produce a QA report.
 */
export function runChecks(filePath: string, allMetrics: SlideMetrics[]): QAReport {
  const slides: SlideReport[] = []

  for (const metrics of allMetrics) {
    const issues: LayoutIssue[] = [
      ...checkOverflow(metrics),
      ...checkBalance(metrics),
      ...checkSymmetry(metrics),
      ...checkRhythm(metrics),
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

// ── Report formatter ──────────────────────────────────────────────────────────

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
      const label = issue.sub ? `${issue.type}/${issue.sub}` : issue.type
      lines.push(`- ${icon} **${label}**: ${issue.detail}`)
    }
    lines.push("")
  }

  lines.push(
    `### Action Required`,
    ``,
    `Please fix the above layout issues in the HTML file. For each issue type:`,
    `- **overflow**: reduce font size, padding, or content amount for the affected element.`,
    `- **balance/centroid_offset**: redistribute content so the visual weight is centred — avoid concentrating everything in one corner or side.`,
    `- **balance/bottom_gap**: expand content to fill the slide, use \`flex: 1\` on containers, add more content blocks, or reduce top padding.`,
    `- **balance/sparse**: add more content components, increase font sizes, or use a layout with fewer columns.`,
    `- **symmetry/height_mismatch**: equalise side-by-side column heights — use \`align-items: stretch\` or match content density.`,
    `- **symmetry/density_mismatch**: balance content between columns — add items to the sparse column or reduce items in the dense one.`,
    `- **rhythm/gap_variance**: use consistent \`gap\` or \`margin\` values between stacked elements instead of mixing sizes.`,
  )

  return lines.join("\n")
}
