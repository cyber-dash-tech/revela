import { describe, it, expect } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { runChecks, formatReport } from "../lib/qa/checks"
import { runComplianceQA } from "../lib/qa/compliance"
import { CANVAS_W, CANVAS_H } from "../lib/qa/measure"
import type { SlideMetrics, ElementInfo, Rect } from "../lib/qa/measure"
import type { DesignClassVocabulary } from "../lib/design/designs"

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

  return { index, title, slideQa, canvasRect: CANVAS_RECT, elements, contentRect }
}

function htmlFile(html: string): string {
  const root = mkdtempSync(join(tmpdir(), "revela-qa-test-"))
  const file = join(root, "deck.html")
  writeFileSync(file, html, "utf-8")
  return file
}

const vocabulary: DesignClassVocabulary = {
  classes: new Set(["slide", "slide-canvas", "title", "card", "known-rule"]),
  prefixExemptions: ["lucide-", "echarts-", "editable-"],
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

describe("disabled soft geometry checks", () => {
  it("does not report balance or rhythm issues in the default QA path", () => {
    const sparse = makeElement(makeRect(60, 60, 260, 160))
    const irregular = [100, 210, 320, 530].map((top, i) =>
      makeElement(makeRect(100, top, 1820, top + 100), `div.item${i}`)
    )

    const report = runChecks("test.html", [
      makeMetrics({ index: 0, slideQa: true, elements: [sparse] }),
      makeMetrics({ index: 1, slideQa: true, elements: irregular }),
    ])

    expect(report.totalIssues).toBe(0)
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
    expect(issues.find((i) => i.data?.class === "custom-widget")?.data?.location).toBe("style_rule")
    expect(issues.find((i) => i.data?.class === "custom-widget")?.data?.excerpt).toContain(".custom-widget:hover")
  })

  it("respects exempt class prefixes", () => {
    const file = htmlFile(`
      <html><style>.lucide-arrow { width: 1em; } .editable-hover { outline: none; }</style><body>
        <section class="slide"><div class="slide-canvas"><i class="lucide-arrow"></i><span class="editable-label">Text</span></div></section>
      </body></html>
    `)

    const report = runComplianceQA(file, vocabulary)
    expect(report.totalIssues).toBe(0)
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
    expect(formatted).toContain("bad-one")
    expect(formatted).toContain('<div class="bad-one">')
    expect(formatted).toContain("custom-widget")
    expect(formatted).toContain("line")
    expect(formatted).toContain("These are static class-name checks, not layout QA failures")
    expect(formatted).not.toContain("hard-error")
  })
})
