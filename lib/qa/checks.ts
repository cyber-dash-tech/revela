/**
 * lib/qa/checks.ts
 *
 * Browser-measured slide quality checks. The active default path checks hard
 * artifact failures plus a content-substance warning; older soft visual
 * heuristics are kept here for future opt-in use.
 *
 * Dimension 1: Canvas      — exact 1920x1080 slide/canvas size
 * Dimension 2: Overflow    — scrollbars, element overflow, and text clipping
 * Dimension 3: Density     — claim/evidence/source substance warnings
 * Dimension 4: Compliance  — CSS classes match the active design's vocabulary
 *
 * All checks operate on SlideMetrics produced by measure.ts.
 * Design component compliance requires an allowedClasses vocabulary from the
 * design system and is run by combined artifact QA.
 */

import type { SlideMetrics, ElementInfo, Rect } from "./measure"
import { CANVAS_W, CANVAS_H } from "./measure"

// ── Types ─────────────────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "warning" | "info"

export interface LayoutIssue {
  type: "canvas" | "scrollbar" | "navigation" | "overflow" | "text_overflow" | "overlap" | "density" | "balance" | "symmetry" | "rhythm" | "compliance" | "asset"
  /** Sub-category within the dimension */
  sub?: "size_mismatch" | "missing_slide_canvas" | "multiple_slide_canvas" | "page_scroll" | "fixed_overlay_slides" | "hidden_paging" | "unreachable_slides" | "text_clipped" | "thin_content"
      | "element_collision" | "major_overlap" | "possible_overlay"
      | "centroid_offset" | "bottom_gap" | "sparse"
      | "height_mismatch" | "density_mismatch"
      | "gap_variance"
      | "unknown_class" | "novel_css_rule"
      | "remote_url" | "refine_proxy" | "missing_file"
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
  CANVAS_TOLERANCE: 1,
  DENSITY_MIN_TEXT_POINTS: 70,
  DENSITY_MIN_UNITS: 2,
  OVERLAP_MIN_AREA: 1600,
  OVERLAP_MIN_ELEMENT_AREA: 5000,
  OVERLAP_WARN_RATIO: 0.08,
  OVERLAP_ERROR_RATIO: 0.18,
  OVERLAP_TEXT_WARN_RATIO: 0.05,
  OVERLAP_TEXT_ERROR_RATIO: 0.12,
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

function checkCanvas(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const tol = T.CANVAS_TOLERANCE
  const directCanvasCount = metrics.directSlideCanvasCount ?? 1
  if (directCanvasCount === 0) {
    issues.push({
      type: "canvas",
      sub: "missing_slide_canvas",
      severity: "error",
      detail: "Each .slide must have a direct .slide-canvas child.",
    })
    return issues
  }
  if (directCanvasCount > 1) {
    issues.push({
      type: "canvas",
      sub: "multiple_slide_canvas",
      severity: "error",
      detail: `Each .slide must have exactly one direct .slide-canvas child. Found ${directCanvasCount}.`,
      data: { directSlideCanvasCount: directCanvasCount },
    })
  }

  const canvasBad = Math.abs(metrics.canvasRect.width - CANVAS_W) > tol || Math.abs(metrics.canvasRect.height - CANVAS_H) > tol
  const slideBad = Math.abs(metrics.slideRect.width - CANVAS_W) > tol || Math.abs(metrics.slideRect.height - CANVAS_H) > tol

  if (canvasBad || slideBad) {
    issues.push({
      type: "canvas",
      sub: "size_mismatch",
      severity: "error",
      detail: `Slide and canvas must render exactly ${CANVAS_W}x${CANVAS_H}px. Measured slide ${Math.round(metrics.slideRect.width)}x${Math.round(metrics.slideRect.height)}px, canvas ${Math.round(metrics.canvasRect.width)}x${Math.round(metrics.canvasRect.height)}px.`,
      data: {
        expectedWidth: CANVAS_W,
        expectedHeight: CANVAS_H,
        slideWidth: Math.round(metrics.slideRect.width),
        slideHeight: Math.round(metrics.slideRect.height),
        canvasWidth: Math.round(metrics.canvasRect.width),
        canvasHeight: Math.round(metrics.canvasRect.height),
      },
    })
  }

  return issues
}

function checkScrollbars(metrics: SlideMetrics): LayoutIssue[] {
  const scrollbars = metrics.scrollbars
  const totalSlides = metrics.navigation?.totalSlides ?? 1
  const hasAllowedMultiSlideVerticalScroll = totalSlides > 1

  if (scrollbars) {
    const hasBlockingScrollbars =
      scrollbars.documentHorizontal ||
      scrollbars.bodyHorizontal ||
      scrollbars.slideHorizontal ||
      scrollbars.slideVertical ||
      (!hasAllowedMultiSlideVerticalScroll && (scrollbars.documentVertical || scrollbars.bodyVertical))

    if (!hasBlockingScrollbars) return []
  } else if (!metrics.hasScrollbars) {
    return []
  }

  return [{
    type: "scrollbar",
    sub: "page_scroll",
    severity: "error",
    detail: "Rendered slide/page has blocking scrollbars at 1920x1080. Normal vertical document scroll is allowed for multi-slide navigation, but horizontal document/body scroll and slide-internal scroll must be removed.",
  }]
}

function checkNavigationModel(allMetrics: SlideMetrics[]): LayoutIssue[] {
  if (allMetrics.length <= 1) return []

  const nav = allMetrics.map((metrics) => metrics.navigation).filter((item): item is NonNullable<SlideMetrics["navigation"]> => Boolean(item))
  if (nav.length <= 1) return []

  const positioned = nav.filter((item) => item.position === "fixed" || item.position === "absolute")
  const hiddenByAria = nav.filter((item) => item.ariaHidden === "true" || item.visibility === "hidden" || item.display === "none")
  const uniqueTops = new Set(nav.map((item) => Math.round(item.initialTop)))
  const stacked = uniqueTops.size <= 1
  const documentCanScroll = nav[0].documentScrollHeight > nav[0].viewportHeight + 2
  const overflowHidden = nav[0].bodyOverflowY === "hidden" || nav[0].documentOverflowY === "hidden"

  const issues: LayoutIssue[] = []
  if (positioned.length === nav.length && stacked) {
    issues.push({
      type: "navigation",
      sub: "fixed_overlay_slides",
      severity: "error",
      detail: "Slides are stacked with fixed/absolute positioning. Revela decks must keep each .slide in normal document flow so scrollIntoView and keyboard navigation can reach every slide.",
      data: { slideCount: nav.length, positionedSlides: positioned.length },
    })
  }

  if (positioned.length === nav.length && hiddenByAria.length > 0) {
    issues.push({
      type: "navigation",
      sub: "hidden_paging",
      severity: "error",
      detail: "Slides use aria-hidden/visibility toggles with fixed overlay pagination. Do not make slide visibility depend on aria-hidden; keep slides visible in normal flow and navigate with scrollIntoView.",
      data: { hiddenSlides: hiddenByAria.length, slideCount: nav.length },
    })
  }

  if (!documentCanScroll && overflowHidden && allMetrics.length > 1) {
    issues.push({
      type: "navigation",
      sub: "unreachable_slides",
      severity: "error",
      detail: "Multi-slide deck disables document vertical scrolling. Normal slide flow needs enough document height for all slides; fix slide overflow locally instead of hiding body/html overflow.",
      data: { slideCount: nav.length, documentScrollHeight: nav[0].documentScrollHeight, viewportHeight: nav[0].viewportHeight },
    })
  }

  return issues
}

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

function checkTextOverflow(metrics: SlideMetrics): LayoutIssue[] {
  const issues: LayoutIssue[] = []

  function walk(els: ElementInfo[]) {
    for (const el of els) {
      if (!el.visible) continue
      if (el.textOverflow) {
        issues.push({
          type: "text_overflow",
          sub: "text_clipped",
          severity: "error",
          detail: `Text appears clipped inside \`${el.selector}\`${el.text ? `: "${el.text}"` : ""}. Increase container size, reduce copy, or adjust font/line-height.`,
          data: { selector: el.selector, text: el.text ?? "" },
        })
      }
      if (el.children.length > 0) walk(el.children)
    }
  }

  walk(metrics.elements)
  return issues
}

const SEMANTIC_COMPONENT_CLASSES = [
  "box",
  "text-panel",
  "media",
  "echart-panel",
  "data-table",
  "stat-card",
  "quote",
  "hero",
  "toc",
  "steps",
  "roadmap-horizontal",
  "roadmap-vertical",
]

const DECORATIVE_CLASSES = [
  "page-number",
  "brand-watermark",
  "watermark",
  "background",
  "decorative",
  "motif",
]

function checkElementOverlap(metrics: SlideMetrics): LayoutIssue[] {
  const candidates = overlapCandidates(metrics.elements)
  const issues: LayoutIssue[] = []

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      if (isIntentionalOverlayPair(a, b)) continue

      const overlap = intersection(a.rect, b.rect)
      if (!overlap) continue

      const intersectionArea = overlap.width * overlap.height
      if (intersectionArea < T.OVERLAP_MIN_AREA) continue

      const minArea = Math.min(area(a.rect), area(b.rect))
      if (minArea <= 0) continue

      const ratio = intersectionArea / minArea
      const textSensitive = hasText(a) || hasText(b)
      const errorRatio = textSensitive ? T.OVERLAP_TEXT_ERROR_RATIO : T.OVERLAP_ERROR_RATIO
      const warnRatio = textSensitive ? T.OVERLAP_TEXT_WARN_RATIO : T.OVERLAP_WARN_RATIO
      if (ratio < warnRatio) continue

      const severity: IssueSeverity = ratio >= errorRatio ? "error" : "warning"
      issues.push({
        type: "overlap",
        sub: severity === "error" ? "element_collision" : "possible_overlay",
        severity,
        detail: `Elements \`${a.selector}\` and \`${b.selector}\` overlap by ${Math.round(ratio * 100)}% of the smaller element (${Math.round(intersectionArea)}px²). Separate the components, reduce content, or choose a layout with more space.`,
        data: {
          elementA: a.selector,
          elementB: b.selector,
          overlapRatioPct: Math.round(ratio * 100),
          intersectionArea: Math.round(intersectionArea),
          rectA: rectData(a.rect),
          rectB: rectData(b.rect),
        },
      })
    }
  }

  return issues
}

function overlapCandidates(elements: ElementInfo[]): ElementInfo[] {
  const semantic = elements.flatMap((element) => semanticDescendants(element))
  const base = semantic.length > 1 ? semantic : elements.filter((element) => element.visible)
  return base.filter((element) => {
    if (!element.visible) return false
    if (area(element.rect) < T.OVERLAP_MIN_ELEMENT_AREA) return false
    if (isDecorative(element)) return false
    return true
  })
}

function semanticDescendants(element: ElementInfo): ElementInfo[] {
  if (!element.visible || isDecorative(element)) return []
  if (isSemanticComponent(element)) return [element]
  return element.children.flatMap((child) => semanticDescendants(child))
}

function isSemanticComponent(element: ElementInfo): boolean {
  return element.classList.some((className) =>
    SEMANTIC_COMPONENT_CLASSES.includes(className) || className.startsWith("roadmap-")
  )
}

function isDecorative(element: ElementInfo): boolean {
  return element.classList.some((className) =>
    DECORATIVE_CLASSES.includes(className) || className.startsWith("decorative-") || className.startsWith("background-")
  )
}

function isIntentionalOverlayPair(a: ElementInfo, b: ElementInfo): boolean {
  const classes = new Set([...a.classList, ...b.classList])
  return classes.has("hero") && (classes.has("media") || classes.has("text-panel"))
}

function intersection(a: Rect, b: Rect): Rect | undefined {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.right, b.right)
  const bottom = Math.min(a.bottom, b.bottom)
  if (right <= left || bottom <= top) return undefined
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function area(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height)
}

function hasText(element: ElementInfo): boolean {
  if (element.text?.trim()) return true
  return element.children.some(hasText)
}

function rectData(rect: Rect): string {
  return `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}`
}

function checkContentDensity(metrics: SlideMetrics): LayoutIssue[] {
  if (!metrics.slideQa) return []
  const { bodyTextPoints, contentUnits, supportReferences } = metrics.contentStats
  const thinText = bodyTextPoints < T.DENSITY_MIN_TEXT_POINTS
  const thinUnits = contentUnits < T.DENSITY_MIN_UNITS
  if (!thinText && !thinUnits) return []

  return [{
    type: "density",
    sub: "thin_content",
    severity: "warning",
    detail: `Content slide may not have enough claim/evidence substance: ${bodyTextPoints} non-title text point(s), ${contentUnits} recognizable content unit(s), ${supportReferences} evidence/source/claim reference(s). Add concrete claim points, evidence, metrics, chart/table support, or source/caveat text if this is not a deliberate focus slide.`,
    data: { bodyTextPoints, contentUnits, supportReferences },
  }]
}

// ── Dimension 2: Balance ──────────────────────────────────────────────────────

/**
 * Check 2: Balance — content centroid, bottom gap, sparsity.
 * Only runs when `metrics.slideQa` is true (content-heavy layouts).
 * Structural/sparse slides (cover, closing, etc.) set slide-qa="false" and are skipped.
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

  // Skip balance checks for structural/sparse slides (slide-qa="false")
  if (!metrics.slideQa) return []

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

  // Skip rhythm checks for structural/sparse slides (slide-qa="false")
  if (!metrics.slideQa) return []

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
 * Options for future geometry checks. The current default path only checks
 * overflow, regardless of options.
 */
export interface RunChecksOptions {}

/**
 * Run all dimension checks on a set of slide metrics and produce a QA report.
 */
export function runChecks(
  filePath: string,
  allMetrics: SlideMetrics[],
  _options?: RunChecksOptions,
): QAReport {
  const slides: SlideReport[] = []
  const navigationIssues = checkNavigationModel(allMetrics)

  for (const metrics of allMetrics) {
    const issues: LayoutIssue[] = [
      ...(metrics.index === 0 ? navigationIssues : []),
      ...checkCanvas(metrics),
      ...checkScrollbars(metrics),
      ...checkOverflow(metrics),
      ...checkTextOverflow(metrics),
      ...checkElementOverlap(metrics),
      ...checkContentDensity(metrics),
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
  const issues = report.slides.flatMap((slide) => slide.issues)
  const complianceOnly = issues.length > 0 && issues.every((issue) => issue.type === "compliance")

  if (report.totalIssues === 0) {
    return `## Layout QA: PASSED\n\nAll ${report.slides.length} slide(s) passed layout checks. No issues found.`
  }

  if (complianceOnly) {
    return formatComplianceReport(report)
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
    `Please fix the above hard-error issues in the HTML file. For each issue type:`,
    `- **canvas**: ensure each slide and .slide-canvas render exactly 1920x1080px, not merely any 16:9 size.`,
    `- **scrollbar**: remove horizontal document/body scrolling and slide-internal scrolling. Multi-slide decks may use normal vertical document scroll for navigation.`,
    `- **navigation**: keep every .slide in normal document flow; do not stack slides with fixed/absolute positioning or rely on aria-hidden/visibility toggles for pagination. Use scrollIntoView-based navigation.`,
    `- **overflow**: reduce font size, padding, or content amount for the affected element.`,
    `- **text_overflow**: increase the text container size, reduce copy, or adjust font/line-height so text is not clipped.`,
    `- **overlap**: separate overlapping components, reduce copy, resize media/table/chart blocks, or use a layout with more space.`,
    `- **density/thin_content**: add concrete claim/evidence points, metrics, chart/table support, or source/caveat text. This is a warning for content substance, not a blank-space failure.`,
    `- **compliance/unknown_class**: an HTML element uses a CSS class not defined in the active design. Replace it with a class from the Component Index or Layout Index. Fetch the component/layout details with the \`revela-designs\` tool if needed.`,
    `- **compliance/novel_css_rule**: \`<style>\` defines a CSS class that is not part of the active design. Remove the custom rule and use the design's existing component styles. For minor spacing/sizing adjustments, use inline \`style=""\` instead.`,
  )

  return lines.join("\n")
}

function formatComplianceReport(report: QAReport): string {
  const lines: string[] = [
    `## Static Design Compliance Report`,
    ``,
    `**File:** \`${report.file}\``,
    `**Result:** FAILED — ${report.summary}`,
    ``,
  ]

  for (const slide of report.slides) {
    if (slide.issues.length === 0) continue
    lines.push(`### Slide ${slide.index + 1}: ${slide.title}`)
    for (const issue of slide.issues) {
      lines.push(formatComplianceIssue(issue))
    }
    lines.push("")
  }

  lines.push(
    `### Action Required`,
    ``,
    `You must fix the design vocabulary errors above before continuing. These are static class-name checks, not layout QA failures.`,
    `Do not leave unknown classes or custom class selectors in deck HTML.`,
    `- For **unknown HTML classes**, remove ad-hoc/test classes or replace them with classes from the active design's Layout Index or Component Index.`,
    `- For **novel CSS rules**, remove custom class selectors from \`<style>\`; use existing design components, or inline \`style=""\` for minor one-off positioning/sizing tweaks.`,
    `- If you need the correct class names, call \`revela-designs\` to read the relevant layout/component details.`,
  )

  return lines.join("\n")
}

function formatComplianceIssue(issue: LayoutIssue): string {
  const data = issue.data ?? {}
  const cls = typeof data.class === "string" ? data.class : "unknown"
  const location = typeof data.location === "string" ? data.location : "unknown"
  const line = typeof data.line === "number" ? data.line : undefined
  const excerpt = typeof data.excerpt === "string" ? data.excerpt : ""
  const classAttr = typeof data.classAttr === "string" ? data.classAttr : ""
  const tag = typeof data.tag === "string" ? data.tag : ""
  const label = issue.sub ? `compliance/${issue.sub}` : "compliance"
  const icon = issue.severity === "error" ? "🔴" : "🟡"
  const lines = [`- ${icon} **${label}**: \`${cls}\``]

  lines.push(`  - Location: ${location}${line ? `, line ${line}` : ""}`)
  if (tag || classAttr) {
    lines.push(`  - Element: ${tag ? `<${tag}>` : "HTML element"}${classAttr ? ` with class=\"${classAttr}\"` : ""}`)
  }
  if (excerpt) {
    lines.push(`  - Source: \`${excerpt}\``)
  }
  lines.push(`  - Fix: ${issue.detail}`)

  return lines.join("\n")
}
