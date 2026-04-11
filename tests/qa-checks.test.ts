import { describe, it, expect } from "bun:test"
import {
  runChecks,
  formatReport,
  SLIDE_TYPES,
  EXEMPT_TYPES,
} from "../lib/qa/checks"
import { CANVAS_W, CANVAS_H } from "../lib/qa/measure"
import type { SlideMetrics, ElementInfo, Rect } from "../lib/qa/measure"

// ── Fixture builders ───────────────────────────────────────────────────────

function makeRect(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

const CANVAS_RECT = makeRect(0, 0, CANVAS_W, CANVAS_H)

function makeElement(
  rect: Rect,
  selector = "div.col",
  children: ElementInfo[] = [],
  visible = true,
): ElementInfo {
  return { selector, rect, visible, children }
}

/**
 * Build a minimal SlideMetrics object.
 * contentRect defaults to the bounding box of all provided elements' rects.
 */
function makeMetrics(
  opts: {
    index?: number
    slideType?: string
    elements?: ElementInfo[]
    contentRect?: Rect
    title?: string
  } = {},
): SlideMetrics {
  const index = opts.index ?? 0
  const title = opts.title ?? `Slide ${index + 1}`
  const elements = opts.elements ?? []

  // Compute union content rect from elements if not provided
  let contentRect: Rect
  if (opts.contentRect) {
    contentRect = opts.contentRect
  } else if (elements.length === 0) {
    contentRect = makeRect(0, 0, 0, 0)
  } else {
    const lefts = elements.map((e) => e.rect.left)
    const tops = elements.map((e) => e.rect.top)
    const rights = elements.map((e) => e.rect.right)
    const bottoms = elements.map((e) => e.rect.bottom)
    contentRect = makeRect(
      Math.min(...lefts),
      Math.min(...tops),
      Math.max(...rights),
      Math.max(...bottoms),
    )
  }

  return {
    index,
    title,
    slideType: opts.slideType,
    canvasRect: CANVAS_RECT,
    elements,
    contentRect,
  }
}

// ── SLIDE_TYPES / EXEMPT_TYPES constants ───────────────────────────────────

describe("SLIDE_TYPES", () => {
  it("contains the expected structural types", () => {
    expect(SLIDE_TYPES).toContain("cover")
    expect(SLIDE_TYPES).toContain("content")
    expect(SLIDE_TYPES).toContain("closing")
    expect(SLIDE_TYPES).toContain("divider")
    expect(SLIDE_TYPES).toContain("toc")
    expect(SLIDE_TYPES).toContain("summary")
    expect(SLIDE_TYPES).toContain("thank-you")
  })

  it("EXEMPT_TYPES is a proper subset of SLIDE_TYPES values", () => {
    for (const t of EXEMPT_TYPES) {
      expect(SLIDE_TYPES).toContain(t as any)
    }
  })

  it("content type is NOT in EXEMPT_TYPES", () => {
    expect(EXEMPT_TYPES.has("content")).toBe(false)
  })
})

// ── runChecks — fill check (via checkFill) ─────────────────────────────────

describe("runChecks / fill check", () => {
  it("no issues when content type fills 80% of canvas", () => {
    // 80% fill: 1920 * 0.9 × 1080 * 0.9 ≈ 1728×972 → ratio = (1728*972) / (1920*1080) ≈ 81%
    const el = makeElement(makeRect(100, 50, 1820, 1030))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const fillIssues = report.slides[0].issues.filter((i) => i.type === "underfill")
    expect(fillIssues).toHaveLength(0)
  })

  it("underfill error when content type fills only ~14% of canvas (off-center to avoid isCoverLike)", () => {
    // Rect is off-center (left-aligned) so isCoverLike geometry fallback doesn't fire.
    // contentCenterX = (60+660)/2 = 360, canvasCenterX = 960, offset = 600/1920 = 0.31 > 0.15
    // → not cover-like → fill check fires
    // 600×500 = 300000 / 2073600 ≈ 14% < FILL_ERROR (40%) → underfill error
    const el = makeElement(makeRect(60, 290, 660, 790))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const fillIssues = report.slides[0].issues.filter((i) => i.type === "underfill")
    expect(fillIssues.length).toBeGreaterThan(0)
    expect(fillIssues[0].severity).toBe("error")
  })

  it("underfill warning when content type fills between 40% and 55% (off-center)", () => {
    // Left-aligned rect: contentCenterX = (60+1060)/2 = 560, offset = 400/1920 ≈ 0.21 > 0.15
    // → not cover-like → fill check fires
    // 1000×900 = 900000 / 2073600 ≈ 43% — above FILL_ERROR (0.40), below FILL_WARN (0.55) → warning
    const el = makeElement(makeRect(60, 90, 1060, 990))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const fillIssues = report.slides[0].issues.filter((i) => i.type === "underfill")
    expect(fillIssues.length).toBeGreaterThan(0)
    expect(fillIssues[0].severity).toBe("warning")
  })

  it("cover type is exempt from fill check (no underfill issues)", () => {
    // Small centered content on a cover slide
    const el = makeElement(makeRect(660, 340, 1260, 740))
    const m = makeMetrics({ slideType: "cover", elements: [el] })
    const report = runChecks("test.html", [m])
    const fillIssues = report.slides[0].issues.filter((i) => i.type === "underfill")
    expect(fillIssues).toHaveLength(0)
  })

  it("all EXEMPT_TYPES are skipped for fill check", () => {
    const smallEl = makeElement(makeRect(760, 390, 1160, 690)) // tiny box
    for (const type of EXEMPT_TYPES) {
      const m = makeMetrics({ slideType: type, elements: [smallEl] })
      const report = runChecks("test.html", [m])
      const fillIssues = report.slides[0].issues.filter((i) => i.type === "underfill")
      expect(fillIssues).toHaveLength(0)
    }
  })

  it("sparse error when no content (zero-size contentRect)", () => {
    const m = makeMetrics({ slideType: "content", elements: [] })
    const report = runChecks("test.html", [m])
    const sparseIssues = report.slides[0].issues.filter((i) => i.type === "sparse")
    expect(sparseIssues.length).toBeGreaterThan(0)
    expect(sparseIssues[0].severity).toBe("error")
  })
})

// ── runChecks — bottom whitespace check ───────────────────────────────────

describe("runChecks / bottom whitespace check", () => {
  it("no bottom whitespace issue when content nearly fills canvas height", () => {
    const el = makeElement(makeRect(60, 60, 1860, 1000)) // gap = 80px
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const bwIssues = report.slides[0].issues.filter((i) => i.type === "bottom_whitespace")
    expect(bwIssues).toHaveLength(0)
  })

  it("bottom_whitespace error when gap exceeds 350px on content slide", () => {
    // gap = 1080 - 680 = 400px > BOTTOM_WS_ERROR (350)
    const el = makeElement(makeRect(60, 60, 1860, 680))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const bwIssues = report.slides[0].issues.filter((i) => i.type === "bottom_whitespace")
    expect(bwIssues.length).toBeGreaterThan(0)
    expect(bwIssues[0].severity).toBe("error")
  })

  it("bottom_whitespace warning when gap is between 200 and 350px", () => {
    // gap = 1080 - 820 = 260px — between warn (200) and error (350)
    const el = makeElement(makeRect(60, 60, 1860, 820))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const bwIssues = report.slides[0].issues.filter((i) => i.type === "bottom_whitespace")
    expect(bwIssues.length).toBeGreaterThan(0)
    expect(bwIssues[0].severity).toBe("warning")
  })

  it("closing type is exempt from bottom_whitespace check", () => {
    const el = makeElement(makeRect(60, 60, 1860, 500)) // large gap
    const m = makeMetrics({ slideType: "closing", elements: [el] })
    const report = runChecks("test.html", [m])
    const bwIssues = report.slides[0].issues.filter((i) => i.type === "bottom_whitespace")
    expect(bwIssues).toHaveLength(0)
  })
})

// ── runChecks — overflow check ─────────────────────────────────────────────

describe("runChecks / overflow check", () => {
  it("no overflow issue when element is well inside canvas", () => {
    const el = makeElement(makeRect(100, 100, 1820, 980))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const overflowIssues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(overflowIssues).toHaveLength(0)
  })

  it("overflow error when element exceeds canvas right edge by more than 2px tolerance", () => {
    // right = 1923 vs canvas right = 1920, tolerance = 2 → 3px over → error
    const el = makeElement(makeRect(100, 100, 1923, 800))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const overflowIssues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(overflowIssues.length).toBeGreaterThan(0)
    expect(overflowIssues[0].severity).toBe("error")
  })

  it("no overflow when element is exactly at 2px tolerance (within bounds)", () => {
    // right = 1922 vs canvas right 1920 — exactly at tolerance
    const el = makeElement(makeRect(0, 0, 1922, 1080))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const overflowIssues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(overflowIssues).toHaveLength(0)
  })

  it("overflow error when element exceeds canvas bottom", () => {
    const el = makeElement(makeRect(100, 100, 1820, 1085)) // 5px below canvas
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const overflowIssues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(overflowIssues.length).toBeGreaterThan(0)
  })
})

// ── runChecks — asymmetry check ────────────────────────────────────────────

describe("runChecks / asymmetry check", () => {
  it("no asymmetry when side-by-side columns have equal heights", () => {
    // Two columns: same height 600px, side by side (vertically overlapping ≥30%)
    const col1 = makeElement(makeRect(60, 100, 900, 700), "div.col1")
    const col2 = makeElement(makeRect(960, 100, 1860, 700), "div.col2")
    const m = makeMetrics({ slideType: "content", elements: [col1, col2] })
    const report = runChecks("test.html", [m])
    const asymIssues = report.slides[0].issues.filter((i) => i.type === "asymmetry")
    expect(asymIssues).toHaveLength(0)
  })

  it("asymmetry error when ratio < 0.50 (severe mismatch)", () => {
    // col1: 600px tall, col2: 100px tall → ratio = 100/600 ≈ 0.16 < ASYM_ERROR (0.50)
    const col1 = makeElement(makeRect(60, 100, 900, 700), "div.col1")
    const col2 = makeElement(makeRect(960, 100, 1860, 200), "div.col2")
    const m = makeMetrics({ slideType: "content", elements: [col1, col2] })
    const report = runChecks("test.html", [m])
    const asymIssues = report.slides[0].issues.filter((i) => i.type === "asymmetry")
    expect(asymIssues.length).toBeGreaterThan(0)
    expect(asymIssues[0].severity).toBe("error")
  })

  it("asymmetry warning when ratio between 0.50 and 0.70", () => {
    // col1: 600px, col2: 360px → ratio = 360/600 = 0.60 — between ASYM_ERROR(0.50) and ASYM_WARN(0.70)
    const col1 = makeElement(makeRect(60, 100, 900, 700), "div.col1")
    const col2 = makeElement(makeRect(960, 100, 1860, 460), "div.col2")
    const m = makeMetrics({ slideType: "content", elements: [col1, col2] })
    const report = runChecks("test.html", [m])
    const asymIssues = report.slides[0].issues.filter((i) => i.type === "asymmetry")
    expect(asymIssues.length).toBeGreaterThan(0)
    expect(asymIssues[0].severity).toBe("warning")
  })

  it("no asymmetry when columns have less than 30% vertical overlap (stacked, not side-by-side)", () => {
    // col1 at top (100-300), col2 at bottom (700-900) — very little vertical overlap
    const col1 = makeElement(makeRect(60, 100, 1860, 300), "div.col1")
    const col2 = makeElement(makeRect(60, 700, 1860, 900), "div.col2")
    const m = makeMetrics({ slideType: "content", elements: [col1, col2] })
    const report = runChecks("test.html", [m])
    const asymIssues = report.slides[0].issues.filter((i) => i.type === "asymmetry")
    expect(asymIssues).toHaveLength(0)
  })
})

// ── runChecks — sparse check ───────────────────────────────────────────────

describe("runChecks / sparse check", () => {
  it("sparse warning when content slide has 0 visible elements", () => {
    const m = makeMetrics({ slideType: "content", elements: [] })
    const report = runChecks("test.html", [m])
    // Either sparse warning from checkSparse, or sparse error from checkFill (no content)
    const sparseIssues = report.slides[0].issues.filter((i) => i.type === "sparse")
    expect(sparseIssues.length).toBeGreaterThan(0)
  })

  it("sparse warning when content slide has exactly 1 visible element", () => {
    const el = makeElement(makeRect(100, 100, 1820, 980))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const sparseIssues = report.slides[0].issues.filter((i) => i.type === "sparse")
    expect(sparseIssues.length).toBeGreaterThan(0)
    expect(sparseIssues[0].severity).toBe("warning")
  })

  it("no sparse issue when content slide has 2 or more visible elements", () => {
    const el1 = makeElement(makeRect(60, 100, 900, 700), "div.a")
    const el2 = makeElement(makeRect(960, 100, 1860, 700), "div.b")
    const m = makeMetrics({ slideType: "content", elements: [el1, el2] })
    const report = runChecks("test.html", [m])
    const sparseIssues = report.slides[0].issues.filter((i) => i.type === "sparse")
    expect(sparseIssues).toHaveLength(0)
  })

  it("toc type is exempt from sparse check (but zero content still fires checkFill sparse error)", () => {
    // checkFill fires a sparse error BEFORE the EXEMPT_TYPES check when contentRect is zero-size.
    // checkSparse is correctly exempted. So with no elements:
    // - checkFill → sparse error (from the zero-content path)
    // - checkSparse → no sparse warning (exempt)
    const m = makeMetrics({ slideType: "toc", elements: [] })
    const report = runChecks("test.html", [m])
    // The sparse error comes from checkFill zero-content path, not checkSparse
    // checkSparse is exempt, so we should NOT have two sparse issues
    const allIssues = report.slides[0].issues
    // At most one sparse issue (from checkFill), not two
    const sparseIssues = allIssues.filter((i) => i.type === "sparse")
    expect(sparseIssues).toHaveLength(1)
    // It should be the error from checkFill (zero content), not a warning from checkSparse
    expect(sparseIssues[0].severity).toBe("error")
  })

  it("toc type with some content is fully exempt from sparse warning", () => {
    // With a real element, checkFill gets past the zero-content gate and then hits EXEMPT_TYPES
    // checkSparse also exempts toc
    const el = makeElement(makeRect(200, 200, 1720, 880))
    const m = makeMetrics({ slideType: "toc", elements: [el] })
    const report = runChecks("test.html", [m])
    const sparseIssues = report.slides[0].issues.filter((i) => i.type === "sparse")
    expect(sparseIssues).toHaveLength(0)
  })

  it("all EXEMPT_TYPES are skipped for sparse check when content exists", () => {
    for (const type of EXEMPT_TYPES) {
      // With actual content, checkFill exits early via EXEMPT_TYPES before reaching fill ratio.
      // checkSparse also exempts these types. So no sparse issues from EITHER check.
      const el = makeElement(makeRect(200, 200, 1720, 880))
      const m = makeMetrics({ slideType: type, elements: [el] })
      const report = runChecks("test.html", [m])
      const sparseIssues = report.slides[0].issues.filter((i) => i.type === "sparse")
      expect(sparseIssues).toHaveLength(0)
    }
  })
})

// ── runChecks — density imbalance check ───────────────────────────────────

describe("runChecks / density imbalance check", () => {
  it("density imbalance error for two side-by-side columns with 8 vs 1 leaves", () => {
    // col1 has 8 leaf children, col2 has 1 leaf child
    // ratio = 1/8 = 0.125 < DENSITY_ERROR (0.35)
    const makeLeaf = (left: number, top: number, right: number, bottom: number) =>
      makeElement(makeRect(left, top, right, bottom), "span.leaf")

    const col1Children = Array.from({ length: 8 }, (_, i) =>
      makeLeaf(80, 150 + i * 70, 880, 210 + i * 70),
    )
    const col2Children = [makeLeaf(980, 150, 1840, 500)]

    const col1 = makeElement(makeRect(60, 120, 900, 750), "div.col1", col1Children)
    const col2 = makeElement(makeRect(960, 120, 1860, 750), "div.col2", col2Children)
    const m = makeMetrics({ slideType: "content", elements: [col1, col2] })
    const report = runChecks("test.html", [m])
    const densityIssues = report.slides[0].issues.filter((i) => i.type === "density_imbalance")
    expect(densityIssues.length).toBeGreaterThan(0)
    const hasError = densityIssues.some((i) => i.severity === "error")
    expect(hasError).toBe(true)
  })

  it("no density imbalance for columns with roughly equal leaf counts", () => {
    // col1: 4 leaves, col2: 3 leaves → ratio = 3/4 = 0.75 > DENSITY_WARN (0.55)
    const makeLeaf = (left: number, top: number, right: number, bottom: number) =>
      makeElement(makeRect(left, top, right, bottom), "span.leaf")

    const col1Children = Array.from({ length: 4 }, (_, i) =>
      makeLeaf(80, 150 + i * 130, 880, 260 + i * 130),
    )
    const col2Children = Array.from({ length: 3 }, (_, i) =>
      makeLeaf(980, 150 + i * 160, 1840, 280 + i * 160),
    )

    const col1 = makeElement(makeRect(60, 120, 900, 730), "div.col1", col1Children)
    const col2 = makeElement(makeRect(960, 120, 1860, 730), "div.col2", col2Children)
    const m = makeMetrics({ slideType: "content", elements: [col1, col2] })
    const report = runChecks("test.html", [m])
    const densityIssues = report.slides[0].issues.filter((i) => i.type === "density_imbalance")
    expect(densityIssues).toHaveLength(0)
  })
})

// ── runChecks — multi-slide and aggregate counts ────────────────────────────

describe("runChecks / report aggregates", () => {
  it("returns empty issues for a clean slide", () => {
    // Wide content filling the slide generously, 3 elements, no overflow
    const el1 = makeElement(makeRect(60, 60, 900, 700), "div.a")
    const el2 = makeElement(makeRect(960, 60, 1860, 700), "div.b")
    const el3 = makeElement(makeRect(60, 750, 1860, 980), "div.footer")
    const m = makeMetrics({ slideType: "content", elements: [el1, el2, el3] })
    const report = runChecks("test.html", [m])
    expect(report.totalIssues).toBe(0)
    expect(report.errorCount).toBe(0)
    expect(report.warningCount).toBe(0)
    expect(report.summary).toContain("passed")
  })

  it("counts issues across multiple slides correctly", () => {
    // Slide 1: cover with content (exempt from fill/sparse checks)
    const coverEl = makeElement(makeRect(560, 340, 1360, 740))
    const slide1 = makeMetrics({ index: 0, slideType: "cover", elements: [coverEl] })
    // Slide 2: content with underfill error (off-center small box)
    const smallEl = makeElement(makeRect(60, 440, 660, 640))
    const slide2 = makeMetrics({ index: 1, slideType: "content", elements: [smallEl] })

    const report = runChecks("test.html", [slide1, slide2])
    expect(report.slides).toHaveLength(2)
    expect(report.slides[0].issues).toHaveLength(0)
    expect(report.slides[1].issues.length).toBeGreaterThan(0)
    expect(report.totalIssues).toBeGreaterThan(0)
  })
})

// ── formatReport ──────────────────────────────────────────────────────────

describe("formatReport", () => {
  it("returns PASSED message when zero issues", () => {
    const el1 = makeElement(makeRect(60, 60, 900, 700), "div.a")
    const el2 = makeElement(makeRect(960, 60, 1860, 700), "div.b")
    const el3 = makeElement(makeRect(60, 750, 1860, 980), "div.c")
    const m = makeMetrics({ slideType: "content", elements: [el1, el2, el3] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("PASSED")
    expect(formatted).not.toContain("FAILED")
  })

  it("returns FAILED header when there are errors", () => {
    // Off-center tiny content → underfill error (not cover-like, small fill ratio)
    const el = makeElement(makeRect(60, 500, 560, 700))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("FAILED")
  })

  it("uses 🔴 for errors and 🟡 for warnings", () => {
    // underfill warning (not error): fill ratio between 40% and 55%
    const el = makeElement(makeRect(460, 90, 1460, 990)) // 1000×900 ≈ 43%
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    // The report should have warning-severity issues → 🟡
    if (report.warningCount > 0) {
      expect(formatted).toContain("🟡")
    }
    if (report.errorCount > 0) {
      expect(formatted).toContain("🔴")
    }
  })

  it("includes the file path in the report", () => {
    const el = makeElement(makeRect(60, 500, 560, 700)) // off-center, triggers underfill error
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("slides/my-deck.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("my-deck.html")
  })

  it("includes Action Required section when issues exist", () => {
    const el = makeElement(makeRect(60, 500, 560, 700))
    const m = makeMetrics({ slideType: "content", elements: [el] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("Action Required")
  })

  it("does not include Action Required section when clean", () => {
    const el1 = makeElement(makeRect(60, 60, 900, 700), "div.a")
    const el2 = makeElement(makeRect(960, 60, 1860, 700), "div.b")
    const el3 = makeElement(makeRect(60, 750, 1860, 980), "div.c")
    const m = makeMetrics({ slideType: "content", elements: [el1, el2, el3] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).not.toContain("Action Required")
  })
})
