import { describe, it, expect } from "bun:test"
import { writeFileSync } from "fs"
import { join } from "path"
import { runChecks, formatReport } from "../lib/qa/checks"
import { runComplianceQA } from "../lib/qa/compliance"
import { runComponentContractQA } from "../lib/qa/component-contracts"
import { shouldRunArtifactCompliance } from "../lib/qa/artifact"
import { CANVAS_W, CANVAS_H } from "../lib/qa/measure"
import type { SlideMetrics, ElementInfo, Rect, ScrollbarMetrics, SlideNavigationMetrics } from "../lib/qa/measure"
import type { DesignClassVocabulary, DesignComponentContract } from "../lib/design/designs"
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
    scrollbars?: ScrollbarMetrics
    navigation?: SlideNavigationMetrics
    directSlideCanvasCount?: number
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
    directSlideCanvasCount: opts.directSlideCanvasCount ?? 1,
    canvasRect: CANVAS_RECT,
    slideRect: CANVAS_RECT,
    hasScrollbars: Boolean(opts.scrollbars && Object.values(opts.scrollbars).some(Boolean)),
    scrollbars: opts.scrollbars,
    navigation: opts.navigation,
    elements,
    contentRect,
    contentStats: { bodyTextPoints: 0, contentUnits: elements.length, supportReferences: 0 },
  }
}

function scrollbars(overrides: Partial<ScrollbarMetrics> = {}): ScrollbarMetrics {
  return {
    documentHorizontal: false,
    documentVertical: false,
    bodyHorizontal: false,
    bodyVertical: false,
    slideHorizontal: false,
    slideVertical: false,
    ...overrides,
  }
}

function navigation(overrides: Partial<SlideNavigationMetrics> = {}): SlideNavigationMetrics {
  return {
    totalSlides: 2,
    initialTop: 0,
    initialLeft: 0,
    position: "static",
    visibility: "visible",
    display: "flex",
    ariaHidden: null,
    bodyOverflowY: "visible",
    documentOverflowY: "visible",
    documentScrollHeight: CANVAS_H * 2,
    viewportHeight: CANVAS_H,
    ...overrides,
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

const verticalTimelineContract: DesignComponentContract = {
  component: "roadmap-vertical",
  kind: "structure",
  requiredRootClasses: ["roadmap-vertical"],
  variants: [{
    name: "timeline-journey-vertical",
    requiredDescendantClasses: ["tjv-axis"],
    repeatedItemClass: "tjv-item",
    requiredItemClasses: ["tjv-axis-dot", "tjv-stem", "tjv-tip-dot", "tjv-label"],
    requireAlternatingClasses: ["tjv-item--left", "tjv-item--right"],
  }],
  guidance: "Use the full vertical timeline structure.",
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
  it("requires a direct slide-canvas child", () => {
    const report = runChecks("test.html", [makeMetrics({ directSlideCanvasCount: 0 })])
    const canvas = report.slides[0].issues.find((i) => i.type === "canvas")

    expect(canvas?.severity).toBe("error")
    expect(canvas?.sub).toBe("missing_slide_canvas")
    expect(canvas?.detail).toContain("direct .slide-canvas")
  })

  it("rejects multiple direct slide-canvas children", () => {
    const report = runChecks("test.html", [makeMetrics({ directSlideCanvasCount: 2 })])
    const canvas = report.slides[0].issues.find((i) => i.type === "canvas" && i.sub === "multiple_slide_canvas")

    expect(canvas?.severity).toBe("error")
    expect(canvas?.detail).toContain("exactly one")
  })

  it("requires exact 1920x1080 slide-canvas dimensions", () => {
    const metrics = makeMetrics({ elements: [makeElement(makeRect(100, 100, 500, 300))] })
    metrics.canvasRect = makeRect(0, 0, 1600, 900)
    const report = runChecks("test.html", [metrics])
    const canvas = report.slides[0].issues.find((i) => i.type === "canvas")
    expect(canvas?.severity).toBe("error")
    expect(canvas?.detail).toContain("1920x1080")
  })

  it("allows a viewport-sized slide wrapper when slide-canvas is exactly 1920x1080", () => {
    const metrics = makeMetrics({ elements: [makeElement(makeRect(100, 100, 500, 300))] })
    metrics.slideRect = makeRect(0, 0, 1440, 900)

    const report = runChecks("test.html", [metrics])
    const canvas = report.slides[0].issues.find((i) => i.type === "canvas" && i.sub === "size_mismatch")

    expect(canvas).toBeUndefined()
  })

  it("does not accept smaller fixed-ratio canvases as deck-ready", () => {
    const metrics = makeMetrics({ elements: [makeElement(makeRect(80, 80, 1520, 820))] })
    metrics.slideRect = makeRect(0, 0, 1600, 900)
    metrics.canvasRect = makeRect(0, 0, 1600, 900)

    const report = runChecks("test.html", [metrics])
    const canvas = report.slides[0].issues.find((i) => i.type === "canvas" && i.sub === "size_mismatch")

    expect(canvas?.severity).toBe("error")
    expect(canvas?.detail).toContain("exactly 1920x1080px")
    expect(canvas?.data?.expectedWidth).toBe(CANVAS_W)
    expect(canvas?.data?.expectedHeight).toBe(CANVAS_H)
    expect(canvas?.data?.canvasWidth).toBe(1600)
    expect(canvas?.data?.slideWidth).toBeUndefined()
  })

  it("reports clipped text containers", () => {
    const el = { ...makeElement(makeRect(100, 100, 500, 180), "p.copy"), textOverflow: true, text: "Long clipped copy" }
    const report = runChecks("test.html", [makeMetrics({ elements: [el] })])
    const issue = report.slides[0].issues.find((i) => i.type === "text_overflow")
    expect(issue?.severity).toBe("error")
    expect(issue?.detail).toContain("Long clipped copy")
  })
})

describe("element overlap", () => {
  it("reports large overlap between sibling semantic cards", () => {
    const first = makeElement(makeRect(100, 100, 700, 500), "div.box:nth-child(1)", [], true, ["box"])
    const second = makeElement(makeRect(480, 180, 1080, 580), "div.box:nth-child(2)", [], true, ["box"])

    const report = runChecks("test.html", [makeMetrics({ elements: [first, second] })])
    const issue = report.slides[0].issues.find((item) => item.type === "overlap")

    expect(issue?.sub).toBe("element_collision")
    expect(issue?.severity).toBe("error")
    expect(issue?.detail).toContain("div.box:nth-child(1)")
    expect(issue?.detail).toContain("div.box:nth-child(2)")
    expect(issue?.data?.overlapRatioPct).toBeGreaterThanOrEqual(12)
  })

  it("does not report parent-child containment as overlap", () => {
    const child = makeElement(makeRect(140, 140, 420, 260), "h2.title", [], true, ["title"])
    const parent = makeElement(makeRect(100, 100, 700, 500), "div.box", [child], true, ["box"])

    const report = runChecks("test.html", [makeMetrics({ elements: [parent] })])

    expect(report.slides[0].issues.some((item) => item.type === "overlap")).toBe(false)
  })

  it("does not report hero background text overlays", () => {
    const hero = makeElement(makeRect(0, 0, CANVAS_W, CANVAS_H), "section.hero", [], true, ["hero"])
    const headline = makeElement(makeRect(180, 260, 980, 420), "div.text-panel", [], true, ["text-panel"])

    const report = runChecks("test.html", [makeMetrics({ elements: [hero, headline] })])

    expect(report.slides[0].issues.some((item) => item.type === "overlap")).toBe(false)
  })

  it("ignores edge contact and tiny intersections", () => {
    const touchingA = makeElement(makeRect(100, 100, 500, 300), "div.box:nth-child(1)", [], true, ["box"])
    const touchingB = makeElement(makeRect(500, 100, 900, 300), "div.box:nth-child(2)", [], true, ["box"])
    const tinyA = makeElement(makeRect(100, 400, 500, 700), "div.stat-card:nth-child(1)", [], true, ["stat-card"])
    const tinyB = makeElement(makeRect(490, 690, 900, 990), "div.stat-card:nth-child(2)", [], true, ["stat-card"])

    const report = runChecks("test.html", [makeMetrics({ elements: [touchingA, touchingB, tinyA, tinyB] })])

    expect(report.slides[0].issues.some((item) => item.type === "overlap")).toBe(false)
  })

  it("reports text and media collisions", () => {
    const media = makeElement(makeRect(640, 160, 1480, 760), "figure.media", [], true, ["media"])
    const text = { ...makeElement(makeRect(580, 240, 1180, 640), "div.text-panel", [], true, ["text-panel"]), text: "Market demand evidence" }

    const report = runChecks("test.html", [makeMetrics({ elements: [media, text] })])
    const issue = report.slides[0].issues.find((item) => item.type === "overlap")

    expect(issue?.severity).toBe("error")
    expect(issue?.sub).toBe("element_collision")
  })
})

describe("navigation model", () => {
  it("flags fixed overlay slides hidden with aria-hidden pagination", () => {
    const report = runChecks("test.html", [
      makeMetrics({ index: 0, navigation: navigation({ totalSlides: 2, position: "fixed", initialTop: 0, ariaHidden: "false", bodyOverflowY: "hidden", documentScrollHeight: CANVAS_H }) }),
      makeMetrics({ index: 1, navigation: navigation({ totalSlides: 2, position: "fixed", initialTop: 0, ariaHidden: "true", visibility: "hidden", bodyOverflowY: "hidden", documentScrollHeight: CANVAS_H }) }),
    ])

    const firstIssues = report.slides[0].issues
    expect(firstIssues.some((issue) => issue.type === "navigation" && issue.sub === "fixed_overlay_slides" && issue.severity === "error")).toBe(true)
    expect(firstIssues.some((issue) => issue.type === "navigation" && issue.sub === "hidden_paging" && issue.severity === "error")).toBe(true)
    expect(firstIssues.some((issue) => issue.type === "navigation" && issue.sub === "unreachable_slides" && issue.severity === "error")).toBe(true)
  })

  it("allows normal multi-slide vertical document flow", () => {
    const report = runChecks("test.html", [
      makeMetrics({ index: 0, scrollbars: scrollbars({ documentVertical: true, bodyVertical: true }), navigation: navigation({ totalSlides: 2, initialTop: 0, documentScrollHeight: CANVAS_H * 2 }) }),
      makeMetrics({ index: 1, scrollbars: scrollbars({ documentVertical: true, bodyVertical: true }), navigation: navigation({ totalSlides: 2, initialTop: CANVAS_H, documentScrollHeight: CANVAS_H * 2 }) }),
    ])

    expect(report.slides.flatMap((slide) => slide.issues).some((issue) => issue.type === "navigation")).toBe(false)
    expect(report.slides.flatMap((slide) => slide.issues).some((issue) => issue.type === "scrollbar")).toBe(false)
  })

  it("still flags slide-internal scrollbars", () => {
    const report = runChecks("test.html", [
      makeMetrics({ index: 0, scrollbars: scrollbars({ slideVertical: true }), navigation: navigation({ totalSlides: 2, initialTop: 0 }) }),
      makeMetrics({ index: 1, navigation: navigation({ totalSlides: 2, initialTop: CANVAS_H }) }),
    ])

    expect(report.slides[0].issues.some((issue) => issue.type === "scrollbar" && issue.sub === "page_scroll")).toBe(true)
  })

  it("flags systematic slide-level page_scroll failures on every affected slide", () => {
    const report = runChecks("test.html", [
      makeMetrics({ index: 0, scrollbars: scrollbars({ slideVertical: true }), navigation: navigation({ totalSlides: 3, initialTop: 0, documentScrollHeight: CANVAS_H * 3 }) }),
      makeMetrics({ index: 1, scrollbars: scrollbars({ slideVertical: true }), navigation: navigation({ totalSlides: 3, initialTop: CANVAS_H, documentScrollHeight: CANVAS_H * 3 }) }),
      makeMetrics({ index: 2, scrollbars: scrollbars({ slideVertical: true }), navigation: navigation({ totalSlides: 3, initialTop: CANVAS_H * 2, documentScrollHeight: CANVAS_H * 3 }) }),
    ])

    expect(report.slides).toHaveLength(3)
    for (const slide of report.slides) {
      expect(slide.issues.some((issue) => issue.type === "scrollbar" && issue.sub === "page_scroll" && issue.severity === "error")).toBe(true)
    }
  })
})

describe("static compliance", () => {
  it("skips deck component compliance for design preview files", () => {
    expect(shouldRunArtifactCompliance("/workspace/designs/lucent/preview.html")).toBe(false)
    expect(shouldRunArtifactCompliance("designs\\summit\\preview.html")).toBe(false)
    expect(shouldRunArtifactCompliance("/workspace/output/lucent-preview.html")).toBe(true)
    expect(shouldRunArtifactCompliance("/workspace/designs/lucent/reference.html")).toBe(true)
  })

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

describe("component structure contracts", () => {
  it("flags roadmap-vertical that lacks timeline stem and tip structure", () => {
    const file = htmlFile(`
      <html><body>
        <section class="slide"><div class="slide-canvas">
          <div class="roadmap-vertical" data-preview-component="roadmap-vertical">
            <div class="tjv-axis"></div>
            <div class="vertical-node vertical-node--left">Research</div>
            <div class="vertical-node vertical-node--right">Plan</div>
          </div>
        </div></section>
      </body></html>
    `)

    const report = runComponentContractQA(file, [verticalTimelineContract])
    const issue = report.slides[0].issues.find((i) => i.sub === "component_contract")

    expect(issue?.severity).toBe("error")
    expect(issue?.detail).toContain("roadmap-vertical")
    expect(issue?.data?.variants).toContain("tjv-stem")
    expect(issue?.data?.variants).toContain("tjv-tip-dot")
  })

  it("passes roadmap-vertical with axis, stems, tip dots, labels, and alternating items", () => {
    const file = htmlFile(`
      <html><body>
        <section class="slide"><div class="slide-canvas">
          <div class="roadmap-vertical timeline-journey-vertical" data-preview-component="roadmap-vertical">
            <div class="tjv-axis"></div>
            <div class="tjv-item tjv-item--left" style="top:20%;">
              <div class="tjv-axis-dot"></div><div class="tjv-stem"></div><div class="tjv-tip-dot"></div>
              <div class="tjv-label"><span>Research</span></div>
            </div>
            <div class="tjv-item tjv-item--right" style="top:60%;">
              <div class="tjv-axis-dot"></div><div class="tjv-stem"></div><div class="tjv-tip-dot"></div>
              <div class="tjv-label"><span>Plan</span></div>
            </div>
          </div>
        </div></section>
      </body></html>
    `)

    const report = runComponentContractQA(file, [verticalTimelineContract])

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
