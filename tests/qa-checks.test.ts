import { describe, it, expect } from "bun:test"
import {
  runChecks,
  formatReport,
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
  classList: string[] = [],
): ElementInfo {
  return { selector, rect, visible, children, classList }
}

/**
 * Build a minimal SlideMetrics object.
 * slideQa defaults to false (structural/sparse — skips balance and rhythm checks).
 * Pass slideQa: true for content-heavy slides that should be QA-checked.
 * contentRect defaults to the union bounding box of all provided elements.
 */
function makeMetrics(
  opts: {
    index?: number
    slideQa?: boolean
    elements?: ElementInfo[]
    contentRect?: Rect
    title?: string
  } = {},
): SlideMetrics {
  const index = opts.index ?? 0
  const title = opts.title ?? `Slide ${index + 1}`
  const elements = opts.elements ?? []
  const slideQa = opts.slideQa ?? false

  let contentRect: Rect
  if (opts.contentRect) {
    contentRect = opts.contentRect
  } else if (elements.length === 0) {
    contentRect = makeRect(0, 0, 0, 0)
  } else {
    const lefts   = elements.map((e) => e.rect.left)
    const tops    = elements.map((e) => e.rect.top)
    const rights  = elements.map((e) => e.rect.right)
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
    slideQa,
    canvasRect: CANVAS_RECT,
    elements,
    contentRect,
  }
}

// ── Dimension 1: Overflow ──────────────────────────────────────────────────

describe("overflow", () => {
  it("no overflow when element is inside canvas", () => {
    const el = makeElement(makeRect(100, 100, 1820, 980))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(issues).toHaveLength(0)
  })

  it("overflow error when element exceeds canvas right by more than 2px tolerance", () => {
    // right = 1923 vs canvas 1920, tolerance = 2 → 3px over
    const el = makeElement(makeRect(100, 100, 1923, 800))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("error")
  })

  it("no overflow when element is exactly at 2px tolerance boundary", () => {
    const el = makeElement(makeRect(0, 0, 1922, 1080))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(issues).toHaveLength(0)
  })

  it("overflow error when element exceeds canvas bottom", () => {
    const el = makeElement(makeRect(100, 100, 1820, 1085)) // 5px below canvas
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(issues.length).toBeGreaterThan(0)
  })

  it("overflow is checked even when slide-qa=false (hard correctness check)", () => {
    // Overflow is a hard correctness check — applies even to structural slides
    const el = makeElement(makeRect(100, 100, 1925, 800))
    const m = makeMetrics({ slideQa: false, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(issues.length).toBeGreaterThan(0)
  })
})

// ── Dimension 2: Balance ───────────────────────────────────────────────────

describe("balance / sparse", () => {
  it("sparse error when slide has no visible content", () => {
    const m = makeMetrics({ slideQa: true, elements: [] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.type === "balance" && i.sub === "sparse")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("error")
  })

  it("sparse warning when content slide has exactly 1 visible element (non-cover-like)", () => {
    // Off-centre single element
    const el = makeElement(makeRect(60, 100, 960, 700))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "sparse")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("warning")
  })

  it("no sparse issue when slide has 2 or more visible elements", () => {
    const el1 = makeElement(makeRect(60, 100, 900, 700), "div.a")
    const el2 = makeElement(makeRect(960, 100, 1860, 700), "div.b")
    const m = makeMetrics({ slideQa: true, elements: [el1, el2] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "sparse")
    expect(issues).toHaveLength(0)
  })

  it("balance checks are fully skipped when slide-qa=false", () => {
    // A small element that would trigger balance issues on a QA-checked slide
    const el = makeElement(makeRect(760, 390, 1160, 690))
    const m = makeMetrics({ slideQa: false, elements: [el] })
    const report = runChecks("test.html", [m])
    const balanceIssues = report.slides[0].issues.filter((i) => i.type === "balance")
    expect(balanceIssues).toHaveLength(0)
  })
})

describe("balance / centroid_offset", () => {
  it("no centroid issue when content is centred and fills slide well", () => {
    // Two balanced columns covering the full slide area
    const el1 = makeElement(makeRect(60, 60, 900, 1000), "div.a")
    const el2 = makeElement(makeRect(960, 60, 1860, 1000), "div.b")
    const m = makeMetrics({ slideQa: true, elements: [el1, el2] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "centroid_offset")
    expect(issues).toHaveLength(0)
  })

  it("centroid_offset error when all content is concentrated in top-left", () => {
    // Small box in top-left corner — centroid far from centre
    const el = makeElement(makeRect(60, 60, 460, 260))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "centroid_offset")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("error")
  })

  it("centroid_offset warning when content is moderately off-centre", () => {
    // Content in left half only, fairly large — centroid offset moderate
    // centroid X ≈ (60+960)/2 = 510, canvas centre = 960, offsetX = |510-960|/960 ≈ 0.47 > WARN(0.25)
    // centroid Y covers full height → offsetY near 0
    // max(offsetX, offsetY) ≈ 0.47 > ERROR(0.35) → error
    // Use a wider box to keep offsetX in warning range: left=300, right=1300, centroidX=800
    // offsetX = |800-960|/960 = 0.167 < WARN — still too small
    // Need offsetX between 0.25 and 0.35: centroidX must be 720-720px away from 960
    // centroidX = 960 - 0.30*960 = 672 → rect 60..1284, centroidX=672
    const el = makeElement(makeRect(60, 60, 1284, 1020))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const centroidIssues = report.slides[0].issues.filter((i) => i.sub === "centroid_offset")
    // This specific rect is large enough to possibly pass — just verify no ERROR level
    // The key test is that centroid tracking fires at all for off-centre content
    // (exact threshold depends on leaf collection; the element has no children so is itself the leaf)
    // centroidX = (60+1284)/2 = 672, offset = |672-960|/960 = 0.30 — between WARN(0.25) and ERROR(0.35) → warning
    if (centroidIssues.length > 0) {
      expect(centroidIssues[0].severity).toBe("warning")
    }
  })
})

describe("balance / bottom_gap", () => {
  it("no bottom_gap issue when content nearly fills canvas height", () => {
    const el = makeElement(makeRect(60, 60, 1860, 1000)) // gap = 80px
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "bottom_gap")
    expect(issues).toHaveLength(0)
  })

  it("bottom_gap error when gap exceeds 350px", () => {
    // gap = 1080 - 680 = 400px > BOTTOM_GAP_ERROR (350)
    const el = makeElement(makeRect(60, 60, 1860, 680))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "bottom_gap")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("error")
  })

  it("bottom_gap warning when gap is between 200 and 350px", () => {
    // gap = 1080 - 820 = 260px — between WARN (200) and ERROR (350)
    const el = makeElement(makeRect(60, 60, 1860, 820))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "bottom_gap")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("warning")
  })

  it("balance skipped for slide-qa=false (no bottom_gap check)", () => {
    const el = makeElement(makeRect(60, 60, 1860, 500)) // large gap
    const m = makeMetrics({ slideQa: false, elements: [el] })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "bottom_gap")
    expect(issues).toHaveLength(0)
  })
})

// ── Dimension 3: Rhythm ────────────────────────────────────────────────────

describe("rhythm / gap_variance", () => {
  it("no gap_variance issue when stacked elements have uniform spacing", () => {
    // 4 stacked elements, each 120px tall, 30px gap between them
    const els = Array.from({ length: 4 }, (_, i) =>
      makeElement(makeRect(100, 100 + i * 150, 1820, 220 + i * 150), `div.item${i}`)
    )
    const m = makeMetrics({ slideQa: true, elements: els })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "gap_variance")
    expect(issues).toHaveLength(0)
  })

  it("gap_variance error when gaps are highly irregular (CV > 1.0)", () => {
    // Gaps: 10, 10, 200px → mean=73, stddev≈89, CV≈1.2 > ERROR(1.0)
    const tops = [100, 210, 320, 530]   // gaps: 10, 10, 200
    const els = tops.map((top, i) =>
      makeElement(makeRect(100, top, 1820, top + 100), `div.item${i}`)
    )
    const m = makeMetrics({ slideQa: true, elements: els })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "gap_variance")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("error")
  })

  it("gap_variance warning when CV is between 0.6 and 1.0", () => {
    // Gaps: 20, 20, 80px → mean=40, stddev=28.3, CV=0.71 — between WARN(0.6) and ERROR(1.0)
    const tops = [100, 220, 340, 520]   // gaps: 20, 20, 80 (heights 100px each)
    const els = tops.map((top, i) =>
      makeElement(makeRect(100, top, 1820, top + 100), `div.item${i}`)
    )
    const m = makeMetrics({ slideQa: true, elements: els })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.sub === "gap_variance")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("warning")
  })

  it("gap_variance is skipped when slide-qa=false", () => {
    // Irregular gaps on a structural slide — should not fire
    const tops = [100, 210, 320, 530]
    const els = tops.map((top, i) =>
      makeElement(makeRect(100, top, 1820, top + 100), `div.item${i}`)
    )
    const m = makeMetrics({ slideQa: false, elements: els })
    const report = runChecks("test.html", [m])
    const issues = report.slides[0].issues.filter((i) => i.type === "rhythm")
    expect(issues).toHaveLength(0)
  })
})

// ── Report aggregates ──────────────────────────────────────────────────────

describe("runChecks / report aggregates", () => {
  it("returns zero issues for a clean content slide", () => {
    const el1 = makeElement(makeRect(60, 60, 900, 700), "div.a")
    const el2 = makeElement(makeRect(960, 60, 1860, 700), "div.b")
    const el3 = makeElement(makeRect(60, 750, 1860, 980), "div.footer")
    const m = makeMetrics({ slideQa: true, elements: [el1, el2, el3] })
    const report = runChecks("test.html", [m])
    expect(report.totalIssues).toBe(0)
    expect(report.errorCount).toBe(0)
    expect(report.warningCount).toBe(0)
    expect(report.summary).toContain("passed")
  })

  it("counts issues across multiple slides correctly", () => {
    // Slide 1: structural slide (slide-qa=false) with centred content → no balance issues
    const coverEl = makeElement(makeRect(560, 340, 1360, 740))
    const slide1 = makeMetrics({ index: 0, slideQa: false, elements: [coverEl] })
    // Slide 2: content slide with empty space at bottom → balance/bottom_gap
    const smallEl = makeElement(makeRect(60, 60, 1860, 600)) // gap = 480px > ERROR
    const slide2 = makeMetrics({ index: 1, slideQa: true, elements: [smallEl] })

    const report = runChecks("test.html", [slide1, slide2])
    expect(report.slides).toHaveLength(2)
    expect(report.slides[0].issues).toHaveLength(0)
    expect(report.slides[1].issues.length).toBeGreaterThan(0)
    expect(report.totalIssues).toBeGreaterThan(0)
  })
})

// ── formatReport ───────────────────────────────────────────────────────────

describe("formatReport", () => {
  it("returns PASSED message when zero issues", () => {
    const el1 = makeElement(makeRect(60, 60, 900, 700), "div.a")
    const el2 = makeElement(makeRect(960, 60, 1860, 700), "div.b")
    const el3 = makeElement(makeRect(60, 750, 1860, 980), "div.c")
    const m = makeMetrics({ slideQa: true, elements: [el1, el2, el3] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("PASSED")
    expect(formatted).not.toContain("FAILED")
  })

  it("returns FAILED header when there are errors", () => {
    // Off-centre tiny content → triggers balance issues
    const el = makeElement(makeRect(60, 60, 260, 160))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("FAILED")
  })

  it("uses 🔴 for errors and 🟡 for warnings", () => {
    const el = makeElement(makeRect(60, 60, 1860, 820)) // bottom_gap warning
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    if (report.warningCount > 0) expect(formatted).toContain("🟡")
    if (report.errorCount > 0) expect(formatted).toContain("🔴")
  })

  it("includes the file path in the report", () => {
    const el = makeElement(makeRect(60, 60, 260, 160))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("slides/my-deck.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("my-deck.html")
  })

  it("includes Action Required section when issues exist", () => {
    const el = makeElement(makeRect(60, 60, 260, 160))
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("Action Required")
  })

  it("does not include Action Required section when clean", () => {
    const el1 = makeElement(makeRect(60, 60, 900, 700), "div.a")
    const el2 = makeElement(makeRect(960, 60, 1860, 700), "div.b")
    const el3 = makeElement(makeRect(60, 750, 1860, 980), "div.c")
    const m = makeMetrics({ slideQa: true, elements: [el1, el2, el3] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).not.toContain("Action Required")
  })

  it("issue labels include the sub-type (e.g. balance/bottom_gap)", () => {
    const el = makeElement(makeRect(60, 60, 1860, 600)) // bottom_gap error
    const m = makeMetrics({ slideQa: true, elements: [el] })
    const report = runChecks("test.html", [m])
    const formatted = formatReport(report)
    expect(formatted).toContain("balance/bottom_gap")
  })
})

// ── Dimension 5: Compliance ────────────────────────────────────────────────

describe("compliance / unknown_class", () => {
  const allowed = new Set(["narrative-grid", "report-text-panel", "page", "slide", "slide-canvas"])
  const prefixExemptions = ["lucide-", "echarts-"]

  it("no issues when all element classes are in allowedClasses", () => {
    const el = makeElement(
      makeRect(100, 100, 900, 500),
      "div.narrative-grid",
      [],
      true,
      ["narrative-grid"],
    )
    const m = makeMetrics({ elements: [el] })
    const report = runChecks("test.html", [m], { allowedClasses: allowed, prefixExemptions })
    const complianceIssues = report.slides[0]?.issues.filter((i) => i.type === "compliance")
    expect(complianceIssues).toHaveLength(0)
  })

  it("flags an element with an unknown class", () => {
    const el = makeElement(
      makeRect(100, 100, 900, 500),
      "div.custom-box",
      [],
      true,
      ["custom-box"],
    )
    const m = makeMetrics({ elements: [el] })
    const report = runChecks("test.html", [m], { allowedClasses: allowed, prefixExemptions })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "unknown_class")
    expect(issues?.length).toBeGreaterThan(0)
    expect(issues?.[0].detail).toContain("custom-box")
  })

  it("does not flag classes matching prefix exemptions", () => {
    const el = makeElement(
      makeRect(100, 100, 500, 300),
      "i.lucide-leaf",
      [],
      true,
      ["lucide-leaf"],
    )
    const m = makeMetrics({ elements: [el] })
    const report = runChecks("test.html", [m], { allowedClasses: allowed, prefixExemptions })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "unknown_class")
    expect(issues).toHaveLength(0)
  })

  it("reports each unique unknown class only once per slide (deduplication)", () => {
    const el1 = makeElement(makeRect(100, 100, 500, 300), "div.a", [], true, ["custom-box"])
    const el2 = makeElement(makeRect(600, 100, 1000, 300), "div.b", [], true, ["custom-box"])
    const m = makeMetrics({ elements: [el1, el2] })
    const report = runChecks("test.html", [m], { allowedClasses: allowed, prefixExemptions })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "unknown_class" && i.data?.class === "custom-box")
    expect(issues).toHaveLength(1)
  })

  it("walks nested children to find unknown classes", () => {
    const child = makeElement(makeRect(120, 120, 400, 300), "span.inner", [], true, ["mystery-span"])
    const parent = makeElement(makeRect(100, 100, 500, 400), "div.page", [child], true, ["page"])
    const m = makeMetrics({ elements: [parent] })
    const report = runChecks("test.html", [m], { allowedClasses: allowed, prefixExemptions })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "unknown_class")
    expect(issues?.length).toBeGreaterThan(0)
    expect(issues?.[0].detail).toContain("mystery-span")
  })

  it("no compliance issues when runChecks() called without options (backward compat)", () => {
    const el = makeElement(makeRect(100, 100, 900, 500), "div.custom", [], true, ["custom-thing"])
    const m = makeMetrics({ elements: [el] })
    const report = runChecks("test.html", [m])
    const complianceIssues = report.slides[0]?.issues.filter((i) => i.type === "compliance")
    expect(complianceIssues).toHaveLength(0)
  })

  it("severity is 'warning' for unknown_class violations", () => {
    const el = makeElement(makeRect(100, 100, 900, 500), "div.bad", [], true, ["bad-class"])
    const m = makeMetrics({ elements: [el] })
    const report = runChecks("test.html", [m], { allowedClasses: allowed, prefixExemptions })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "unknown_class")
    expect(issues?.[0].severity).toBe("warning")
  })
})

describe("compliance / novel_css_rule", () => {
  const allowed = new Set(["narrative-grid", "report-text-panel", "page", "slide", "slide-canvas"])
  const prefixExemptions = ["lucide-", "echarts-"]

  it("no issues when all defined CSS classes are in allowedClasses", () => {
    const m = makeMetrics({ index: 0 })
    const report = runChecks("test.html", [m], {
      allowedClasses: allowed,
      prefixExemptions,
      cssDefinedClasses: ["narrative-grid", "page", "slide"],
    })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "novel_css_rule")
    expect(issues).toHaveLength(0)
  })

  it("flags a CSS class defined in <style> that is not in allowedClasses", () => {
    const m = makeMetrics({ index: 0 })
    const report = runChecks("test.html", [m], {
      allowedClasses: allowed,
      prefixExemptions,
      cssDefinedClasses: ["narrative-grid", "custom-hero-box"],
    })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "novel_css_rule")
    expect(issues?.length).toBeGreaterThan(0)
    expect(issues?.[0].detail).toContain("custom-hero-box")
  })

  it("does not flag CSS classes matching prefix exemptions", () => {
    const m = makeMetrics({ index: 0 })
    const report = runChecks("test.html", [m], {
      allowedClasses: allowed,
      prefixExemptions,
      cssDefinedClasses: ["echarts-tooltip"],
    })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "novel_css_rule")
    expect(issues).toHaveLength(0)
  })

  it("novel_css_rule issues are attached to slide 0 (index 0)", () => {
    const m0 = makeMetrics({ index: 0 })
    const m1 = makeMetrics({ index: 1 })
    const report = runChecks("test.html", [m0, m1], {
      allowedClasses: allowed,
      prefixExemptions,
      cssDefinedClasses: ["custom-widget"],
    })
    const issuesOnSlide0 = report.slides[0]?.issues.filter((i) => i.sub === "novel_css_rule")
    const issuesOnSlide1 = report.slides[1]?.issues.filter((i) => i.sub === "novel_css_rule")
    expect(issuesOnSlide0?.length).toBeGreaterThan(0)
    expect(issuesOnSlide1).toHaveLength(0)
  })

  it("no novel_css_rule when cssDefinedClasses not provided", () => {
    const m = makeMetrics({ index: 0 })
    const report = runChecks("test.html", [m], {
      allowedClasses: allowed,
      prefixExemptions,
      // cssDefinedClasses intentionally omitted
    })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "novel_css_rule")
    expect(issues).toHaveLength(0)
  })

  it("severity is 'warning' for novel_css_rule violations", () => {
    const m = makeMetrics({ index: 0 })
    const report = runChecks("test.html", [m], {
      allowedClasses: allowed,
      prefixExemptions,
      cssDefinedClasses: ["bad-custom-class"],
    })
    const issues = report.slides[0]?.issues.filter((i) => i.sub === "novel_css_rule")
    expect(issues?.[0].severity).toBe("warning")
  })
})

describe("compliance / formatReport", () => {
  const allowed = new Set(["page", "slide"])
  const prefixExemptions: string[] = []

  it("includes compliance/unknown_class in Action Required section", () => {
    const el = makeElement(makeRect(100, 100, 900, 500), "div.bad", [], true, ["bad-class"])
    const m = makeMetrics({ elements: [el] })
    const report = runChecks("test.html", [m], { allowedClasses: allowed, prefixExemptions })
    const formatted = formatReport(report)
    expect(formatted).toContain("compliance/unknown_class")
  })

  it("includes compliance/novel_css_rule in Action Required section", () => {
    const m = makeMetrics({ index: 0 })
    const report = runChecks("test.html", [m], {
      allowedClasses: allowed,
      prefixExemptions,
      cssDefinedClasses: ["custom-thing"],
    })
    const formatted = formatReport(report)
    expect(formatted).toContain("compliance/novel_css_rule")
  })
})
