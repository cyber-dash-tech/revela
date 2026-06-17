import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { PAGE_TEMPLATE_CLASSES, builtInPreviewFixtures, getPageTemplateFoundation, getPageTemplateVocabulary, listPageTemplates, renderBuiltInPreviewHtml, renderTemplateScaffold, renderTemplateSlide, validateBoundedTemplateEdit, validatePageTemplateContracts } from "../lib/page-templates"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("page templates", () => {
  it("exposes fifteen renderable built-in page templates", () => {
    const listed = listPageTemplates()

    expect(listed.templates.map((template) => template.id)).toEqual([
      "cover",
      "section-divider",
      "closing",
      "agenda",
      "executive-summary",
      "problem-context",
      "key-message-evidence",
      "claim-supporting-visual",
      "metric-highlight",
      "chart-takeaways",
      "table-comparison",
      "timeline-roadmap",
      "process-steps",
      "recommendation-decision",
      "risks-tradeoffs",
    ])
    expect(listed.templates.every((template) => template.status === "renderable")).toBe(true)
    expect(listed.templates[0]).toHaveProperty("vocabulary")
  })

  it("exposes template foundation and machine vocabulary", () => {
    const foundation = getPageTemplateFoundation("timeline-roadmap")
    const vocabulary = getPageTemplateVocabulary("timeline-roadmap")

    expect(foundation.html).toContain('data-template="timeline-roadmap"')
    expect(foundation.cssHooks).toContain("template-timeline")
    expect(foundation.slots.map((slot) => slot.name)).toContain("timeline")
    expect(vocabulary.requiredClasses).toContain("template-timeline-dot")
    expect(vocabulary.contractNotes.join("\n")).toContain("dot and copy")
    expect(PAGE_TEMPLATE_CLASSES).toContain("template-visual-slot-panel")
  })

  it("renders scaffold slides from minimal seed content", () => {
    const rendered = renderTemplateScaffold({
      templateId: "claim-supporting-visual",
      slideIndex: 2,
      designName: "lucent",
      seed: { title: "Scaffold claim" },
    })

    expect(rendered.scaffold).toBe(true)
    expect(rendered.html).toContain('data-template-slot="claim"')
    expect(rendered.html).toContain('data-template-slot="visual"')
    expect(rendered.html).toContain("Replace with one visual claim.")
  })

  it("keeps the tracked built-in preview generated from template fixtures", () => {
    const previewPath = join(import.meta.dir, "..", "lib", "page-templates", "built-in-preview.html")
    const tracked = readFileSync(previewPath, "utf-8")
    const generated = renderBuiltInPreviewHtml()

    expect(builtInPreviewFixtures()).toHaveLength(16)
    expect(builtInPreviewFixtures().filter((fixture) => fixture.templateId === "timeline-roadmap")).toHaveLength(2)
    expect(tracked).toBe(generated)
  })

  it("renders timeline milestones with dot and copy anchored in each item", () => {
    const rendered = renderTemplateSlide({
      templateId: "timeline-roadmap",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Timeline",
        milestones: [
          { date: "Mar 2019", label: "Launch", description: "Baseline mapping." },
          { date: "Nov 2019", label: "Audit", description: "Evidence sprint." },
          { date: "May 2020", label: "Scale", description: "Operating cadence." },
        ],
      },
    })

    expect(rendered.html.match(/template-timeline-item/g)).toHaveLength(3)
    expect(rendered.html.match(/template-timeline-dot/g)).toHaveLength(3)
    expect(rendered.html.match(/template-timeline-copy/g)).toHaveLength(3)
  })

  it("renders horizontal timeline milestones as existing template cards with one highlighted item", () => {
    const rendered = renderTemplateSlide({
      templateId: "timeline-roadmap",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Timeline",
        orientation: "horizontal",
        milestones: [
          { date: "2022", label: "Signal", description: "Starting point." },
          { date: "2023", label: "Proof", description: "Evidence threshold." },
          { date: "2024", label: "Inflection", description: "Pivotal moment." },
          { date: "2025", label: "Scale", description: "Operating cadence.", highlight: true },
          { date: "2026", label: "Decision", description: "Next move." },
        ],
      },
    })

    expect(rendered.html).toContain("template-timeline--horizontal")
    expect(rendered.html.match(/<article class="template-timeline-item/g)).toHaveLength(5)
    expect(rendered.html.match(/template-timeline-copy template-card/g)).toHaveLength(5)
    expect(rendered.html.match(/data-lucide="scan-search"/g)).toHaveLength(5)
    expect(rendered.html).not.toContain("template-timeline-card-icon")
    expect(rendered.html).toContain("template-timeline-item--highlight")
    expect(rendered.html).toContain("<h3>Scale</h3>")
    expect(rendered.html).toContain("2026")
  })

  it("renders timeline insight as a left-side template text panel by default", () => {
    const rendered = renderTemplateSlide({
      templateId: "timeline-roadmap",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Timeline",
        orientation: "vertical",
        insightTitle: "Reading the journey",
        insightBody: "Explain why the milestones matter.",
        milestones: [
          { date: "Mar 2019", label: "Launch", description: "Baseline mapping." },
          { date: "Nov 2019", label: "Audit", description: "Evidence sprint." },
          { date: "May 2020", label: "Scale", description: "Operating cadence." },
        ],
      },
    })

    expect(rendered.html).toContain("template-timeline-layout--left")
    expect(rendered.html).toContain("template-text-panel")
    expect(rendered.html).toContain("Reading the journey")
    expect(rendered.html).not.toContain("template-timeline-copy template-card")
  })

  it("keeps explicit right-side timeline insight placement available", () => {
    const rendered = renderTemplateSlide({
      templateId: "timeline-roadmap",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Timeline",
        orientation: "vertical",
        insightTitle: "Reading the journey",
        insightBody: "Explain why the milestones matter.",
        insightSide: "right",
        milestones: [
          { date: "Mar 2019", label: "Launch", description: "Baseline mapping." },
          { date: "Nov 2019", label: "Audit", description: "Evidence sprint." },
        ],
      },
    })

    expect(rendered.html).toContain("template-timeline-layout--right")
  })

  it("renders optional metric insight only when insight body is provided", () => {
    const baseContent = {
      title: "Metrics",
      metrics: [
        { value: "67%", label: "Adoption", description: "Primary signal." },
        { value: "3x", label: "Speed", description: "Comparison signal." },
        { value: "14d", label: "Window", description: "Time bound." },
      ],
    }

    const withoutInsight = renderTemplateSlide({
      templateId: "metric-highlight",
      slideIndex: 1,
      designName: "lucent",
      content: baseContent,
    })
    const withInsight = renderTemplateSlide({
      templateId: "metric-highlight",
      slideIndex: 1,
      designName: "lucent",
      content: {
        ...baseContent,
        insightTitle: "Read the signal",
        insightBody: "Use the row to explain decision implication.",
      },
    })

    expect(withoutInsight.html).not.toContain("template-metric-layout")
    expect(withInsight.html).toContain("template-metric-layout--insight-bottom")
    expect(withInsight.html).toContain("template-insight-panel")
    expect(withInsight.html).toContain("Read the signal")
  })

  it("renders executive summary cards with visual placeholders", () => {
    const rendered = renderTemplateSlide({
      templateId: "executive-summary",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Executive summary",
        items: [
          { label: "Decision", description: "Ready to select." },
          { label: "Risk", description: "Bounded by gates." },
          { label: "Next step", description: "Narrow pilot." },
        ],
      },
    })

    expect(rendered.html.match(/class="template-visual-placeholder"/g)).toHaveLength(3)
    expect(rendered.html).toContain("image / chart slot (optional)")
  })

  it("renders process step cards with visual placeholders", () => {
    const rendered = renderTemplateSlide({
      templateId: "process-steps",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Process",
        steps: [
          { label: "Choose", description: "Select the right template." },
          { label: "Fill", description: "Add content fields." },
          { label: "QA", description: "Check before export." },
        ],
      },
    })

    expect(rendered.html.match(/class="template-visual-placeholder"/g)).toHaveLength(3)
    expect(rendered.html).toContain("image / chart slot (optional)")
  })

  it("renders key message and evidence as distinct template regions", () => {
    const rendered = renderTemplateSlide({
      templateId: "key-message-evidence",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Key message",
        claim: "Structure before style.",
        body: "The key message stays prominent.",
        items: [
          { label: "Evidence 1", description: "First support point." },
          { label: "Evidence 2", description: "Second support point." },
          { label: "Evidence 3", description: "Third support point." },
        ],
      },
    })

    expect(rendered.html).toContain("template-key-message-panel")
    expect(rendered.html).toContain("template-key-message-kicker")
    expect(rendered.html).toContain("template-evidence-grid")
    expect(rendered.html.match(/template-evidence-card/g)).toHaveLength(3)
    expect(rendered.html).not.toContain("Structure before style.")
  })

  it("renders metric insight with a lucide icon hook", () => {
    const rendered = renderTemplateSlide({
      templateId: "metric-highlight",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Metrics",
        insightTitle: "Read the signal",
        insightIcon: "scan-search",
        insightBody: "Use the row to explain decision implication.",
        metrics: [
          { value: "67%", label: "Adoption", description: "Primary signal." },
          { value: "3x", label: "Speed", description: "Comparison signal." },
          { value: "14d", label: "Window", description: "Time bound." },
        ],
      },
    })

    expect(rendered.html).toContain("template-insight-panel")
    expect(rendered.html).toContain('data-lucide="scan-search"')
  })

  it("renders chart takeaways inside one text panel", () => {
    const rendered = renderTemplateSlide({
      templateId: "chart-takeaways",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Chart takeaways",
        takeawaysTitle: "What to read",
        items: [
          { label: "Trend", description: "Read movement." },
          { label: "Driver", description: "Name the likely reason." },
          { label: "Decision use", description: "Tie chart to action." },
        ],
      },
    })

    expect(rendered.html).toContain("template-chart-takeaway-panel")
    expect(rendered.html).toContain("template-chart-layout")
    expect(rendered.html).toContain("template-visual-slot-panel")
    expect(rendered.html).toContain("template-visual-slot-label")
    expect(rendered.html).not.toContain("template-visual-placeholder")
    expect(rendered.html.match(/template-chart-takeaway-item/g)).toHaveLength(3)
    expect(rendered.html.match(/template-card/g) ?? []).toHaveLength(0)
  })

  it("renders claim supporting visual with the shared optional visual slot", () => {
    const rendered = renderTemplateSlide({
      templateId: "claim-supporting-visual",
      slideIndex: 1,
      designName: "lucent",
      content: {
        title: "Claim visual",
        claim: "One visual carries one argument.",
        body: "The placeholder reserves the visual region.",
      },
    })

    expect(rendered.html).toContain("template-chart-panel")
    expect(rendered.html).toContain("template-claim-text-panel")
    expect(rendered.html).toContain("template-visual-slot-panel")
    expect(rendered.html).not.toContain("template-visual-placeholder")
    expect(rendered.html).toContain("image / chart slot (optional)")
  })

  it("flags broken timeline template contracts", () => {
    const root = tempWorkspace("revela-page-template-contract-")
    mkdirSync(join(root, "decks"), { recursive: true })
    const filePath = join(root, "decks/broken.html")
    writeFileSync(filePath, `
<section class="slide template-slide" data-slide-index="1" data-template="timeline-roadmap">
  <div class="slide-canvas">
    <div class="template-timeline">
      <article class="template-timeline-item"><span class="template-timeline-dot"></span></article>
    </div>
  </div>
</section>
`, "utf-8")

    const report = validatePageTemplateContracts(filePath)

    expect(report.ok).toBe(false)
    expect(report.issues.map((issue) => issue.message).join("\n")).toContain("missing .template-timeline-copy")
  })

  it("flags bounded edits that change slides outside the target", () => {
    const first = renderTemplateScaffold({
      templateId: "claim-supporting-visual",
      slideIndex: 1,
      designName: "lucent",
      seed: { title: "First" },
    }).html
    const second = renderTemplateScaffold({
      templateId: "chart-takeaways",
      slideIndex: 2,
      designName: "lucent",
      seed: { title: "Second" },
    }).html
    const before = `${first}\n${second}`
    const validAfter = before.replace("Replace with one visual claim.", "A bounded edit stays inside the target slide.")
    const invalidAfter = validAfter.replace("Second", "Changed outside target")

    const valid = validateBoundedTemplateEdit({ beforeHtml: before, afterHtml: validAfter, slideIndex: 1 })
    const invalid = validateBoundedTemplateEdit({ beforeHtml: before, afterHtml: invalidAfter, slideIndex: 1 })

    expect(valid.ok).toBe(true)
    expect(invalid.ok).toBe(false)
    expect(invalid.issues.map((issue) => issue.message).join("\n")).toContain("outside the target slide")
  })
})
