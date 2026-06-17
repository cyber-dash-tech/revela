import { existsSync, readFileSync, writeFileSync } from "fs"
import { isAbsolute, normalize, resolve } from "path"
import { getPageTemplateVocabulary } from "./vocabulary"

export type PageTemplateStatus = "metadata-only" | "renderable"

export interface PageTemplateField {
  name: string
  type: "string" | "string[]" | "items[]" | "metrics[]" | "milestones[]" | "rows[]" | "steps[]"
  required?: boolean
  description: string
}

export interface PageTemplateDefinition {
  id: string
  title: string
  purpose: string
  status: PageTemplateStatus
  fields: PageTemplateField[]
  contentRules: string[]
  qaRules: string[]
}

export interface RenderTemplateSlideInput {
  templateId: string
  slideIndex: number
  content: Record<string, any>
  designName?: string
}

export interface RenderTemplateScaffoldInput {
  templateId: string
  slideIndex: number
  seed?: Record<string, any>
  designName?: string
}

export interface RenderTemplateSlideResult {
  ok: true
  templateId: string
  slideIndex: number
  designName: string
  html: string
  warnings: string[]
}

export interface RenderTemplateScaffoldResult extends RenderTemplateSlideResult {
  scaffold: true
}

export interface AddTemplateSlideInput extends RenderTemplateSlideInput {
  workspaceRoot: string
  outputPath: string
}

export interface AddTemplateScaffoldInput extends RenderTemplateScaffoldInput {
  workspaceRoot: string
  outputPath: string
}

export interface AddTemplateSlideResult extends RenderTemplateSlideResult {
  outputPath: string
  inserted: boolean
}

export interface AddTemplateScaffoldResult extends RenderTemplateScaffoldResult {
  outputPath: string
  inserted: boolean
}

export interface PageTemplateContractIssue {
  severity: "error" | "warning"
  templateId: string
  slideIndex?: number
  message: string
}

export interface PageTemplateContractReport {
  ok: boolean
  issues: PageTemplateContractIssue[]
}

export interface BoundedTemplateEditInput {
  beforeHtml: string
  afterHtml: string
  slideIndex: number
}

const templates: PageTemplateDefinition[] = [
  define("cover", "Cover", "Open the deck with one clear artifact title and context.", [
    field("eyebrow", "string", "Small context label."),
    field("title", "string", "Deck title.", true),
  ], ["Use one dominant title.", "Keep source/evidence details out of the cover."], ["Has one h1.", "Uses hero structure."]),
  define("section-divider", "Section Divider", "Mark a chapter transition with a short label and thesis.", [
    field("eyebrow", "string", "Chapter label."),
    field("title", "string", "Section title.", true),
  ], ["Use between chapters only."], ["Has one h1.", "Counts as structural."]),
  define("closing", "Closing", "End with the final decision, ask, or next action.", [
    field("title", "string", "Closing line.", true),
  ], ["Keep the close concise."], ["Has one h1.", "Uses closing/hero structure."]),
  define("agenda", "Agenda / TOC", "Orient the audience to the deck flow.", [
    field("title", "string", "Agenda title.", true),
    field("items", "items[]", "Agenda items.", true),
  ], ["Use 3-6 items."], ["Numbers are in DOM order."]),
  define("executive-summary", "Executive Summary", "Compress the decision logic into a few takeaways.", [
    field("title", "string", "Slide title.", true),
    field("items", "items[]", "Summary takeaways.", true),
  ], ["Use 3-4 takeaways.", "Each takeaway needs a short label and support line."], ["Contains summary cards."]),
  define("problem-context", "Problem / Context", "Frame why the topic matters now.", [
    field("title", "string", "Slide title.", true),
    field("body", "string", "Context paragraph.", true),
    field("items", "items[]", "Context bullets."),
  ], ["Separate situation from implication."], ["Main message remains outside cards."]),
  define("key-message-evidence", "Key Message + Evidence", "State a claim and show the supporting evidence items.", [
    field("title", "string", "Claim title.", true),
    field("body", "string", "Claim explanation.", true),
    field("items", "items[]", "Evidence items.", true),
  ], ["Evidence cards must not invent unsupported facts."], ["Has claim and evidence region."]),
  define("claim-supporting-visual", "Claim + Supporting Visual", "Pair a claim with one visual or diagram placeholder.", [
    field("title", "string", "Claim title.", true),
    field("body", "string", "Claim explanation.", true),
    field("visualTitle", "string", "Visual label."),
    field("items", "items[]", "Visual callouts."),
  ], ["Use for one visual argument, not many unrelated facts."], ["Visual region is present."]),
  define("metric-highlight", "Metric Highlight", "Let one or more metrics carry the page.", [
    field("title", "string", "Slide title.", true),
    field("metrics", "metrics[]", "Metric cards.", true),
    field("body", "string", "Interpretation."),
    field("insightTitle", "string", "Insight panel title."),
    field("insightBody", "string", "Metric interpretation, reading note, or caveat."),
    field("insightIcon", "string", "Lucide icon name for the insight title."),
    field("insightPosition", "string", "top or bottom insight panel placement."),
  ], ["Every number needs an interpretation line."], ["Metric values are not hidden in body copy."]),
  define("chart-takeaways", "Chart + Takeaways", "Reserve space for a chart and explain what to read from it.", [
    field("title", "string", "Slide title.", true),
    field("chartTitle", "string", "Chart title."),
    field("takeawaysTitle", "string", "Title for the interpretation text panel."),
    field("items", "items[]", "Takeaways.", true),
  ], ["Chart area must be explicit and bounded."], ["Chart panel and takeaways both exist."]),
  define("table-comparison", "Table / Comparison", "Compare options, segments, or facts in a structured table.", [
    field("title", "string", "Slide title.", true),
    field("columns", "string[]", "Column labels.", true),
    field("rows", "rows[]", "Table rows.", true),
    field("insightTitle", "string", "Insight panel title."),
    field("insightBody", "string", "Interpretation, reading note, or caveat below the table."),
    field("insightIcon", "string", "Lucide icon name for the insight title."),
  ], ["Keep rows scannable.", "Do not use a table for pure prose."], ["Table has headers and body rows."]),
  define("timeline-roadmap", "Timeline / Roadmap", "Show dated phases, milestones, or journey steps.", [
    field("title", "string", "Slide title.", true),
    field("orientation", "string", "horizontal or vertical."),
    field("milestones", "milestones[]", "Timeline milestones.", true),
    field("insightTitle", "string", "Side panel title."),
    field("insightBody", "string", "Timeline interpretation, so-what, or caveat."),
    field("insightSide", "string", "left or right side panel placement."),
  ], ["Use 3-6 milestones.", "Each dot belongs to the same DOM item as its copy."], ["Timeline root exists.", "Every milestone has dot and copy.", "Dot and copy are sibling anchors inside one timeline item."]),
  define("process-steps", "Process / Steps", "Show a short ordered process or execution sequence.", [
    field("title", "string", "Slide title.", true),
    field("steps", "steps[]", "Ordered steps.", true),
  ], ["Use 3-5 steps.", "Each step starts with an action."], ["Steps are numbered in DOM order."]),
  define("recommendation-decision", "Recommendation / Decision / Ask", "Make the requested decision and explain rationale and next steps.", [
    field("title", "string", "Slide title.", true),
    field("recommendation", "string", "Recommended action.", true),
    field("image", "string", "Optional image card path for the recommendation panel."),
    field("imageAlt", "string", "Optional image alt text."),
    field("imageCaption", "string", "Optional image caption."),
    field("items", "items[]", "Rationale points."),
    field("steps", "steps[]", "Next steps."),
  ], ["State the ask plainly.", "Separate rationale from next steps."], ["Recommendation panel exists.", "Next steps are ordered."]),
  define("risks-tradeoffs", "Risks / Caveats / Tradeoffs", "Keep limitations and tradeoffs visible.", [
    field("title", "string", "Slide title.", true),
    field("items", "items[]", "Risks or caveats.", true),
  ], ["Name uncertainty instead of hiding it."], ["Contains risk/tradeoff cards."]),
]

export function listPageTemplates(): { ok: true; templates: PageTemplateDefinition[] } {
  return {
    ok: true,
    templates: templates.map((template) => ({
      ...template,
      vocabulary: getPageTemplateVocabulary(template.id),
    } as PageTemplateDefinition & { vocabulary: ReturnType<typeof getPageTemplateVocabulary> })),
  }
}

export function renderTemplateSlide(input: RenderTemplateSlideInput): RenderTemplateSlideResult {
  const template = getPageTemplate(input.templateId)
  const slideIndex = positiveIndex(input.slideIndex)
  const content = input.content ?? {}
  const designName = input.designName || "lucent"
  const warnings = validateRequiredFields(template, content)
  const html = renderSlideShell({
    template,
    slideIndex,
    designName,
    title: stringValue(content.title) || template.title,
    body: renderBody(template.id, content),
  })
  return { ok: true, templateId: template.id, slideIndex, designName, html, warnings }
}

export function addTemplateSlide(input: AddTemplateSlideInput): AddTemplateSlideResult {
  const outputPath = normalizeOutputPath(input.outputPath)
  const targetPath = resolve(input.workspaceRoot, outputPath)
  if (!existsSync(targetPath)) throw new Error(`Deck HTML does not exist: ${outputPath}. Create the deck foundation before adding template slides.`)
  const rendered = renderTemplateSlide(input)
  const html = readFileSync(targetPath, "utf-8")
  const markers = deckFoundationMarkers()
  if (!html.includes(markers.start) || !html.includes(markers.end)) throw new Error(`Deck HTML is missing Revela slide markers: ${outputPath}`)
  const withSlide = html.replace(markers.end, `${rendered.html}\n    ${markers.end}`)
  const next = rendered.html.includes("data-lucide=") ? ensureInlineLucideRuntime(withSlide) : withSlide
  writeFileSync(targetPath, next, "utf-8")
  return { ...rendered, outputPath, inserted: true }
}

export function renderTemplateScaffold(input: RenderTemplateScaffoldInput): RenderTemplateScaffoldResult {
  const seed = scaffoldSeed(input.templateId, input.seed ?? {})
  const rendered = renderTemplateSlide({
    templateId: input.templateId,
    slideIndex: input.slideIndex,
    content: seed,
    designName: input.designName,
  })
  return { ...rendered, scaffold: true }
}

export function addTemplateScaffold(input: AddTemplateScaffoldInput): AddTemplateScaffoldResult {
  const outputPath = normalizeOutputPath(input.outputPath)
  const targetPath = resolve(input.workspaceRoot, outputPath)
  if (!existsSync(targetPath)) throw new Error(`Deck HTML does not exist: ${outputPath}. Create the deck foundation before adding template slides.`)
  const rendered = renderTemplateScaffold(input)
  const html = readFileSync(targetPath, "utf-8")
  const markers = deckFoundationMarkers()
  if (!html.includes(markers.start) || !html.includes(markers.end)) throw new Error(`Deck HTML is missing Revela slide markers: ${outputPath}`)
  const withSlide = html.replace(markers.end, `${rendered.html}\n    ${markers.end}`)
  const next = rendered.html.includes("data-lucide=") ? ensureInlineLucideRuntime(withSlide) : withSlide
  writeFileSync(targetPath, next, "utf-8")
  return { ...rendered, outputPath, inserted: true }
}

function deckFoundationMarkers(): { start: string; end: string } {
  return { start: "<!-- revela-slides:start -->", end: "<!-- revela-slides:end -->" }
}

function normalizeOutputPath(outputPath: string): string {
  const trimmed = String(outputPath || "").trim()
  if (!trimmed) throw new Error("outputPath is required")
  if (!trimmed.endsWith(".html")) throw new Error("Deck outputPath must end in .html")
  if (isAbsolute(trimmed)) throw new Error("Deck outputPath must be workspace-relative")
  const segments = trimmed.split(/[\\/]+/)
  if (segments.includes("..")) throw new Error("Deck outputPath must not contain parent-directory traversal")
  return normalize(trimmed).replace(/\\/g, "/")
}

export function templateDeckCss(input: { designName?: string; designAssetBasePath?: string } = {}): string {
  const designName = input.designName || "lucent"
  const assetBasePath = input.designAssetBasePath
  const lucentCoverBackground = designName === "lucent" && assetBasePath ? cssUrl(`${assetBasePath}/cover-background.jpg`) : ""
  const lucentClosingBackground = designName === "lucent" && assetBasePath ? cssUrl(`${assetBasePath}/closing-background.jpg`) : ""
  const lucentCoverBackgroundCss = lucentCoverBackground ? `
.template-slide[data-design="lucent"][data-template="cover"] .slide-canvas {
  background:
    linear-gradient(90deg, rgba(7,17,31,0.82), rgba(7,17,31,0.42) 52%, rgba(7,17,31,0.24)),
    url("${lucentCoverBackground}") center center / cover no-repeat;
}
.template-slide[data-design="lucent"][data-template="agenda"] .slide-canvas {
  background:
    linear-gradient(90deg, rgba(7,17,31,0.86), rgba(7,17,31,0.58) 52%, rgba(7,17,31,0.32)),
    url("${lucentCoverBackground}") center center / cover no-repeat;
}
.template-slide[data-design="lucent"][data-template="section-divider"] .slide-canvas {
  background:
    linear-gradient(90deg, rgba(7,17,31,0.86), rgba(16,26,43,0.62) 58%, rgba(36,58,115,0.36)),
    url("${lucentCoverBackground}") center center / cover no-repeat;
}` : ""
  const lucentClosingBackgroundCss = lucentClosingBackground ? `
.template-slide[data-design="lucent"][data-template="closing"] .slide-canvas {
  background:
    linear-gradient(90deg, rgba(7,17,31,0.82), rgba(49,94,234,0.42) 58%, rgba(24,168,216,0.24)),
    url("${lucentClosingBackground}") center center / cover no-repeat;
}` : ""
  return `
* { box-sizing: border-box; }
html { scroll-snap-type: y mandatory; overflow-y: scroll; height: 100%; }
body { margin: 0; background: var(--bg-frame, #07111f); color: var(--text-primary, #101a2b); font-family: var(--font-body, Arial, sans-serif); -webkit-font-smoothing: antialiased; }
.slide { min-height: 100dvh; scroll-snap-align: start; display: flex; align-items: center; justify-content: center; overflow: hidden; background: var(--bg-frame, #07111f); }
.slide-canvas { width: 1920px; height: 1080px; flex-shrink: 0; transform-origin: center center; position: relative; overflow: hidden; }
.template-slide .slide-canvas {
  background:
    radial-gradient(circle at 82% 16%, rgba(49, 94, 234, 0.11), transparent 29%),
    linear-gradient(135deg, var(--bg-page), var(--bg-page-alt));
  color: var(--text-primary);
  padding: 72px;
  box-sizing: border-box;
}
.template-frame { width: 100%; height: 100%; display: flex; flex-direction: column; gap: 34px; }
.template-frame--catalog { gap: 26px; }
.template-eyebrow { margin: 0 0 14px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--text-muted); font-weight: 700; }
.template-frame header { flex: 0 0 auto; padding-bottom: 8px; overflow: visible; }
.template-title { margin: 0; max-width: 1320px; font-family: var(--font-display); font-size: 62px; line-height: 1.22; color: var(--text-primary); padding-bottom: 6px; overflow: visible; }
.template-body { flex: 1; min-height: 0; }
.template-grid { display: grid; gap: 24px; height: 100%; }
.template-grid.cols-2 { grid-template-columns: 0.95fr 1.05fr; }
.template-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.template-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
.template-chart-layout { grid-template-columns: 2fr 1fr; }
.template-card { background: rgba(255,255,255,0.82); border: 1px solid var(--line); border-radius: var(--surface-radius); padding: 28px; box-shadow: 0 18px 44px var(--shadow-soft); }
.template-card h2, .template-card h3 { margin: 0 0 12px; font-size: 28px; line-height: 1.32; padding-bottom: 4px; overflow: visible; }
.template-card p { margin: 10px 0; font-size: 21px; line-height: 1.42; color: var(--text-secondary); }
.template-key-message-panel { display: flex; flex-direction: column; justify-content: flex-start; gap: 24px; padding: 0; background: transparent; border-radius: 0; box-shadow: none; }
.template-key-message-kicker { margin: 0; max-width: 720px; font-size: 32px; line-height: 1.24; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-primary); font-weight: 800; padding-bottom: 6px; overflow: visible; }
.template-key-message-panel p { margin: 0; max-width: 760px; font-size: 25px; line-height: 1.5; color: var(--text-secondary); }
.template-evidence-grid { display: grid; gap: 24px; min-height: 0; }
.template-evidence-card { min-height: 0; }
.template-claim-text-panel { min-height: 0; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; gap: 18px; padding: 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; }
.template-claim-text-title { margin: 0; max-width: 760px; font-size: 31px; line-height: 1.26; color: var(--text-primary); padding-bottom: 4px; overflow: visible; }
.template-claim-text-body { margin: 0; max-width: 760px; font-size: 22px; line-height: 1.48; color: var(--text-secondary); }
.template-claim-text-panel .template-list { margin-top: 4px; }
.template-list { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; }
.template-list li { position: relative; padding-left: 24px; font-size: 24px; line-height: 1.38; color: var(--text-secondary); }
.template-list li::before { content: ""; position: absolute; left: 0; top: 14px; width: 7px; height: 7px; background: var(--accent-primary); }
.template-hero { margin: 0; max-width: none; justify-content: center; align-items: flex-start; }
.template-hero > [data-template-slot="hero"] { width: 100%; }
.template-hero header { padding-bottom: 0; }
.template-hero-title { font-size: 120px; line-height: 1.18; color: white; font-weight: 800; opacity: 0.8; padding: 12px 0 20px; max-width: 1320px; }
.template-hero .template-eyebrow { color: rgba(255,255,255,0.78); }
.template-hero--cover, .template-hero--section-divider { justify-content: center; align-items: flex-start; }
.template-hero--closing { justify-content: flex-end; align-items: flex-end; }
.template-hero--closing > [data-template-slot="hero"] { display: flex; justify-content: flex-end; text-align: right; }
.template-hero--closing .template-hero-title { max-width: 1120px; }
.template-slide[data-template="agenda"] .template-frame { display: grid; grid-template-rows: 1fr auto; gap: 28px; }
.template-slide[data-template="cover"] .slide-canvas,
.template-slide[data-template="section-divider"] .slide-canvas,
.template-slide[data-template="closing"] .slide-canvas {
  background:
    radial-gradient(circle at 80% 14%, rgba(24,168,216,0.32), transparent 28%),
    linear-gradient(135deg, #07111f, #101a2b 62%, #243a73);
}
${lucentCoverBackgroundCss}
.template-slide[data-template="closing"] .slide-canvas { background: linear-gradient(135deg, #07111f, #315eea 58%, #18a8d8); }
${lucentClosingBackgroundCss}
.template-agenda-panel { height: 100%; min-height: 0; display: flex; overflow: hidden; color: white; }
.template-agenda-inner { width: 100%; display: grid; grid-template-columns: 37% minmax(0, 1fr); align-items: stretch; gap: 76px; }
.template-agenda-header { display: flex; flex-direction: column; min-height: 0; padding: 10px 0 0; }
.template-agenda-header .template-eyebrow { color: rgba(255,255,255,0.64); }
.template-agenda-header .template-title { max-width: 440px; font-size: 54px; line-height: 1.16; letter-spacing: 0; text-transform: uppercase; color: white; padding-bottom: 8px; overflow: visible; }
.template-agenda-footer { margin: auto 0 0; font-size: 13px; line-height: 1.4; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800; color: rgba(255,255,255,0.84); }
.template-agenda-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: center; gap: 40px; height: 100%; }
.template-agenda-item { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 44px; align-items: center; min-height: 58px; overflow: visible; }
.template-agenda-item span { font-family: var(--font-display); font-size: 44px; line-height: 1; letter-spacing: 0.03em; color: var(--accent-cyan, #18a8d8); font-weight: 800; font-variant-numeric: tabular-nums; }
.template-agenda-item strong { font-size: 18px; line-height: 1.45; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; color: rgba(255,255,255,0.92); }
.template-metric-layout { height: 100%; min-height: 0; display: grid; gap: 26px; }
.template-metric-layout--insight-top { grid-template-rows: auto minmax(0, 1fr); }
.template-metric-layout--insight-bottom { grid-template-rows: minmax(0, 1fr) auto; }
.template-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; align-items: stretch; }
.template-stat-value { display: block; min-height: 96px; font-size: 58px; line-height: 1.42; color: var(--accent-primary); font-weight: 800; margin-bottom: 18px; padding-bottom: 14px; overflow: visible; }
.template-chart-panel { min-height: 520px; display: grid; place-items: center; border: 1px solid var(--line); background: rgba(255,255,255,0.72); }
.template-chart-placeholder { width: 76%; height: 56%; border-left: 2px solid var(--line-strong); border-bottom: 2px solid var(--line-strong); display: flex; align-items: end; gap: 28px; padding: 0 28px 24px; }
.template-visual-slot-panel { width: 100%; min-height: 520px; border: 1px dashed var(--line-strong); border-radius: var(--surface-radius); background: linear-gradient(135deg, rgba(49,94,234,0.08), rgba(24,168,216,0.08)); display: grid; place-items: center; padding: 0; }
.template-visual-slot-label { font-size: 13px; line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); font-weight: 800; }
.template-text-panel.template-chart-takeaway-panel { gap: 28px; background: linear-gradient(135deg, #5f82c8 0%, var(--accent-primary) 58%, #18a8d8 115%); color: white; box-shadow: 0 22px 56px rgba(49,94,234,0.24); }
.template-chart-takeaway-panel .template-text-panel-title { color: white; }
.template-chart-takeaway-list { display: grid; gap: 22px; width: 100%; }
.template-chart-takeaway-item { display: grid; gap: 7px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.24); }
.template-chart-takeaway-item:first-child { padding-top: 0; border-top: 0; }
.template-chart-takeaway-item h3 { margin: 0; font-size: 25px; line-height: 1.24; color: white; }
.template-chart-takeaway-item p { margin: 0; font-size: 20px; line-height: 1.46; color: rgba(255,255,255,0.78); }
.template-bar { flex: 1; background: linear-gradient(180deg, var(--accent-primary), var(--accent-cyan)); min-height: 80px; }
.template-table-wrap { display: grid; grid-template-rows: minmax(0, auto) auto; gap: 22px; height: 100%; align-content: start; }
.template-table { width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.86); box-shadow: 0 18px 44px var(--shadow-soft); }
.template-table th, .template-table td { padding: 22px 24px; border-bottom: 1px solid var(--line); text-align: left; font-size: 21px; }
.template-table th { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.12em; font-size: 15px; }
.template-text-panel { min-height: 0; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; gap: 20px; background: rgba(255,255,255,0.74); border-radius: var(--surface-radius); padding: 42px; }
.template-text-panel-title { margin: 0; font-size: 34px; line-height: 1.28; color: var(--text-primary); padding-bottom: 4px; overflow: visible; }
.template-text-panel-body { margin: 0; font-size: 23px; line-height: 1.52; color: var(--text-secondary); }
.template-side-panel { align-self: stretch; }
.template-side-panel-title { margin: 0; }
.template-side-panel-body { margin: 0; }
.template-insight-panel { display: grid; gap: 10px; background: rgba(255,255,255,0.88); border: 1px solid var(--line); border-radius: var(--surface-radius); padding: 22px 24px; box-shadow: 0 14px 34px var(--shadow-soft); }
.template-insight-title { margin: 0; display: flex; align-items: center; gap: 12px; font-size: 24px; line-height: 1.24; color: var(--text-primary); }
.template-insight-icon { width: 24px; height: 24px; color: var(--accent-primary); stroke-width: 2.2; flex: 0 0 auto; }
.template-insight-body { margin: 0; font-size: 20px; line-height: 1.42; color: var(--text-secondary); }
.template-metric-layout .template-insight-panel { border: 0; box-shadow: none; background: rgba(255,255,255,0.74); padding: 24px 28px; }
.template-metric-layout .template-insight-title { font-size: 18px; line-height: 1.22; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
.template-metric-layout .template-insight-icon { width: 20px; height: 20px; }
.template-metric-layout .template-insight-body { font-size: 24px; line-height: 1.42; color: var(--text-primary); }
.template-timeline { position: relative; height: 100%; display: grid; align-items: center; }
.template-timeline-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 34px; height: 100%; align-items: stretch; }
.template-timeline-layout--left { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
.template-timeline-layout--left .template-side-panel { grid-column: 1; grid-row: 1; }
.template-timeline-layout--left .template-timeline { grid-column: 2; grid-row: 1; }
.template-timeline-layout--right { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
.template-timeline-layout--right .template-timeline { grid-column: 1; grid-row: 1; }
.template-timeline-layout--right .template-side-panel { grid-column: 2; grid-row: 1; }
.template-timeline-layout .template-text-panel { background: linear-gradient(135deg, #7a7fe8 0%, #5f82c8 58%, #315eea 115%); color: white; box-shadow: 0 22px 56px rgba(49,94,234,0.22); }
.template-timeline-layout .template-text-panel-title { color: white; }
.template-timeline-layout .template-text-panel-body { color: rgba(255,255,255,0.78); }
.template-timeline--horizontal { grid-template-columns: repeat(var(--timeline-count), 1fr); column-gap: 18px; }
.template-timeline--horizontal::before { content: ""; position: absolute; left: 4%; right: 4%; top: 50%; border-top: 2px solid var(--line-strong); }
.template-timeline-item { position: relative; min-height: 400px; display: grid; justify-items: center; align-items: center; }
.template-timeline-dot { z-index: 2; width: 22px; height: 22px; border-radius: 999px; background: var(--accent-primary); box-shadow: 0 0 0 8px rgba(49,94,234,0.12); }
.template-timeline-copy { z-index: 2; width: 86%; padding: 18px 4px; background: transparent; border: 0; box-shadow: none; }
.template-timeline-item:nth-child(odd) .template-timeline-copy { align-self: start; }
.template-timeline-item:nth-child(even) .template-timeline-copy { align-self: end; }
.template-timeline-date { margin: 0 0 8px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent-primary); font-weight: 800; }
.template-timeline-copy h3 { margin: 0 0 8px; font-size: 27px; line-height: 1.28; padding-bottom: 4px; overflow: visible; }
.template-timeline-copy p:last-child { margin: 0; font-size: 19px; color: var(--text-secondary); }
.template-timeline--vertical { grid-template-columns: 1fr; align-items: stretch; padding: 18px 0; }
.template-timeline--vertical::before { content: ""; position: absolute; top: 0; bottom: 0; left: 50%; border-left: 2px solid var(--line-strong); }
.template-timeline--vertical .template-timeline-item { min-height: 128px; grid-template-columns: 1fr 56px 1fr; justify-items: stretch; }
.template-timeline--vertical .template-timeline-dot { grid-column: 2; grid-row: 1; justify-self: center; align-self: center; }
.template-timeline--vertical .template-timeline-copy { grid-row: 1; width: auto; align-self: center; }
.template-timeline--vertical .template-timeline-item:nth-child(odd) .template-timeline-copy { grid-column: 1; text-align: right; align-self: center; }
.template-timeline--vertical .template-timeline-item:nth-child(even) .template-timeline-copy { grid-column: 3; text-align: left; align-self: center; }
.template-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
.template-step-number { font-size: 48px; color: var(--accent-primary); font-weight: 800; margin-bottom: 30px; }
.template-image-card { width: 100%; margin: 18px 0 0; display: grid; gap: 8px; }
.template-image-frame { width: 100%; height: 128px; border-radius: var(--surface-radius); overflow: hidden; background: var(--surface-tint, #f1f6fc); border: 1px solid var(--line); }
.template-image-frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
.template-image-caption { margin: 0; font-size: 13px; line-height: 1.35; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.template-visual-placeholder { width: 100%; margin: 18px 0 0; display: grid; gap: 8px; }
.template-visual-placeholder-frame { width: 100%; height: 148px; border-radius: var(--surface-radius); border: 1px dashed var(--line-strong); background: linear-gradient(135deg, rgba(49,94,234,0.08), rgba(24,168,216,0.08)); display: grid; place-items: center; }
.template-visual-placeholder-label { font-size: 13px; line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); font-weight: 800; }
.template-page-number { position: absolute; right: 72px; bottom: 52px; font-size: 15px; color: var(--text-muted); letter-spacing: 0.18em; }
.template-catalog-panel { flex: 0 0 auto; margin-top: auto; background: rgba(255,255,255,0.9); border: 1px solid var(--line); border-radius: var(--surface-radius); box-shadow: 0 18px 44px var(--shadow-soft); padding: 16px 22px; color: var(--text-primary); }
.template-hero .template-catalog-panel { background: rgba(247,249,252,0.92); }
.template-catalog-kicker { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--accent-primary); font-weight: 800; }
.template-catalog-title { margin: 0 0 10px; font-size: 20px; line-height: 1.28; font-weight: 800; }
.template-catalog-grid { display: grid; grid-template-columns: 1.15fr 1fr 1fr; gap: 16px; }
.template-catalog-section { min-width: 0; }
.template-catalog-section h3 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-muted); }
.template-catalog-section p { margin: 0; font-size: 15px; line-height: 1.36; color: var(--text-secondary); }
.template-catalog-list { margin: 0; padding-left: 16px; display: grid; gap: 2px; }
.template-catalog-list li { font-size: 14px; line-height: 1.3; color: var(--text-secondary); }
.template-frame--catalog .template-title { font-size: 52px; line-height: 1.18; }
.template-slide[data-template="agenda"] .template-frame--catalog .template-title { font-size: 54px; line-height: 1.04; }
.template-frame--catalog .template-card { padding: 22px; }
.template-frame--catalog .template-card h2,
.template-frame--catalog .template-card h3 { font-size: 24px; line-height: 1.22; margin-bottom: 8px; }
.template-frame--catalog .template-card p { font-size: 18px; line-height: 1.32; }
.template-frame--catalog .template-key-message-panel { gap: 16px; }
.template-frame--catalog .template-key-message-kicker { font-size: 23px; line-height: 1.2; }
.template-frame--catalog .template-key-message-panel p { font-size: 19px; line-height: 1.42; }
.template-frame--catalog .template-claim-text-panel { gap: 12px; }
.template-frame--catalog .template-claim-text-title { font-size: 24px; line-height: 1.24; }
.template-frame--catalog .template-claim-text-body { font-size: 18px; line-height: 1.36; }
.template-frame--catalog .template-evidence-grid { gap: 18px; }
.template-frame--catalog .template-list { gap: 12px; }
.template-frame--catalog .template-list li { font-size: 20px; line-height: 1.28; }
.template-frame--catalog .template-metric-layout { gap: 18px; }
.template-frame--catalog .template-metric-layout .template-card { padding: 20px; }
.template-frame--catalog .template-metric-layout .template-stat-value { min-height: 70px; font-size: 48px; line-height: 1.24; margin-bottom: 10px; padding-bottom: 8px; }
.template-frame--catalog .template-metric-layout .template-insight-panel { padding: 18px 22px; gap: 7px; }
.template-frame--catalog .template-metric-layout .template-insight-title { font-size: 13px; line-height: 1.22; }
.template-frame--catalog .template-metric-layout .template-insight-icon { width: 16px; height: 16px; }
.template-frame--catalog .template-metric-layout .template-insight-body { font-size: 19px; line-height: 1.34; }
.template-frame--catalog .template-chart-panel { min-height: 360px; }
.template-frame--catalog .template-visual-slot-panel { min-height: 360px; }
.template-frame--catalog .template-visual-slot-label { font-size: 11px; }
.template-frame--catalog .template-chart-takeaway-panel { padding: 24px; gap: 16px; }
.template-frame--catalog .template-chart-takeaway-list { gap: 13px; }
.template-frame--catalog .template-chart-takeaway-item { gap: 4px; padding-top: 11px; }
.template-frame--catalog .template-chart-takeaway-item h3 { font-size: 19px; line-height: 1.2; }
.template-frame--catalog .template-chart-takeaway-item p { font-size: 15px; line-height: 1.3; }
.template-frame--catalog .template-table-wrap { gap: 16px; }
.template-frame--catalog .template-table th,
.template-frame--catalog .template-table td { padding: 14px 18px; font-size: 17px; line-height: 1.32; }
.template-frame--catalog .template-table th { font-size: 12px; }
.template-frame--catalog .template-insight-panel { padding: 16px 18px; gap: 6px; }
.template-frame--catalog .template-insight-title { font-size: 20px; line-height: 1.2; }
.template-frame--catalog .template-insight-icon { width: 20px; height: 20px; }
.template-frame--catalog .template-insight-body { font-size: 16px; line-height: 1.32; }
.template-frame--catalog .template-timeline--vertical { padding: 6px 0; }
.template-frame--catalog .template-timeline--vertical .template-timeline-item { min-height: 96px; }
.template-frame--catalog .template-timeline-layout { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 22px; }
.template-frame--catalog .template-timeline-layout--left { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
.template-frame--catalog .template-timeline-layout--right { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
.template-frame--catalog .template-timeline-layout .template-text-panel { padding: 22px; gap: 10px; }
.template-frame--catalog .template-timeline-layout .template-text-panel-title { font-size: 25px; line-height: 1.3; }
.template-frame--catalog .template-timeline-layout .template-text-panel-body { font-size: 18px; line-height: 1.4; }
.template-frame--catalog .template-timeline-copy { padding: 8px 4px; }
.template-frame--catalog .template-timeline-copy h3 { font-size: 21px; line-height: 1.18; margin-bottom: 4px; }
.template-frame--catalog .template-timeline-date { font-size: 12px; margin-bottom: 4px; }
.template-frame--catalog .template-timeline-copy p:last-child { font-size: 15px; line-height: 1.24; }
.template-frame--catalog .template-steps { gap: 16px; }
.template-frame--catalog .template-step-number { font-size: 40px; margin-bottom: 20px; }
.template-frame--catalog .template-image-frame { height: 86px; }
.template-frame--catalog .template-image-caption { font-size: 11px; }
.template-frame--catalog .template-visual-placeholder-frame { height: 110px; }
.template-frame--catalog .template-visual-placeholder-label { font-size: 11px; }
`
}

function ensureInlineLucideRuntime(html: string): string {
  if (html.includes("function revelaRenderLucideIcons")) return html
  const runtime = `<script>
function revelaRenderLucideIcons() {
  var icons = {
    lightbulb: '<svg xmlns="http://www.w3.org/2000/svg" class="template-insight-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5A5.5 5.5 0 0 0 18 7.5C18 4.5 15.5 2 12 2S6 4.5 6 7.5c0 1.5.6 2.9 1.5 4 .8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
    'scan-search': '<svg xmlns="http://www.w3.org/2000/svg" class="template-insight-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3H5a2 2 0 0 0-2 2v2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M14 14l4 4"/><circle cx="11" cy="11" r="3"/></svg>'
  };
  document.querySelectorAll("[data-lucide]").forEach(function (node) {
    var name = node.getAttribute("data-lucide") || "lightbulb";
    var svg = icons[name] || icons.lightbulb;
    var wrapper = document.createElement("span");
    wrapper.innerHTML = svg;
    var next = wrapper.firstElementChild;
    if (next) node.replaceWith(next);
  });
}
revelaRenderLucideIcons();
</script>`
  return html.replace("</body>", `    ${runtime}\n</body>`)
}

function cssUrl(value: string): string {
  return value.replace(/\\/g, "/").replace(/"/g, "%22").replace(/\n|\r|\f/g, "")
}

export function validatePageTemplateContracts(filePath: string): PageTemplateContractReport {
  const html = readFileSync(filePath, "utf-8")
  const issues: PageTemplateContractIssue[] = []
  for (const section of html.matchAll(/<section\b[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*data-template=["']([^"']+)["'][^>]*>([\s\S]*?)<\/section>/gi)) {
    const templateId = section[1]
    const body = section[2]
    const slideIndex = Number(/data-slide-index=["'](\d+)["']/i.exec(section[0])?.[1])
    issues.push(...validateVocabularyContract(templateId, body, Number.isInteger(slideIndex) ? slideIndex : undefined))
    if (templateId === "timeline-roadmap") issues.push(...validateTimelineContract(body, Number.isInteger(slideIndex) ? slideIndex : undefined))
  }
  return { ok: !issues.some((issue) => issue.severity === "error"), issues }
}

export function formatPageTemplateContractReport(report: PageTemplateContractReport): string {
  if (report.issues.length === 0) return "Template contracts passed."
  return report.issues.map((issue) => `- ${issue.severity.toUpperCase()}: ${issue.templateId}${issue.slideIndex ? ` slide ${issue.slideIndex}` : ""}: ${issue.message}`).join("\n")
}

export function validateBoundedTemplateEdit(input: BoundedTemplateEditInput): PageTemplateContractReport {
  const issues: PageTemplateContractIssue[] = []
  const slideIndex = positiveIndex(input.slideIndex)
  const beforeSlides = slideSections(input.beforeHtml)
  const afterSlides = slideSections(input.afterHtml)
  const beforeKeys = [...beforeSlides.keys()].sort((a, b) => a - b)
  const afterKeys = [...afterSlides.keys()].sort((a, b) => a - b)
  if (beforeKeys.join(",") !== afterKeys.join(",")) {
    issues.push({ severity: "error", templateId: "bounded-edit", message: "Bounded edit must preserve the slide index set." })
  }
  for (const index of afterKeys) {
    if (index === slideIndex) continue
    if (beforeSlides.get(index) !== afterSlides.get(index)) issues.push({ severity: "error", templateId: "bounded-edit", slideIndex: index, message: "Bounded edit changed a slide outside the target slide." })
  }
  const target = afterSlides.get(slideIndex)
  if (!target) {
    issues.push({ severity: "error", templateId: "bounded-edit", slideIndex, message: "Bounded edit target slide is missing." })
  } else {
    const templateId = /data-template=["']([^"']+)["']/i.exec(target)?.[1] || "unknown"
    issues.push(...validateVocabularyContract(templateId, target, slideIndex))
    if (templateId === "timeline-roadmap") issues.push(...validateTimelineContract(target, slideIndex))
  }
  return { ok: !issues.some((issue) => issue.severity === "error"), issues }
}

function define(id: string, title: string, purpose: string, fields: PageTemplateField[], contentRules: string[], qaRules: string[]): PageTemplateDefinition {
  return { id, title, purpose, status: "renderable", fields, contentRules, qaRules }
}

function validateTimelineContract(html: string, slideIndex?: number): PageTemplateContractIssue[] {
  const issues: PageTemplateContractIssue[] = []
  const root = /class=["'][^"']*\btemplate-timeline\b[^"']*["']/i.test(html)
  if (!root) {
    issues.push({ severity: "error", templateId: "timeline-roadmap", slideIndex, message: "Missing .template-timeline root." })
    return issues
  }
  const itemMatches = [...html.matchAll(/<article\b[^>]*class=["'][^"']*\btemplate-timeline-item\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi)]
  if (itemMatches.length < 3) issues.push({ severity: "warning", templateId: "timeline-roadmap", slideIndex, message: "Timeline should usually contain at least three milestones." })
  for (let index = 0; index < itemMatches.length; index++) {
    const item = itemMatches[index][1]
    if (!/class=["'][^"']*\btemplate-timeline-dot\b[^"']*["']/i.test(item)) issues.push({ severity: "error", templateId: "timeline-roadmap", slideIndex, message: `Milestone ${index + 1} is missing .template-timeline-dot inside its item.` })
    if (!/class=["'][^"']*\btemplate-timeline-copy\b[^"']*["']/i.test(item)) issues.push({ severity: "error", templateId: "timeline-roadmap", slideIndex, message: `Milestone ${index + 1} is missing .template-timeline-copy inside its item.` })
  }
  const dotCount = (html.match(/\btemplate-timeline-dot\b/g) ?? []).length
  const copyCount = (html.match(/\btemplate-timeline-copy\b/g) ?? []).length
  if (dotCount !== copyCount) issues.push({ severity: "error", templateId: "timeline-roadmap", slideIndex, message: `Timeline dot count (${dotCount}) must match copy count (${copyCount}).` })
  return issues
}

function validateVocabularyContract(templateId: string, html: string, slideIndex?: number): PageTemplateContractIssue[] {
  const issues: PageTemplateContractIssue[] = []
  let vocabulary
  try {
    vocabulary = getPageTemplateVocabulary(templateId)
  } catch {
    return issues
  }
  for (const className of vocabulary.requiredClasses) {
    if (!hasClass(html, className)) issues.push({ severity: "error", templateId, slideIndex, message: `Missing required template class .${className}.` })
  }
  for (const slot of vocabulary.slots.filter((item) => item.required)) {
    if (!hasTemplateSlot(html, slot.name)) issues.push({ severity: "error", templateId, slideIndex, message: `Missing required template slot '${slot.name}'.` })
  }
  for (const slot of vocabulary.slots.filter((item) => item.replaceable && item.name === "visual")) {
    if (hasTemplateSlot(html, slot.name) && !hasVisualSemanticContainer(html)) issues.push({ severity: "error", templateId, slideIndex, message: "Visual slot must keep an image, chart, table, diagram, or template visual slot semantic container." })
  }
  return issues
}

function slideSections(html: string): Map<number, string> {
  const sections = new Map<number, string>()
  for (const match of html.matchAll(/<section\b[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*data-slide-index=["'](\d+)["'][^>]*>[\s\S]*?<\/section>/gi)) {
    sections.set(Number(match[1]), match[0])
  }
  return sections
}

function hasClass(html: string, className: string): boolean {
  return new RegExp(`class=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["']`, "i").test(html)
}

function hasTemplateSlot(html: string, slot: string): boolean {
  return new RegExp(`data-template-slot=["']${escapeRegExp(slot)}["']`, "i").test(html)
}

function hasVisualSemanticContainer(html: string): boolean {
  return /\b(template-visual-slot-panel|template-image-card|template-chart-panel|template-table|echart-panel|data-table|media-frame|<img\b|<svg\b|<canvas\b|<table\b)/i.test(html)
}

function field(name: string, type: PageTemplateField["type"], description: string, required = false): PageTemplateField {
  return { name, type, description, required }
}

function getPageTemplate(templateId: string): PageTemplateDefinition {
  const id = String(templateId || "").trim()
  const template = templates.find((item) => item.id === id)
  if (!template) throw new Error(`Unknown page template: ${templateId}`)
  return template
}

function renderSlideShell(input: { template: PageTemplateDefinition; slideIndex: number; designName: string; title: string; body: string; catalog?: any }): string {
  const hero = ["cover", "section-divider", "closing"].includes(input.template.id)
  const hasCatalog = Boolean(input.catalog)
  const heroModifier = hero ? ` template-hero--${input.template.id}` : ""
  return `    <section class="slide template-slide" data-slide-index="${input.slideIndex}" data-design="${escapeAttribute(input.designName)}" data-template="${escapeAttribute(input.template.id)}">
        <div class="slide-canvas">
            <div class="template-frame${hero ? " template-hero" : ""}${heroModifier}${hasCatalog ? " template-frame--catalog" : ""}">
                ${input.body}
                ${renderCatalogPanel(input.template, input.catalog)}
            </div>
            <div class="template-page-number">${String(input.slideIndex).padStart(2, "0")}</div>
        </div>
    </section>`
}

function renderCatalogPanel(template: PageTemplateDefinition, content: any): string {
  if (!content || typeof content !== "object") return ""
  const fields = Array.isArray(content.fields) ? content.fields : template.fields.filter((field) => field.required).map((field) => field.name)
  const qa = Array.isArray(content.qa) ? content.qa : template.qaRules
  return `<aside class="template-catalog-panel">
                <p class="template-catalog-kicker">${escapeHtml(template.id)}</p>
                <h2 class="template-catalog-title">${escapeHtml(content.title || template.title)}</h2>
                <div class="template-catalog-grid">
                    <section class="template-catalog-section"><h3>Purpose</h3><p>${escapeHtml(content.purpose || template.purpose)}</p></section>
                    <section class="template-catalog-section"><h3>Fields</h3><ul class="template-catalog-list">${fields.slice(0, 5).map((item: any) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul></section>
                    <section class="template-catalog-section"><h3>QA</h3><ul class="template-catalog-list">${qa.slice(0, 3).map((item: any) => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul></section>
                </div>
            </aside>`
}

function renderHeader(content: Record<string, any>, fallbackTitle = "", options: { hero?: boolean } = {}): string {
  const eyebrow = stringValue(content.eyebrow)
  const titleClass = options.hero ? "template-title template-hero-title" : "template-title"
  return `<header>
                    ${eyebrow ? `<p class="template-eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
                    <h1 class="${titleClass}">${escapeHtml(stringValue(content.title) || fallbackTitle)}</h1>
                </header>`
}

function renderBody(templateId: string, content: Record<string, any>): string {
  if (["cover", "section-divider", "closing"].includes(templateId)) return `<div data-template-slot="hero">${renderHeader(content, templateId, { hero: true })}</div>`
  if (templateId === "agenda") return renderAgenda(content)
  if (templateId === "executive-summary") return `${renderHeader(content, "Executive Summary")}<div class="template-body template-grid cols-3" data-template-slot="summary-cards">${cards(items(content), "h2", { visualPlaceholder: true })}</div>`
  if (templateId === "problem-context") return `${renderHeader(content, "Problem / Context")}<div class="template-body template-grid cols-2"><div class="template-card" data-template-slot="context"><p>${escapeHtml(stringValue(content.body))}</p></div><div class="template-card" data-template-slot="supporting-points">${list(items(content))}</div></div>`
  if (templateId === "key-message-evidence") return `${renderHeader(content, "Key Message + Evidence")}<div class="template-body template-grid cols-2">${keyMessagePanel(content)}<div class="template-evidence-grid" data-template-slot="evidence">${evidenceCards(items(content))}</div></div>`
  if (templateId === "claim-supporting-visual") return `${renderHeader(content, "Claim + Supporting Visual")}<div class="template-body template-grid cols-2">${claimTextPanel(content)}${visualSlotPanel()}</div>`
  if (templateId === "metric-highlight") return `${renderHeader(content, "Metric Highlight")}<div class="template-body">${metricHighlight(content)}</div>`
  if (templateId === "chart-takeaways") return `${renderHeader(content, "Chart + Takeaways")}<div class="template-body template-grid template-chart-layout">${visualSlotPanel()}${chartTakeawayPanel(content)}</div>`
  if (templateId === "table-comparison") return `${renderHeader(content, "Table / Comparison")}<div class="template-body" data-template-slot="table">${table(content)}</div>`
  if (templateId === "timeline-roadmap") return `${renderHeader(content, "Timeline / Roadmap")}<div class="template-body">${timeline(content)}</div>`
  if (templateId === "process-steps") return `${renderHeader(content, "Process / Steps")}<div class="template-body"><div class="template-steps" data-template-slot="steps">${steps(content.steps)}</div></div>`
  if (templateId === "recommendation-decision") return `${renderHeader(content, "Recommendation / Decision")}<div class="template-body template-grid cols-3"><div class="template-card" data-template-slot="recommendation"><h2>Recommendation</h2><p>${escapeHtml(stringValue(content.recommendation))}</p>${imageCard(content)}</div><div data-template-slot="rationale">${cards(items(content).slice(0, 1), "h3")}</div><div class="template-card" data-template-slot="next-steps"><h2>Next steps</h2>${orderedSteps(content.steps)}</div></div>`
  if (templateId === "risks-tradeoffs") return `${renderHeader(content, "Risks / Tradeoffs")}<div class="template-body template-grid cols-3" data-template-slot="risks">${cards(items(content), "h3")}</div>`
  return renderHeader(content, templateId)
}

function renderAgenda(content: Record<string, any>): string {
  const agendaItems = items(content)
  const eyebrow = stringValue(content.eyebrow)
  const footer = stringValue(content.footer) || "Structure-First-Design"
  return `<div class="template-body template-agenda-panel" data-template-slot="agenda">
                    <div class="template-agenda-inner">
                        <div class="template-agenda-header">
                            ${eyebrow ? `<p class="template-eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
                            <h1 class="template-title">${escapeHtml(stringValue(content.title) || "Agenda")}</h1>
                            <p class="template-agenda-footer">${escapeHtml(footer)}</p>
                        </div>
                        <ol class="template-agenda-list" data-template-slot="agenda-list">${agendaItems.map((item, index) => `<li class="template-agenda-item"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item.label)}</strong></li>`).join("")}</ol>
                    </div>
                </div>`
}

function keyMessagePanel(content: Record<string, any>): string {
  return `<div class="template-key-message-panel" data-template-slot="key-message">
                    <h2 class="template-key-message-kicker">Key message</h2>
                    <p>${escapeHtml(stringValue(content.body))}</p>
                </div>`
}

function claimTextPanel(content: Record<string, any>): string {
  return `<div class="template-claim-text-panel" data-template-slot="claim">
                    <h2 class="template-claim-text-title">${escapeHtml(stringValue(content.claim) || stringValue(content.title) || "Claim")}</h2>
                    <p class="template-claim-text-body">${escapeHtml(stringValue(content.body))}</p>
                    ${list(items(content))}
                </div>`
}

function evidenceCards(items: Array<{ label: string; description: string; image?: string; imageAlt?: string; imageCaption?: string }>): string {
  return items.map((item, index) => `<article class="template-card template-evidence-card"><h3>${escapeHtml(item.label || `Evidence ${index + 1}`)}</h3><p>${escapeHtml(item.description)}</p>${imageCard(item)}</article>`).join("")
}

function chartTakeawayPanel(content: Record<string, any>): string {
  const takeawayItems = items(content)
  const title = stringValue(content.takeawaysTitle) || "What to read"
  return `<div class="template-text-panel template-chart-takeaway-panel" data-template-slot="takeaways">
                    <h2 class="template-text-panel-title">${escapeHtml(title)}</h2>
                    <div class="template-chart-takeaway-list">${takeawayItems.map((item) => `<section class="template-chart-takeaway-item"><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.description)}</p></section>`).join("")}</div>
                </div>`
}

function cards(items: Array<{ label: string; description: string; image?: string; imageAlt?: string; imageCaption?: string }>, heading: "h2" | "h3", options: { visualPlaceholder?: boolean } = {}): string {
  return items.map((item) => `<article class="template-card"><${heading}>${escapeHtml(item.label)}</${heading}><p>${escapeHtml(item.description)}</p>${imageCard(item) || (options.visualPlaceholder ? visualPlaceholder() : "")}</article>`).join("")
}

function list(items: Array<{ label: string; description: string }>): string {
  return `<ul class="template-list">${items.map((item) => `<li><strong>${escapeHtml(item.label)}</strong>${item.description ? ` ${escapeHtml(item.description)}` : ""}</li>`).join("")}</ul>`
}

function metrics(input: any): string {
  const values = Array.isArray(input) ? input : []
  return values.slice(0, 4).map((item) => `<article class="template-card"><div class="template-stat-value">${escapeHtml(stringValue(item.value) || "0")}</div><h2>${escapeHtml(stringValue(item.label) || "Metric")}</h2><p>${escapeHtml(stringValue(item.description))}</p></article>`).join("")
}

function metricHighlight(content: Record<string, any>): string {
  const statGrid = `<div class="template-stat-grid" data-template-slot="metrics">${metrics(content.metrics)}</div>`
  const panel = renderInsightPanel(content)
  if (!panel) return statGrid
  const position = stringValue(content.insightPosition) === "top" ? "top" : "bottom"
  return `<div class="template-metric-layout template-metric-layout--insight-${position}">${position === "top" ? `${panel}${statGrid}` : `${statGrid}${panel}`}</div>`
}

function table(content: Record<string, any>): string {
  const columns = Array.isArray(content.columns) ? content.columns.map(stringValue).filter(Boolean) : ["Dimension", "Current", "Target"]
  const rows = Array.isArray(content.rows) ? content.rows : []
  const insight = renderInsightPanel(content)
  return `<div class="template-table-wrap"><table class="template-table"><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column, index) => `<td>${escapeHtml(Array.isArray(row) ? stringValue(row[index]) : stringValue(row[column]) || stringValue(row[slug(column)]))}</td>`).join("")}</tr>`).join("")}</tbody></table>${insight}</div>`
}

function renderInsightPanel(content: Record<string, any>): string {
  const body = stringValue(content.insightBody)
  if (!body) return ""
  const title = stringValue(content.insightTitle) || "Insight"
  const icon = safeLucideIconName(stringValue(content.insightIcon) || "lightbulb")
  return `<div class="template-insight-panel">
                    <h2 class="template-insight-title"><i class="template-insight-icon" data-lucide="${escapeAttribute(icon)}" aria-hidden="true"></i><span>${escapeHtml(title)}</span></h2>
                    <p class="template-insight-body">${escapeHtml(body)}</p>
                </div>`
}

function timeline(content: Record<string, any>): string {
  const milestones = Array.isArray(content.milestones) ? content.milestones : []
  const orientation = stringValue(content.orientation) === "vertical" ? "vertical" : "horizontal"
  const sidePanel = renderSidePanel(content)
  const side = stringValue(content.insightSide) === "right" ? "right" : "left"
  const timelineHtml = `<div class="template-timeline template-timeline--${orientation}" data-template-slot="timeline" style="--timeline-count:${Math.max(1, milestones.length)}">${milestones.map((item) => `<article class="template-timeline-item">
                        <span class="template-timeline-dot" aria-hidden="true"></span>
                        <div class="template-timeline-copy">
                            <p class="template-timeline-date">${escapeHtml(stringValue(item.date))}</p>
                            <h3>${escapeHtml(stringValue(item.label))}</h3>
                            <p>${escapeHtml(stringValue(item.description))}</p>
                        </div>
                    </article>`).join("")}</div>`
  if (!sidePanel) return timelineHtml
  return `<div class="template-timeline-layout template-timeline-layout--${side}">${side === "left" ? `${sidePanel}${timelineHtml}` : `${timelineHtml}${sidePanel}`}</div>`
}

function renderSidePanel(content: Record<string, any>): string {
  return renderTextPanel(content)
}

function renderTextPanel(content: Record<string, any>): string {
  const body = stringValue(content.insightBody)
  if (!body) return ""
  const title = stringValue(content.insightTitle) || "Insight"
  return `<div class="template-side-panel template-text-panel" data-template-slot="insight"><h2 class="template-side-panel-title template-text-panel-title">${escapeHtml(title)}</h2><p class="template-side-panel-body template-text-panel-body">${escapeHtml(body)}</p></div>`
}

function imageCard(input: any): string {
  const image = safeImagePath(stringValue(input?.image))
  if (!image) return ""
  const alt = stringValue(input?.imageAlt) || ""
  const caption = stringValue(input?.imageCaption)
  return `<figure class="template-image-card"><div class="template-image-frame"><img src="${escapeAttribute(image)}" alt="${escapeAttribute(alt)}"></div>${caption ? `<figcaption class="template-image-caption">${escapeHtml(caption)}</figcaption>` : ""}</figure>`
}

function visualPlaceholder(): string {
  return `<figure class="template-visual-placeholder"><div class="template-visual-placeholder-frame"><span class="template-visual-placeholder-label">image / chart slot (optional)</span></div></figure>`
}

function visualSlotPanel(): string {
  return `<div class="template-chart-panel template-visual-slot-panel" data-template-slot="visual"><span class="template-visual-slot-label">image / chart slot (optional)</span></div>`
}

function steps(input: any): string {
  const values = Array.isArray(input) ? input : []
  return values.slice(0, 5).map((item, index) => `<article class="template-card"><div class="template-step-number">${index + 1}</div><h2>${escapeHtml(stringValue(item.label) || `Step ${index + 1}`)}</h2><p>${escapeHtml(stringValue(item.description))}</p>${visualPlaceholder()}</article>`).join("")
}

function orderedSteps(input: any): string {
  const values = Array.isArray(input) ? input : []
  return `<ol class="template-list">${values.slice(0, 5).map((item) => `<li><strong>${escapeHtml(stringValue(item.label))}</strong>${stringValue(item.description) ? ` ${escapeHtml(stringValue(item.description))}` : ""}${imageCard(item)}</li>`).join("")}</ol>`
}

function items(content: Record<string, any>): Array<{ label: string; description: string; image?: string; imageAlt?: string; imageCaption?: string }> {
  const raw = Array.isArray(content.items) ? content.items : []
  return raw.map((item, index) => ({
    label: stringValue(typeof item === "string" ? item : item.label) || `Item ${index + 1}`,
    description: stringValue(typeof item === "string" ? "" : item.description || item.body || item.text),
    image: typeof item === "string" ? "" : stringValue(item.image),
    imageAlt: typeof item === "string" ? "" : stringValue(item.imageAlt),
    imageCaption: typeof item === "string" ? "" : stringValue(item.imageCaption),
  }))
}

function scaffoldSeed(templateId: string, seed: Record<string, any>): Record<string, any> {
  const title = stringValue(seed.title) || getPageTemplate(templateId).title
  const base = { ...seed, title }
  if (templateId === "cover") return { eyebrow: "Deck", ...base }
  if (templateId === "section-divider") return { eyebrow: "Section", ...base }
  if (templateId === "closing") return { ...base }
  if (templateId === "agenda") return { items: defaultItems(["Situation", "Evidence", "Decision"]), ...base }
  if (templateId === "executive-summary") return { items: defaultItems(["Decision is ready", "Risk is bounded", "Next step is narrow"]), ...base }
  if (templateId === "problem-context") return { body: "Replace with context, tension, and why now.", items: defaultItems(["Context", "Implication"]), ...base }
  if (templateId === "key-message-evidence") return { body: "Replace with the key message the audience should remember.", items: defaultItems(["Evidence 1", "Evidence 2", "Evidence 3"]), ...base }
  if (templateId === "claim-supporting-visual") return { claim: "Replace with one visual claim.", body: "Use this copy to guide how the visual should be read.", items: defaultItems(["Anchor", "Callout"]), ...base }
  if (templateId === "metric-highlight") return { metrics: [{ value: "67%", label: "Metric", description: "Replace with interpretation." }, { value: "3x", label: "Comparison", description: "Replace with reading note." }, { value: "14d", label: "Window", description: "Replace with time context." }], insightTitle: "Read the signal", insightBody: "Replace with the decision implication, caveat, or next reading step.", ...base }
  if (templateId === "chart-takeaways") return { takeawaysTitle: "What to read", items: defaultItems(["Trend", "Driver", "Decision use"]), ...base }
  if (templateId === "table-comparison") return { columns: ["Dimension", "Current", "Target"], rows: [["Replace", "Current state", "Target state"], ["Caveat", "Known limit", "Next proof"]], insightTitle: "Insight", insightBody: "Replace with the table reading note or caveat.", ...base }
  if (templateId === "timeline-roadmap") return { orientation: "vertical", insightTitle: "Reading the journey", insightBody: "Replace with the so-what for the milestone sequence.", milestones: [{ date: "Phase 1", label: "Start", description: "Replace milestone." }, { date: "Phase 2", label: "Build", description: "Replace milestone." }, { date: "Phase 3", label: "Decide", description: "Replace milestone." }], ...base }
  if (templateId === "process-steps") return { steps: defaultItems(["Step 1", "Step 2", "Step 3"]), ...base }
  if (templateId === "recommendation-decision") return { recommendation: "Replace with the recommended decision.", items: defaultItems(["Rationale"]), steps: defaultItems(["Pilot", "Validate", "Ship"]), ...base }
  if (templateId === "risks-tradeoffs") return { items: defaultItems(["Risk", "Tradeoff", "Mitigation"]), ...base }
  return base
}

function defaultItems(labels: string[]): Array<{ label: string; description: string }> {
  return labels.map((label) => ({ label, description: "Replace with slide-specific content." }))
}

function validateRequiredFields(template: PageTemplateDefinition, content: Record<string, any>): string[] {
  const warnings: string[] = []
  for (const item of template.fields) {
    if (!item.required) continue
    const value = content[item.name]
    if (Array.isArray(value) ? value.length === 0 : !stringValue(value)) warnings.push(`Missing required template field '${item.name}'.`)
  }
  return warnings
}

function positiveIndex(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error("slideIndex must be a positive 1-based integer.")
  return value
}

function stringValue(value: any): string {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function safeLucideIconName(value: string): string {
  const icon = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
  return icon || "lightbulb"
}

function safeImagePath(value: string): string {
  const image = value.trim()
  if (!image) return ""
  if (/^(?:https?:|data:|javascript:|file:)/i.test(image)) return ""
  if (image.includes("\0")) return ""
  const parts = image.split(/[\\/]+/)
  const parentRefs = parts.filter((part) => part === "..").length
  if (parentRefs > 0 && !image.startsWith("../designs/") && !image.startsWith("..\\designs\\")) return ""
  if (parentRefs > 1) return ""
  return image
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttribute(value: string): string {
  return escapeHtml(value.trim())
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
