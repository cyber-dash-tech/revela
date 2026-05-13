import { describe, it, expect } from "bun:test"
import { writeFileSync } from "fs"
import { join } from "path"
import { runChecks, formatReport } from "../lib/qa/checks"
import { runComplianceQA } from "../lib/qa/compliance"
import { CANVAS_W, CANVAS_H } from "../lib/qa/measure"
import type { SlideMetrics, ElementInfo, Rect } from "../lib/qa/measure"
import type { DesignClassVocabulary } from "../lib/design/designs"
import { tempWorkspace } from "./helpers/tool-helpers"

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
    contentRect = makeRect(
      Math.min(...elements.map((e) => e.rect.left)),
      Math.min(...elements.map((e) => e.rect.top)),
      Math.max(...elements.map((e) => e.rect.right)),
      Math.max(...elements.map((e) => e.rect.bottom)),
    )
  }

  return {
    index,
    title,
    slideQa,
    canvasRect: CANVAS_RECT,
    slideRect: CANVAS_RECT,
    hasScrollbars: false,
    elements,
    contentRect,
    contentStats: { bodyTextPoints: 0, contentUnits: elements.length, supportReferences: 0 },
  }
}

function htmlFile(html: string): string {
  const root = tempWorkspace("revela-qa-test-")
  const file = join(root, "deck.html")
  writeFileSync(file, html, "utf-8")
  return file
}

const vocabulary: DesignClassVocabulary = {
  classes: new Set(["slide", "slide-canvas", "title", "card", "known-rule"]),
  prefixExemptions: ["lucide-", "echarts-"],
}

describe("overflow", () => {
  it("does not report when elements stay inside canvas", () => {
    const el = makeElement(makeRect(100, 100, 1820, 980))
    const report = runChecks("test.html", [makeMetrics({ slideQa: true, elements: [el] })])
    expect(report.slides[0].issues.filter((i) => i.type === "overflow")).toHaveLength(0)
  })

  it("reports right overflow beyond tolerance", () => {
    const el = makeElement(makeRect(100, 100, 1923, 800))
    const report = runChecks("test.html", [makeMetrics({ slideQa: true, elements: [el] })])
    const issues = report.slides[0].issues.filter((i) => i.type === "overflow")
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].severity).toBe("error")
  })

  it("reports bottom overflow even when slide-qa=false", () => {
    const el = makeElement(makeRect(100, 100, 1820, 1085))
    const report = runChecks("test.html", [makeMetrics({ slideQa: false, elements: [el] })])
    expect(report.slides[0].issues.filter((i) => i.type === "overflow").length).toBeGreaterThan(0)
  })
})

describe("content density", () => {
  it("warns on content slides with too few claim/evidence points", () => {
    const sparse = makeElement(makeRect(60, 60, 260, 160))

    const report = runChecks("test.html", [
      makeMetrics({ index: 0, slideQa: true, elements: [sparse] }),
    ])

    const density = report.slides[0].issues.find((i) => i.type === "density")
    expect(density?.severity).toBe("warning")
    expect(density?.detail).toContain("claim/evidence")
  })

  it("does not warn on non-QA focus slides", () => {
    const sparse = makeElement(makeRect(60, 60, 260, 160))
    const report = runChecks("test.html", [makeMetrics({ slideQa: false, elements: [sparse] })])
    expect(report.slides[0].issues.some((i) => i.type === "density")).toBe(false)
  })
})

describe("canvas and text checks", () => {
  it("requires exact 1920x1080 slide and canvas dimensions", () => {
    const metrics = makeMetrics({ elements: [makeElement(makeRect(100, 100, 500, 300))] })
    metrics.canvasRect = makeRect(0, 0, 1600, 900)
    const report = runChecks("test.html", [metrics])
    const canvas = report.slides[0].issues.find((i) => i.type === "canvas")
    expect(canvas?.severity).toBe("error")
    expect(canvas?.detail).toContain("1920x1080")
  })

  it("reports clipped text containers", () => {
    const el = { ...makeElement(makeRect(100, 100, 500, 180), "p.copy"), textOverflow: true, text: "Long clipped copy" }
    const report = runChecks("test.html", [makeMetrics({ elements: [el] })])
    const issue = report.slides[0].issues.find((i) => i.type === "text_overflow")
    expect(issue?.severity).toBe("error")
    expect(issue?.detail).toContain("Long clipped copy")
  })
})

describe("static compliance", () => {
  it("flags unknown HTML classes on each slide", () => {
    const file = htmlFile(`
      <html><style>.known-rule { color: red; }</style><body>
        <section class="slide"><div class="slide-canvas"><h1 class="title">One</h1><div class="bad-one">A</div></div></section>
        <section class="slide"><div class="slide-canvas"><h2 class="title">Two</h2><div class="bad-two">B</div></div></section>
      </body></html>
    `)

    const report = runComplianceQA(file, vocabulary)

    expect(report.slides[0].issues.some((i) => i.sub === "unknown_class" && i.data?.class === "bad-one")).toBe(true)
    expect(report.slides[1].issues.some((i) => i.sub === "unknown_class" && i.data?.class === "bad-two")).toBe(true)
    const firstIssue = report.slides[0].issues.find((i) => i.data?.class === "bad-one")
    expect(firstIssue?.severity).toBe("error")
    expect(firstIssue?.data?.location).toBe("html_class")
    expect(firstIssue?.data?.excerpt).toContain('<div class="bad-one">')
    expect(typeof firstIssue?.data?.line).toBe("number")
  })

  it("flags unknown classes defined in style blocks", () => {
    const file = htmlFile(`
      <html><style>.known-rule { color: red; } .custom-widget:hover { color: blue; }</style><body>
        <section class="slide"><div class="slide-canvas"><h1 class="title">One</h1></div></section>
      </body></html>
    `)

    const report = runComplianceQA(file, vocabulary)
    const issues = report.slides[0].issues.filter((i) => i.sub === "novel_css_rule")

    expect(issues.some((i) => i.data?.class === "custom-widget")).toBe(true)
    expect(issues.find((i) => i.data?.class === "custom-widget")?.severity).toBe("error")
    expect(issues.find((i) => i.data?.class === "custom-widget")?.data?.location).toBe("style_rule")
    expect(issues.find((i) => i.data?.class === "custom-widget")?.data?.excerpt).toContain(".custom-widget:hover")
  })

  it("respects exempt class prefixes", () => {
    const file = htmlFile(`
      <html><style>.lucide-arrow { width: 1em; } .echarts-tooltip { opacity: 1; }</style><body>
        <section class="slide"><div class="slide-canvas"><i class="lucide-arrow"></i><span class="echarts-label">Text</span></div></section>
      </body></html>
    `)

    const report = runComplianceQA(file, vocabulary)
    expect(report.totalIssues).toBe(0)
  })

  it("flags deck-local editable classes", () => {
    const file = htmlFile(`
      <html><style>.editable-hover { outline: none; }</style><body>
        <section class="slide"><div class="slide-canvas"><span class="editable-label">Text</span></div></section>
      </body></html>
    `)

    const report = runComplianceQA(file, vocabulary)
    expect(report.totalIssues).toBeGreaterThan(0)
    expect(report.slides[0].issues.some((i) => i.data?.class === "editable-hover")).toBe(true)
    expect(report.slides[0].issues.some((i) => i.data?.class === "editable-label")).toBe(true)
  })
})

describe("formatReport", () => {
  it("includes actionable overflow guidance when issues exist", () => {
    const el = makeElement(makeRect(100, 100, 1925, 800))
    const report = runChecks("slides/my-deck.html", [makeMetrics({ elements: [el] })])
    const formatted = formatReport(report)

    expect(formatted).toContain("FAILED")
    expect(formatted).toContain("my-deck.html")
    expect(formatted).toContain("Action Required")
    expect(formatted).toContain("overflow")
  })

  it("uses a compliance-specific report with source context", () => {
    const file = htmlFile(`
      <html><style>.known-rule { color: red; } .custom-widget:hover { color: blue; }</style><body>
        <section class="slide"><div class="slide-canvas"><h1 class="title">One</h1><div class="bad-one">A</div></div></section>
      </body></html>
    `)
    const report = runComplianceQA(file, vocabulary)
    const formatted = formatReport(report)

    expect(formatted).toContain("Static Design Compliance Report")
    expect(formatted).toContain("FAILED")
    expect(formatted).toContain("bad-one")
    expect(formatted).toContain('<div class="bad-one">')
    expect(formatted).toContain("custom-widget")
    expect(formatted).toContain("line")
    expect(formatted).toContain("You must fix the design vocabulary errors above before continuing")
    expect(formatted).toContain("These are static class-name checks, not layout QA failures")
    expect(formatted).toContain("Do not leave unknown classes or custom class selectors")
    expect(formatted).not.toContain("hard-error")
  })
})
