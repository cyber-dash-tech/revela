import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs"
import { dirname, join, relative } from "path"
import { createHash } from "crypto"
import type { DeckSpec, SlideSpec } from "../decks-state"
import { parseVaultFrontmatter } from "../narrative-vault/frontmatter"
import { splitMarkdownSections } from "../narrative-vault/markdown"
import { stableVaultRelationId } from "../narrative-vault/relations"
import type { VaultRelation, WorkspaceGraphNodeType } from "../narrative-vault/types"
import type { DeckPlanChapter, DeckPlanQualityCheck, RenderPlanContract, RenderPlanSlideMetadata } from "./render-plan"

export const DECK_PLAN_DIR = "deck-plan"
export const DECK_PLAN_MARKDOWN_PATH = "deck-plan.md"
export const DECK_PLAN_INDEX_PATH = "deck-plan/index.md"
export const DECK_PLAN_SLIDES_DIR = "deck-plan/slides"
export const LEGACY_DECK_PLAN_ARTIFACT_PATH = "decks/deck-plan.md"
export const DECK_PLAN_ARTIFACT_PATH = DECK_PLAN_MARKDOWN_PATH
export const MAX_HTML_SLIDES_PER_BATCH = 5

export interface DeckPlanArtifactInput {
  deck: DeckSpec
  narrativeHash: string
  planHash: string
  chapters: DeckPlanChapter[]
  qualityChecks: DeckPlanQualityCheck[]
  renderPlan?: RenderPlanContract
  compiledAt: string
}

export interface DeckPlanApproval {
  status?: string
  approvedBy?: string
  approvedAt?: string
  approvalNote?: string
  planHash?: string
  narrativeHash?: string
}

export interface DeckPlanApprovalValidation {
  ok: boolean
  reason?: string
  approval?: DeckPlanApproval
  planHash?: string
  sections?: string[]
  missingSections?: string[]
}

export interface DeckPlanReadResult {
  ok: boolean
  path: string
  absolutePath: string
  markdown?: string
  planHash?: string
  approval?: DeckPlanApproval
  approvalStatus: "missing" | "pending" | "approved" | "stale" | "invalid"
  sections: string[]
  missingSections: string[]
  warnings: string[]
  reason?: string
  projection?: DeckPlanProjection
}

export interface DeckPlanProjection {
  path: string
  absolutePath: string
  id: string
  markdown: string
  frontmatter: Record<string, string | string[] | boolean>
  sections: string[]
  narrativeHash?: string
  designName?: string
  outputPath?: string
  slides: DeckPlanSlideProjection[]
  htmlWritingBatches: DeckPlanHtmlWritingBatch[]
  htmlWritingInstruction: string
  graphNodes: Array<{ id: string; type: WorkspaceGraphNodeType; file: string }>
  graphRelations: VaultRelation[]
  diagnostics: DeckPlanProjectionDiagnostic[]
}

export interface DeckPlanHtmlWritingBatch {
  label: string
  chapterTitle: string
  slideIndexes: number[]
  maxSlides: number
  instructions: string
}

export interface DeckPlanSlideProjection {
  path: string
  absolutePath: string
  id: string
  slideIndex?: number
  title: string
  chapter: string
  layout: string
  components: string[]
  componentPlan: DeckPlanSlideComponentPlan[]
  structural: boolean
  narrativeRole: string
  markdown: string
  frontmatter: Record<string, string | string[] | boolean>
  sections: string[]
  links: DeckPlanNarrativeLink[]
  sourceLinks: DeckPlanSourceLinks
  caveats: string[]
}

export interface DeckPlanSlideComponentPlan {
  name: string
  slot: string
  position: string
  purpose: string
  content: string
  claimIds: string[]
  evidenceIds: string[]
  sourceNotes: string[]
  renderNotes: string[]
  placementNote?: string
  children?: DeckPlanSlideComponentPlan[]
}

export interface DeckPlanSlideUpsertComponentInput {
  name: string
  slot: string
  position: string
  purpose: string
  content: string
  claimIds?: string[]
  evidenceIds?: string[]
  sourceNotes?: string[]
  renderNotes?: string[]
  placementNote?: string
  children?: DeckPlanSlideUpsertComponentInput[]
}

export interface DeckPlanSourceLinks {
  materials: string[]
  findings: string[]
  assets: string[]
  urls: string[]
  caveats: string[]
}

export interface DeckPlanSlideUpsertInput {
  designName?: string
  outputPath?: string
  slideIndex: number
  id?: string
  title: string
  chapter: string
  narrativeRole: string
  structural?: boolean
  layout: string
  components: DeckPlanSlideUpsertComponentInput[]
  visualIntent: {
    kind?: string
    component?: string
    rationale?: string
    brief?: string
  } | string
  sourceLinks?: Partial<DeckPlanSourceLinks>
  narrativeLinks?: {
    claimIds?: string[]
    evidenceIds?: string[]
    riskIds?: string[]
    objectionIds?: string[]
    gapIds?: string[]
  }
  caveats?: string[]
}

export interface DeckPlanSlideUpsertResult {
  ok: boolean
  path?: string
  absolutePath?: string
  updated?: boolean
  slide?: DeckPlanSlideProjection
  diagnostics: DeckPlanProjectionDiagnostic[]
}

export interface DeckPlanNarrativeLink {
  id: string
  relation: "uses_claim" | "uses_evidence" | "addresses_risk" | "answers_objection" | "mentions_gap"
  group: string
}

export interface DeckPlanProjectionDiagnostic {
  severity: "warning" | "error"
  code: string
  message: string
  file?: string
  nodeId?: string
}

export const REQUIRED_DECK_PLAN_SECTIONS = [
  "Goal",
  "Audience",
  "Design",
  "Source Authority",
  "Chapter Map",
  "Slides",
  "Unresolved Inputs",
  "HTML Contract",
]

export function writeDeckPlanArtifact(workspaceRoot: string, input: DeckPlanArtifactInput): { path: string; absolutePath: string } {
  const absolutePath = join(workspaceRoot, DECK_PLAN_ARTIFACT_PATH)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, renderDeckPlanMarkdown(input), "utf-8")
  return { path: DECK_PLAN_ARTIFACT_PATH, absolutePath }
}

export function readDeckPlanArtifact(workspaceRoot: string, expected?: { narrativeHash?: string; knownNodeIds?: Set<string> }): DeckPlanReadResult {
  const projection = readDeckPlanProjection(workspaceRoot, expected)
  const absolutePath = projection?.absolutePath ?? join(workspaceRoot, DECK_PLAN_MARKDOWN_PATH)
  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      path: DECK_PLAN_MARKDOWN_PATH,
      absolutePath,
      approvalStatus: "missing",
      sections: [],
      missingSections: REQUIRED_DECK_PLAN_SECTIONS,
      warnings: [],
      reason: `Deck plan file is missing: ${DECK_PLAN_MARKDOWN_PATH}. Write the LLM-authored deck plan before HTML generation.`,
    }
  }
  const markdown = projection?.markdown ?? readFileSync(absolutePath, "utf-8")
  const planHash = deckPlanBodyHash(markdown)
  const approval = parseDeckPlanApproval(markdown)
  const sections = projection?.sections ?? parseMarkdownSections(markdown)
  const missingSections = REQUIRED_DECK_PLAN_SECTIONS.filter((section) => !sections.includes(section))
  const warnings: string[] = projection?.diagnostics.map((diagnostic) => diagnostic.message) ?? []
  if (missingSections.length > 0) warnings.push(`Missing required deck-plan sections: ${missingSections.join(", ")}.`)
  let approvalStatus: DeckPlanReadResult["approvalStatus"] = "missing"
  if (approval) {
    approvalStatus = approval.status === "approved" ? "approved" : "pending"
    if (expected?.narrativeHash && approval.narrativeHash && approval.narrativeHash !== expected.narrativeHash) {
      approvalStatus = "stale"
      warnings.push("Approval narrativeHash does not match current narrative state.")
    }
    if (approval.planHash && !isPlaceholderPlanHash(approval.planHash) && approval.planHash !== planHash) {
      approvalStatus = "stale"
      warnings.push("Legacy approval planHash does not match the current deck-plan body.")
    }
  } else {
    approvalStatus = "missing"
  }
  return {
    ok: true,
    path: projection?.path ?? DECK_PLAN_MARKDOWN_PATH,
    absolutePath,
    markdown,
    planHash,
    approval,
    approvalStatus,
    sections,
    missingSections,
    warnings,
    projection,
  }
}

export function readDeckPlanProjection(workspaceRoot: string, expected?: { narrativeHash?: string; knownNodeIds?: Set<string> }): DeckPlanProjection | undefined {
  const root = join(workspaceRoot, DECK_PLAN_DIR)
  const singlePath = join(workspaceRoot, DECK_PLAN_MARKDOWN_PATH)
  const indexPath = join(workspaceRoot, DECK_PLAN_INDEX_PATH)
  const legacyPath = join(workspaceRoot, LEGACY_DECK_PLAN_ARTIFACT_PATH)
  const absolutePath = existsSync(singlePath) ? singlePath : existsSync(indexPath) ? indexPath : existsSync(legacyPath) ? legacyPath : ""
  if (!absolutePath) return undefined
  const markdown = readFileSync(absolutePath, "utf-8")
  const parsed = parseVaultFrontmatter(markdown)
  const split = splitMarkdownSections(parsed.body)
  const sections = parseMarkdownSections(markdown)
  const path = relativePath(workspaceRoot, absolutePath)
  const id = stringField(parsed.frontmatter, "id") || "deck-plan"
  const isSingleFile = relativePath(workspaceRoot, absolutePath) === DECK_PLAN_MARKDOWN_PATH
  const slides = isSingleFile ? readDeckPlanSlidesFromSingleFile(workspaceRoot, absolutePath, markdown, expected?.knownNodeIds) : existsSync(join(root, "slides")) ? readDeckPlanSlideFiles(workspaceRoot, expected?.knownNodeIds) : []
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  const narrativeHash = stringField(parsed.frontmatter, "narrativeHash") || narrativeHashFromMarkdown(markdown)
  if (expected?.narrativeHash && narrativeHash && narrativeHash !== expected.narrativeHash) diagnostics.push({ severity: "warning", code: "stale_narrative_hash", message: "Deck plan narrativeHash does not match current narrative state.", file: path, nodeId: id })
  if (expected?.narrativeHash && !narrativeHash) diagnostics.push({ severity: "warning", code: "missing_narrative_hash", message: "Deck plan index is missing narrativeHash; stale plan detection is limited.", file: path, nodeId: id })
  diagnostics.push(...deckPlanIndexDiagnostics(slides))
  diagnostics.push(...slides.flatMap((slide) => slideDiagnostics(slide, expected?.knownNodeIds)))
  const graphNodes = [
    { id, type: "deck-plan" as const, file: path },
    ...slides.map((slide) => ({ id: slide.id, type: "deck-plan-slide" as const, file: slide.path })),
  ]
  const graphRelations = slides.flatMap((slide) => slide.links.map((link) => ({
    id: stableVaultRelationId(slide.id, link.relation, link.id),
    fromId: slide.id,
    relation: link.relation,
    toId: link.id,
    file: slide.path,
    source: "inline" as const,
  })))
  const htmlWritingBatches = buildHtmlWritingBatches(slides)
  return {
    path,
    absolutePath,
    id,
    markdown,
    frontmatter: parsed.frontmatter,
    sections,
    narrativeHash,
    designName: stringField(parsed.frontmatter, "designName") || stringField(parsed.frontmatter, "design"),
    outputPath: stringField(parsed.frontmatter, "outputPath") || stringField(parsed.frontmatter, "output"),
    slides,
    htmlWritingBatches,
    htmlWritingInstruction: htmlWritingInstruction(),
    graphNodes,
    graphRelations,
    diagnostics,
  }
}

export function validateDeckPlanApprovalFile(workspaceRoot: string, expected: { narrativeHash: string; planHash?: string }): DeckPlanApprovalValidation {
  const read = readDeckPlanArtifact(workspaceRoot, { narrativeHash: expected.narrativeHash })
  if (!read.ok || !read.markdown) return { ok: false, reason: read.reason, sections: read.sections, missingSections: read.missingSections }
  return validateDeckPlanApproval(read.markdown, expected)
}

export function validateDeckPlanApproval(markdown: string, expected: { narrativeHash: string; planHash?: string }): DeckPlanApprovalValidation {
  const approval = parseDeckPlanApproval(markdown)
  const planHash = deckPlanBodyHash(markdown)
  const sections = parseMarkdownSections(markdown)
  const missingSections = REQUIRED_DECK_PLAN_SECTIONS.filter((section) => !sections.includes(section))
  if (!approval) return { ok: false, reason: "Deck plan approval block is missing or malformed." }
  if (approval.status !== "approved") return { ok: false, approval, reason: "Legacy deck plan approval is not approved." }
  if (!approval.approvedBy) return { ok: false, approval, reason: "Deck plan approval requires approvedBy." }
  if (!approval.approvedAt) return { ok: false, approval, reason: "Deck plan approval requires approvedAt." }
  if (Number.isNaN(Date.parse(approval.approvedAt))) return { ok: false, approval, reason: "Deck plan approval approvedAt must be a parseable date/time." }
  if (missingSections.length > 0) return { ok: false, approval, planHash, sections, missingSections, reason: `Deck plan is missing required sections: ${missingSections.join(", ")}.` }
  if (approval.narrativeHash !== expected.narrativeHash) return { ok: false, approval, reason: "Deck plan approval is stale because narrativeHash does not match current narrative state." }
  if (expected.planHash && approval.planHash !== expected.planHash) return { ok: false, approval, planHash, reason: "Deck plan approval is stale because planHash does not match the expected deck plan." }
  if (approval.planHash && !isPlaceholderPlanHash(approval.planHash) && approval.planHash !== planHash) return { ok: false, approval, planHash, reason: "Legacy deck plan approval is stale because planHash does not match the current deck-plan body." }
  return { ok: true, approval, planHash, sections, missingSections }
}

export function deckPlanBodyHash(markdown: string): string {
  return createHash("sha1").update(stripApprovalSection(markdown).trim()).digest("hex")
}

export function upsertDeckPlanSlideArtifact(
  workspaceRoot: string,
  input: DeckPlanSlideUpsertInput,
  options: { narrativeHash?: string; knownNodeIds?: Set<string>; designLayouts: string[]; designComponents: string[]; layoutSlots?: Record<string, string[]>; componentNesting?: Record<string, { acceptsChildren: boolean; allowedChildren?: string[] }> },
): DeckPlanSlideUpsertResult {
  const diagnostics = validateDeckPlanSlideUpsert(input, options)
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return { ok: false, diagnostics }

  const existing = readDeckPlanProjection(workspaceRoot, { narrativeHash: options.narrativeHash, knownNodeIds: options.knownNodeIds })
  const existingSlide = existing?.slides.find((slide) => slide.slideIndex === input.slideIndex)
  const id = input.id?.trim() || existingSlide?.id || `slide-${slugify(input.title)}`
  const nextSlide = projectionFromSlideInput(workspaceRoot, { ...input, id }, existingSlide)
  const slides = [...(existing?.slides.filter((slide) => slide.slideIndex !== input.slideIndex) ?? []), nextSlide]
    .sort((a, b) => (a.slideIndex ?? Number.MAX_SAFE_INTEGER) - (b.slideIndex ?? Number.MAX_SAFE_INTEGER))
  const designName = input.designName || existing?.designName
  const outputPath = input.outputPath || existing?.outputPath
  writeDeckPlanSingleFile(workspaceRoot, {
    title: "Deck Plan",
    designName,
    outputPath,
    slides,
  })
  const projection = readDeckPlanProjection(workspaceRoot, { narrativeHash: options.narrativeHash, knownNodeIds: options.knownNodeIds })
  const slide = projection?.slides.find((item) => item.slideIndex === input.slideIndex)
  return { ok: true, path: DECK_PLAN_MARKDOWN_PATH, absolutePath: join(workspaceRoot, DECK_PLAN_MARKDOWN_PATH), updated: Boolean(existingSlide), slide, diagnostics: [...diagnostics, ...(projection?.diagnostics ?? [])] }
}

function projectionFromSlideInput(workspaceRoot: string, input: DeckPlanSlideUpsertInput & { id: string }, existing?: DeckPlanSlideProjection): DeckPlanSlideProjection {
  const sourceLinks = sourceLinksForInput(input)
  const caveats = uniqueStrings([...(input.caveats ?? []), ...sourceLinks.caveats])
  const componentPlan = input.components.map(componentInputToPlan)
  const slide: DeckPlanSlideProjection = {
    path: DECK_PLAN_MARKDOWN_PATH,
    absolutePath: join(workspaceRoot, DECK_PLAN_MARKDOWN_PATH),
    id: input.id,
    slideIndex: input.slideIndex,
    title: input.title,
    chapter: input.chapter,
    layout: input.layout,
    components: uniqueStrings(componentPlan.flatMap(flattenComponentNames)),
    componentPlan,
    structural: input.structural ?? false,
    narrativeRole: input.narrativeRole,
    markdown: "",
    frontmatter: existing?.frontmatter ?? {},
    sections: [],
    links: sourceLinksToNarrativeLinks(sourceLinks, input.narrativeLinks ? sourceLinksToNarrativeLinks(sourceLinksFromNarrativeLinks(input.narrativeLinks)) : []),
    sourceLinks,
    caveats,
  }
  slide.markdown = renderDeckPlanSlideBlock(slide, input.visualIntent)
  return slide
}

function componentInputToPlan(component: DeckPlanSlideUpsertComponentInput): DeckPlanSlideComponentPlan {
  return normalizeComponentPlan({
    name: component.name?.trim() || "",
    slot: component.slot?.trim() || "",
    position: component.position?.trim() || "",
    purpose: component.purpose?.trim() || "",
    content: component.content?.trim() || "",
    claimIds: uniqueStrings(component.claimIds ?? []),
    evidenceIds: uniqueStrings(component.evidenceIds ?? []),
    sourceNotes: (component.sourceNotes ?? []).map((item) => item.trim()).filter(Boolean),
    renderNotes: (component.renderNotes ?? []).map((item) => item.trim()).filter(Boolean),
    placementNote: component.placementNote?.trim(),
    children: component.children?.map(componentInputToPlan),
  })
}

function flattenComponentNames(component: DeckPlanSlideComponentPlan): string[] {
  return [component.name, ...(component.children ?? []).flatMap(flattenComponentNames)].filter(Boolean)
}

function writeDeckPlanSingleFile(workspaceRoot: string, input: {
  title: string
  goal?: string
  audience?: string
  designName?: string
  outputPath?: string
  sourceAuthority?: string[]
  unresolvedInputs?: string[]
  slides: DeckPlanSlideProjection[]
}): { path: string; absolutePath: string } {
  const absolutePath = join(workspaceRoot, DECK_PLAN_MARKDOWN_PATH)
  const lines: string[] = []
  lines.push("---")
  lines.push("type: deck-plan")
  lines.push("version: 0.18.1")
  if (input.designName) lines.push(`designName: ${yamlScalar(input.designName)}`)
  if (input.outputPath) lines.push(`outputPath: ${yamlScalar(input.outputPath)}`)
  lines.push("---")
  lines.push("")
  lines.push(`# ${input.title || "Deck Plan"}`)
  lines.push("")
  lines.push("## Goal")
  lines.push("")
  lines.push(input.goal || "To be specified from user intent and source materials.")
  lines.push("")
  lines.push("## Audience")
  lines.push("")
  lines.push(input.audience || "To be specified.")
  lines.push("")
  lines.push("## Design")
  lines.push("")
  lines.push(`- Design: ${input.designName || "active design"}`)
  if (input.outputPath) lines.push(`- Output path: ${input.outputPath}`)
  lines.push("")
  lines.push("## Source Authority")
  lines.push("")
  const sourceAuthority = input.sourceAuthority?.filter(Boolean) ?? ["Local materials, reviewed findings, workspace assets, explicit URLs, and user intent are the source context.", "Deck-plan is the render execution plan for HTML deck generation."]
  for (const item of sourceAuthority) lines.push(`- ${item}`)
  lines.push("")
  lines.push("## Chapter Map")
  lines.push("")
  const chapterMap = new Map<string, number[]>()
  for (const slide of input.slides) chapterMap.set(slide.chapter || "Unassigned", [...(chapterMap.get(slide.chapter || "Unassigned") ?? []), slide.slideIndex ?? 0].filter(Boolean))
  for (const [chapter, indexes] of chapterMap) lines.push(`- ${chapter}: slides ${formatSlideRange(indexes)}`)
  if (chapterMap.size === 0) lines.push("- No slides planned yet.")
  lines.push("")
  lines.push("## Slides")
  lines.push("")
  for (const slide of input.slides) {
    lines.push(renderDeckPlanSlideBlock(slide))
    lines.push("")
  }
  lines.push("## Unresolved Inputs")
  lines.push("")
  const unresolved = input.unresolvedInputs?.filter(Boolean) ?? []
  if (unresolved.length === 0) lines.push("- None.")
  else for (const item of unresolved) lines.push(`- ${item}`)
  lines.push("")
  lines.push("## HTML Contract")
  lines.push("")
  lines.push("- Render one `<section class=\"slide\" data-slide-index=\"N\">` per planned slide.")
  lines.push("- Use positive 1-based slide indexes, unique indexes, DOM order, and one direct `.slide-canvas` child per slide.")
  lines.push("")
  writeFileSync(absolutePath, lines.join("\n"), "utf-8")
  return { path: DECK_PLAN_MARKDOWN_PATH, absolutePath }
}

function renderDeckPlanSlideBlock(slide: DeckPlanSlideProjection, visualIntent?: DeckPlanSlideUpsertInput["visualIntent"]): string {
  const lines: string[] = []
  lines.push("---")
  lines.push(`slideIndex: ${slide.slideIndex ?? ""}`)
  lines.push(`id: ${slide.id}`)
  lines.push(`title: ${yamlScalar(slide.title)}`)
  lines.push(`chapter: ${yamlScalar(slide.chapter || "Unassigned")}`)
  lines.push(`role: ${yamlScalar(slide.narrativeRole || "Not specified")}`)
  lines.push(`structural: ${slide.structural ? "true" : "false"}`)
  lines.push(`layout: ${slide.layout || "unspecified"}`)
  lines.push(`components: ${slide.components.join(", ") || "none"}`)
  lines.push("---")
  lines.push("")
  lines.push("#### Content Plan")
  lines.push("")
  lines.push(`- Message: ${slide.narrativeRole || "Not specified."}`)
  lines.push(`- Role: ${slide.narrativeRole || "Not specified"}`)
  lines.push("- Speaker notes: Not specified.")
  lines.push("")
  lines.push("#### Source Links")
  lines.push("")
  lines.push(renderSourceLinksMarkdown(slide.sourceLinks))
  lines.push("")
  lines.push("#### Design Plan")
  lines.push("")
  lines.push(`- Layout: ${slide.layout || "unspecified"}`)
  lines.push(`- Components: ${slide.components.join(", ") || "none"}`)
  lines.push("- Visual intent:")
  lines.push(...indentMultiline(visualIntent ? renderVisualIntent(visualIntent) : "- Brief: Not specified."))
  lines.push("")
  for (const component of slide.componentPlan) lines.push(renderComponentPlanMarkdown(component, 5))
  lines.push("")
  return lines.join("\n")
}

function renderComponentPlanMarkdown(component: DeckPlanSlideComponentPlan, headingLevel: number): string {
  const lines: string[] = []
  lines.push(`${"#".repeat(headingLevel)} ${component.name}`)
  lines.push("")
  lines.push(`- Slot: ${component.slot}`)
  lines.push(`- Position: ${component.position}`)
  if (component.placementNote) lines.push(`- Placement note: ${component.placementNote}`)
  lines.push(`- Purpose: ${component.purpose}`)
  lines.push("- Content:")
  lines.push(...indentMultiline(component.content))
  lines.push(`- Claim ids: ${formatCsv(component.claimIds)}`)
  lines.push(`- Evidence ids: ${formatCsv(component.evidenceIds)}`)
  lines.push(`- Source notes: ${formatListValue(component.sourceNotes)}`)
  lines.push(`- Render notes: ${formatListValue(component.renderNotes)}`)
  lines.push("")
  for (const child of component.children ?? []) lines.push(renderComponentPlanMarkdown(child, headingLevel + 1))
  return lines.join("\n")
}

function renderSourceLinksMarkdown(sourceLinks: DeckPlanSourceLinks): string {
  const lines: string[] = []
  for (const [label, values] of [
    ["Materials", sourceLinks.materials],
    ["Findings", sourceLinks.findings],
    ["Assets", sourceLinks.assets],
    ["URLs", sourceLinks.urls],
  ] as const) {
    lines.push(`${label}:`)
    if (values.length === 0) lines.push("- None.")
    else for (const value of values) lines.push(value.includes("/") && !/^https?:\/\//i.test(value) ? `- [[${value}]]` : `- ${value}`)
    lines.push("")
  }
  return lines.join("\n").trim()
}

function readDeckPlanSlideFiles(workspaceRoot: string, knownNodeIds?: Set<string>): DeckPlanSlideProjection[] {
  const slidesDir = join(workspaceRoot, DECK_PLAN_SLIDES_DIR)
  if (!existsSync(slidesDir) || !statSync(slidesDir).isDirectory()) return []
  const slides: DeckPlanSlideProjection[] = []
  for (const entry of readdirSync(slidesDir).sort()) {
    const absolutePath = join(slidesDir, entry)
    if (!entry.endsWith(".md") || !statSync(absolutePath).isFile()) continue
    const markdown = readFileSync(absolutePath, "utf-8")
    const parsed = parseVaultFrontmatter(markdown)
    const split = splitMarkdownSections(parsed.body)
    const path = relativePath(workspaceRoot, absolutePath)
    const id = stringField(parsed.frontmatter, "id") || fileId(entry)
    const componentPlan = parseDeckPlanComponentPlan(split.sections["component-plan"] ?? "")
    const sourceLinks = parseDeckPlanSourceLinks(split.sections["source-links"] ?? "")
    const links = sourceLinksToNarrativeLinks(sourceLinks, parseDeckPlanNarrativeLinks(split.sections["narrative-links"] ?? parsed.body, knownNodeIds))
    const caveats = parseBulletText(split.sections["caveats"] ?? "")
    slides.push({
      path,
      absolutePath,
      id,
      slideIndex: numberField(parsed.frontmatter, "slideIndex"),
      title: stringField(parsed.frontmatter, "title") || id,
      chapter: stringField(parsed.frontmatter, "chapter"),
      layout: stringField(parsed.frontmatter, "layout"),
      components: arrayField(parsed.frontmatter, "components"),
      componentPlan,
      structural: booleanField(parsed.frontmatter, "structural", false),
      narrativeRole: stringField(parsed.frontmatter, "narrativeRole"),
      markdown,
      frontmatter: parsed.frontmatter,
      sections: parseMarkdownSections(markdown),
      links,
      sourceLinks,
      caveats,
    })
  }
  return slides.sort((a, b) => (a.slideIndex ?? Number.MAX_SAFE_INTEGER) - (b.slideIndex ?? Number.MAX_SAFE_INTEGER) || a.path.localeCompare(b.path))
}

function readDeckPlanSlidesFromSingleFile(workspaceRoot: string, absolutePath: string, markdown: string, knownNodeIds?: Set<string>): DeckPlanSlideProjection[] {
  const slideBlocks = readDeckPlanSeparatorSlidesFromSingleFile(workspaceRoot, absolutePath, markdown, knownNodeIds)
  if (slideBlocks.length > 0) return slideBlocks
  const path = relativePath(workspaceRoot, absolutePath)
  const body = parseVaultFrontmatter(markdown).body
  const matches = [...body.matchAll(/^[ \t]*###\s+Slide\s+(\d+)\s+(?:—|-)\s+(.+?)\s*$/gm)]
  const slides: DeckPlanSlideProjection[] = []
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const start = match.index ?? 0
    const nextSlide = i + 1 < matches.length ? matches[i + 1].index ?? body.length : body.length
    const headingEnd = body.indexOf("\n", start)
    const searchStart = headingEnd === -1 ? start + match[0].length : headingEnd + 1
    const nextSection = body.slice(searchStart).search(/^[ \t]*##\s+(?!#)/m)
    const end = Math.min(nextSlide, nextSection === -1 ? body.length : searchStart + nextSection)
    const block = body.slice(start, end).trim()
    const slideIndex = Number(match[1])
    const title = match[2].trim()
    const fields = parseSlideBlockFields(block)
    const id = fields.id || `slide-${slugify(title)}`
    const sourceLinks = normalizeSourceLinks(parseDeckPlanSourceLinks(singleFileSubsection(block, "Source Links")))
    const narrativeLinks = parseDeckPlanNarrativeLinks(singleFileSubsection(block, "Narrative Links") || block, knownNodeIds)
    const links = sourceLinksToNarrativeLinks(sourceLinks, narrativeLinks)
    const caveats = uniqueStrings([...parseBulletText(singleFileSubsection(block, "Caveats")), ...sourceLinks.caveats])
    const componentPlan = parseDeckPlanComponentPlan(singleFileSubsection(block, "Component Plan"))
    slides.push({
      path,
      absolutePath,
      id,
      slideIndex,
      title,
      chapter: fields.chapter || "",
      layout: fields.layout || "",
      components: parseCsv(fields.components || componentPlan.map((component) => component.name).join(", ")),
      componentPlan,
      structural: fields.structural === "true" || fields.structural === "yes",
      narrativeRole: fields.role || fields.narrativeRole || "",
      markdown: block,
      frontmatter: {},
      sections: parseMarkdownSections(block),
      links,
      sourceLinks,
      caveats,
    })
  }
  return slides.sort((a, b) => (a.slideIndex ?? Number.MAX_SAFE_INTEGER) - (b.slideIndex ?? Number.MAX_SAFE_INTEGER))
}

function readDeckPlanSeparatorSlidesFromSingleFile(workspaceRoot: string, absolutePath: string, markdown: string, knownNodeIds?: Set<string>): DeckPlanSlideProjection[] {
  const path = relativePath(workspaceRoot, absolutePath)
  const body = parseVaultFrontmatter(markdown).body
  const slidesHeading = /^[ \t]*##\s+Slides\s*$/mi.exec(body)
  if (!slidesHeading || slidesHeading.index === undefined) return []
  const headingEnd = body.indexOf("\n", slidesHeading.index)
  const slidesStart = headingEnd === -1 ? slidesHeading.index + slidesHeading[0].length : headingEnd + 1
  const rest = body.slice(slidesStart)
  const nextSection = rest.search(/^[ \t]*##\s+(?!#)/m)
  const slidesRegion = nextSection === -1 ? rest : rest.slice(0, nextSection)
  const metadataMatches = [...slidesRegion.matchAll(/^[ \t]*---[ \t]*\n[\s\S]*?\n[ \t]*---[ \t]*(?:\n|$)/gm)]
  const slides: DeckPlanSlideProjection[] = []
  for (let i = 0; i < metadataMatches.length; i++) {
    const match = metadataMatches[i]
    const start = match.index ?? 0
    const next = i + 1 < metadataMatches.length ? metadataMatches[i + 1].index ?? slidesRegion.length : slidesRegion.length
    const block = slidesRegion.slice(start, next).trim()
    const parsed = parseVaultFrontmatter(block)
    const slideIndex = numberField(parsed.frontmatter, "slideIndex")
    const title = stringField(parsed.frontmatter, "title") || firstHeading(parsed.body) || `Slide ${slideIndex ?? i + 1}`
    const fields = parseSlideBlockFields(parsed.body)
    const sourceLinks = normalizeSourceLinks(parseDeckPlanSourceLinks(singleFileSubsection(block, "Source Links")))
    const narrativeLinks = parseDeckPlanNarrativeLinks(singleFileSubsection(block, "Narrative Links") || block, knownNodeIds)
    const links = sourceLinksToNarrativeLinks(sourceLinks, narrativeLinks)
    const componentPlan = parseDeckPlanComponentPlan(singleFileSubsection(block, "Component Plan") || singleFileSubsection(block, "Design Plan"))
    slides.push({
      path,
      absolutePath,
      id: stringField(parsed.frontmatter, "id") || fields.id || `slide-${slugify(title)}`,
      slideIndex,
      title,
      chapter: stringField(parsed.frontmatter, "chapter") || fields.chapter || "",
      layout: stringField(parsed.frontmatter, "layout") || fields.layout || "",
      components: arrayField(parsed.frontmatter, "components").length > 0 ? arrayField(parsed.frontmatter, "components") : parseCsv(fields.components || componentPlan.map((component) => component.name).join(", ")),
      componentPlan,
      structural: booleanField(parsed.frontmatter, "structural", fields.structural === "true" || fields.structural === "yes"),
      narrativeRole: stringField(parsed.frontmatter, "role") || stringField(parsed.frontmatter, "narrativeRole") || fields.role || fields.narrativeRole || "",
      markdown: block,
      frontmatter: parsed.frontmatter,
      sections: parseMarkdownSections(block),
      links,
      sourceLinks,
      caveats: uniqueStrings([...parseBulletText(singleFileSubsection(block, "Caveats")), ...sourceLinks.caveats]),
    })
  }
  return slides.sort((a, b) => (a.slideIndex ?? Number.MAX_SAFE_INTEGER) - (b.slideIndex ?? Number.MAX_SAFE_INTEGER))
}

function firstHeading(markdown: string): string {
  return /^#{1,6}\s+(.+?)\s*$/m.exec(markdown)?.[1]?.trim() ?? ""
}

function parseSlideBlockFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const rawLine of block.split(/\r?\n/)) {
    const match = /^-\s+([A-Za-z][A-Za-z ]+):\s*(.*)$/.exec(rawLine.trim())
    if (!match) continue
    const key = match[1].trim().replace(/\s+/g, "")
    fields[key[0].toLowerCase() + key.slice(1)] = cleanPlanValue(match[2])
  }
  return fields
}

function singleFileSubsection(block: string, heading: string): string {
  const re = new RegExp(`^[ \\t]*####\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "mi")
  const match = re.exec(block)
  if (!match || match.index === undefined) return ""
  const start = match.index + match[0].length
  const rest = block.slice(start)
  const next = rest.search(/^[ \t]*####\s+/m)
  return (next === -1 ? rest : rest.slice(0, next)).trim()
}

function parseDeckPlanNarrativeLinks(section: string, knownNodeIds?: Set<string>): DeckPlanNarrativeLink[] {
  const links: DeckPlanNarrativeLink[] = []
  let group = ""
  for (const rawLine of section.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^\s*([A-Za-z][A-Za-z\s/-]*):\s*$/.exec(rawLine)
    if (heading) {
      group = heading[1].trim().toLowerCase()
      continue
    }
    for (const match of rawLine.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      const id = match[1].trim()
      const relation = relationForDeckPlanLink(group, id)
      links.push({ id, relation, group: group || inferredLinkGroup(id, knownNodeIds) })
    }
  }
  return uniqueLinks(links)
}

function emptySourceLinks(): DeckPlanSourceLinks {
  return { materials: [], findings: [], assets: [], urls: [], caveats: [] }
}

function normalizeSourceLinks(input?: Partial<DeckPlanSourceLinks>): DeckPlanSourceLinks {
  return {
    materials: uniqueStrings(input?.materials ?? []),
    findings: uniqueStrings(input?.findings ?? []),
    assets: uniqueStrings(input?.assets ?? []),
    urls: uniqueStrings(input?.urls ?? []),
    caveats: uniqueStrings(input?.caveats ?? []),
  }
}

function sourceLinksFromNarrativeLinks(input?: DeckPlanSlideUpsertInput["narrativeLinks"]): DeckPlanSourceLinks {
  const links = emptySourceLinks()
  for (const id of input?.evidenceIds ?? []) {
    if (/^https?:\/\//i.test(id)) links.urls.push(id)
    else if (id.startsWith("assets/")) links.assets.push(id)
    else if (id.startsWith("researches/")) links.findings.push(id)
    else if (id.startsWith("materials/") || id.startsWith("sources/")) links.materials.push(id)
    else links.findings.push(id)
  }
  for (const id of input?.claimIds ?? []) {
    if (id.startsWith("researches/")) links.findings.push(id)
    else if (id.startsWith("assets/")) links.assets.push(id)
    else links.materials.push(id)
  }
  links.caveats.push(...(input?.riskIds ?? []), ...(input?.objectionIds ?? []), ...(input?.gapIds ?? []))
  return normalizeSourceLinks(links)
}

function sourceLinksForInput(input: DeckPlanSlideUpsertInput): DeckPlanSourceLinks {
  return normalizeSourceLinks({
    ...sourceLinksFromNarrativeLinks(input.narrativeLinks),
    ...(input.sourceLinks ?? {}),
    caveats: [...(sourceLinksFromNarrativeLinks(input.narrativeLinks).caveats ?? []), ...(input.sourceLinks?.caveats ?? []), ...(input.caveats ?? [])],
  })
}

function parseDeckPlanSourceLinks(section: string): DeckPlanSourceLinks {
  const links = emptySourceLinks()
  let group: keyof DeckPlanSourceLinks | undefined
  for (const rawLine of section.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^\s*([A-Za-z][A-Za-z\s/-]*):\s*$/.exec(rawLine)
    if (heading) {
      const normalized = heading[1].trim().toLowerCase()
      if (normalized.includes("material")) group = "materials"
      else if (normalized.includes("finding") || normalized.includes("research")) group = "findings"
      else if (normalized.includes("asset") || normalized.includes("media")) group = "assets"
      else if (normalized.includes("url") || normalized.includes("link")) group = "urls"
      else if (normalized.includes("caveat") || normalized.includes("risk") || normalized.includes("gap")) group = "caveats"
      else group = undefined
      continue
    }
    const bullet = rawLine.replace(/^\s*[-*]\s+/, "").trim()
    if (!bullet || bullet.toLowerCase() === "none.") continue
    const wikilink = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(bullet)?.[1]?.trim()
    const value = wikilink || bullet
    if (group) links[group].push(value)
    else if (/^https?:\/\//i.test(value)) links.urls.push(value)
    else if (value.startsWith("assets/")) links.assets.push(value)
    else if (value.startsWith("researches/")) links.findings.push(value)
    else links.materials.push(value)
  }
  return normalizeSourceLinks(links)
}

function sourceLinksToNarrativeLinks(sourceLinks: DeckPlanSourceLinks, compatibility: DeckPlanNarrativeLink[] = []): DeckPlanNarrativeLink[] {
  const links: DeckPlanNarrativeLink[] = []
  for (const id of sourceLinks.materials) links.push({ id, relation: "uses_evidence", group: "materials" })
  for (const id of sourceLinks.findings) links.push({ id, relation: "uses_evidence", group: "findings" })
  for (const id of sourceLinks.assets) links.push({ id, relation: "uses_evidence", group: "assets" })
  for (const id of sourceLinks.urls) links.push({ id, relation: "uses_evidence", group: "urls" })
  for (const id of sourceLinks.caveats) links.push({ id, relation: "mentions_gap", group: "caveats" })
  return uniqueLinks([...links, ...compatibility])
}

function parseBulletText(section: string): string[] {
  return section
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line && line.toLowerCase() !== "none.")
}

function relationForDeckPlanLink(group: string, id: string): DeckPlanNarrativeLink["relation"] {
  const normalized = group.toLowerCase()
  if (normalized.includes("source") || normalized.includes("material")) return "uses_evidence"
  if (normalized.includes("finding") || normalized.includes("research")) return "uses_evidence"
  if (normalized.includes("asset") || normalized.includes("media")) return "uses_evidence"
  if (normalized.includes("evidence") || id.startsWith("evidence")) return "uses_evidence"
  if (normalized.includes("risk") || id.startsWith("risk")) return "addresses_risk"
  if (normalized.includes("objection") || id.startsWith("objection")) return "answers_objection"
  if (normalized.includes("gap") || id.startsWith("gap") || id.startsWith("research-gap")) return "mentions_gap"
  return "uses_claim"
}

function inferredLinkGroup(id: string, knownNodeIds?: Set<string>): string {
  if (id.startsWith("researches/")) return "findings"
  if (id.startsWith("assets/")) return "assets"
  if (id.startsWith("evidence")) return "evidence"
  if (id.startsWith("risk")) return "risk"
  if (id.startsWith("objection")) return "objection"
  if (id.startsWith("gap") || id.startsWith("research-gap")) return "gaps"
  if (knownNodeIds?.has(id)) return "claims"
  return "unknown"
}

function deckPlanIndexDiagnostics(slides: DeckPlanSlideProjection[]): DeckPlanProjectionDiagnostic[] {
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  if (slides.length === 0) diagnostics.push({ severity: "warning", code: "deck_plan_slides_missing", message: "deck-plan.md contains no slide blocks." })
  const seen = new Map<number, DeckPlanSlideProjection>()
  let previous = 0
  for (const slide of slides) {
    if (!slide.slideIndex || slide.slideIndex < 1) {
      diagnostics.push({ severity: "warning", code: "slide_index_missing", message: `Deck-plan slide ${slide.id} is missing a positive 1-based slideIndex.`, file: slide.path, nodeId: slide.id })
      continue
    }
    const duplicate = seen.get(slide.slideIndex)
    if (duplicate) diagnostics.push({ severity: "warning", code: "slide_index_duplicate", message: `Deck-plan slideIndex ${slide.slideIndex} is duplicated by ${duplicate.id} and ${slide.id}.`, file: slide.path, nodeId: slide.id })
    if (slide.slideIndex <= previous) diagnostics.push({ severity: "warning", code: "slide_index_order", message: `Deck-plan slide ${slide.id} is not in strictly increasing slideIndex order.`, file: slide.path, nodeId: slide.id })
    previous = slide.slideIndex
    seen.set(slide.slideIndex, slide)
  }
  return diagnostics
}

function buildHtmlWritingBatches(slides: DeckPlanSlideProjection[]): DeckPlanHtmlWritingBatch[] {
  const ordered = slides
    .filter((slide) => Number.isInteger(slide.slideIndex) && (slide.slideIndex ?? 0) > 0)
    .sort((a, b) => (a.slideIndex ?? Number.MAX_SAFE_INTEGER) - (b.slideIndex ?? Number.MAX_SAFE_INTEGER))
  const chapterGroups: Array<{ chapterTitle: string; slideIndexes: number[] }> = []
  for (const slide of ordered) {
    const chapterTitle = slide.chapter || "Unassigned"
    const current = chapterGroups[chapterGroups.length - 1]
    if (current && current.chapterTitle === chapterTitle) current.slideIndexes.push(slide.slideIndex!)
    else chapterGroups.push({ chapterTitle, slideIndexes: [slide.slideIndex!] })
  }
  const batches: DeckPlanHtmlWritingBatch[] = []
  for (const group of chapterGroups) {
    const chunks = chunkNumbers(group.slideIndexes, MAX_HTML_SLIDES_PER_BATCH)
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]
      const chapterSuffix = chunks.length > 1 ? ` part ${index + 1}` : ""
      const label = batches.length === 0
        ? `Initial shell and ${group.chapterTitle}${chapterSuffix}`
        : `${group.chapterTitle}${chapterSuffix}`
      batches.push({
        label,
        chapterTitle: group.chapterTitle,
        slideIndexes: chunk,
        maxSlides: MAX_HTML_SLIDES_PER_BATCH,
        instructions: batches.length === 0
          ? `Create or update the foundation if needed, then write only slide sections ${formatSlideRange(chunk)}. Do not add or rewrite more than ${MAX_HTML_SLIDES_PER_BATCH} slide sections in this write.`
          : `Patch only slide sections ${formatSlideRange(chunk)}, preserve previously written slides, and keep the file valid after the patch. Do not add or rewrite more than ${MAX_HTML_SLIDES_PER_BATCH} slide sections in this write.`,
      })
    }
  }
  return batches
}

function chunkNumbers(values: number[], size: number): number[][] {
  const chunks: number[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

function htmlWritingInstruction(): string {
  return `Before every HTML write/edit/apply_patch, follow htmlWritingBatches and add or rewrite at most ${MAX_HTML_SLIDES_PER_BATCH} <section class="slide"> blocks. Run Artifact QA after each batch before continuing.`
}

function slideDiagnostics(slide: DeckPlanSlideProjection, knownNodeIds?: Set<string>): DeckPlanProjectionDiagnostic[] {
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  if (!slide.structural && linksCount(slide.sourceLinks) === 0) diagnostics.push({ severity: "warning", code: "slide_source_link_missing", message: `Non-structural deck-plan slide ${slide.id} has no material, finding, asset, or URL source link.`, file: slide.path, nodeId: slide.id })
  if (!slide.structural && linksCount(slide.sourceLinks) > 0) diagnostics.push(...slideSynthesisDiagnostics(slide))
  if (!slide.layout) diagnostics.push({ severity: "warning", code: "slide_layout_missing", message: `Deck-plan slide ${slide.id} is missing a layout.`, file: slide.path, nodeId: slide.id })
  if (slide.components.length === 0) diagnostics.push({ severity: "warning", code: "slide_components_missing", message: `Deck-plan slide ${slide.id} has no component names in frontmatter.`, file: slide.path, nodeId: slide.id })
  if (slide.componentPlan.length === 0) diagnostics.push({ severity: "warning", code: "slide_component_plan_missing", message: `Deck-plan slide ${slide.id} is missing structured ## Component Plan entries.`, file: slide.path, nodeId: slide.id })
  for (const component of slide.componentPlan) {
    for (const key of ["name", "slot", "position", "purpose", "content"] as const) {
      if (!component[key] || (Array.isArray(component[key]) && component[key].length === 0)) diagnostics.push({ severity: "warning", code: "slide_component_plan_incomplete", message: `Deck-plan slide ${slide.id} has incomplete component plan entry for ${component.name || "unnamed component"}: missing ${key}.`, file: slide.path, nodeId: slide.id })
    }
  }
  if (knownNodeIds) {
    for (const link of slide.links) {
      if (!knownNodeIds.has(link.id)) diagnostics.push({ severity: "warning", code: "deck_plan_broken_link", message: `Deck-plan slide ${slide.id} links to unknown narrative node ${link.id}.`, file: slide.path, nodeId: slide.id })
    }
  }
  return diagnostics
}

function slideSynthesisDiagnostics(slide: DeckPlanSlideProjection): DeckPlanProjectionDiagnostic[] {
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  const contentPlan = singleFileSubsection(slide.markdown, "Content Plan")
  const missing = ["Claim", "Reasoning", "Audience takeaway"].filter((field) => !hasPlanField(contentPlan, field))
  if (missing.length > 0) diagnostics.push({
    severity: "warning",
    code: "slide_synthesis_thin",
    message: `Non-structural deck-plan slide ${slide.id} has source links but lacks synthesis fields in Content Plan: ${missing.join(", ")}.`,
    file: slide.path,
    nodeId: slide.id,
  })
  if (contentPlanContainsFindingCopy(contentPlan)) diagnostics.push({
    severity: "warning",
    code: "slide_finding_copy_risk",
    message: `Deck-plan slide ${slide.id} appears to use raw finding text in Content Plan; use synthesis for the claim, reasoning, and audience takeaway, and keep findings as evidence/source context.`,
    file: slide.path,
    nodeId: slide.id,
  })
  return diagnostics
}

function hasPlanField(markdown: string, field: string): boolean {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^\\s*[-*]?\\s*${escaped}\\s*:`, "im").test(markdown)
}

function contentPlanContainsFindingCopy(markdown: string): boolean {
  return /^\s*[-*]?\s*(Finding|Quote\/Snippet|Source|URL)\s*:/im.test(markdown)
}

export function deckPlanDesignDiagnostics(projection: DeckPlanProjection | undefined, inventory: { layouts: string[]; components: string[]; layoutSlots?: Record<string, string[]>; componentNesting?: Record<string, { acceptsChildren: boolean; allowedChildren?: string[] }> }): DeckPlanProjectionDiagnostic[] {
  if (!projection) return []
  const layouts = new Set(inventory.layouts)
  const components = new Set(inventory.components)
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  for (const slide of projection.slides) {
    if (slide.layout && !layouts.has(slide.layout)) diagnostics.push({ severity: "warning", code: "slide_layout_unknown", message: `Deck-plan slide ${slide.id} uses layout '${slide.layout}' outside the active design inventory.`, file: slide.path, nodeId: slide.id })
    for (const component of slide.componentPlan) diagnostics.push(...componentDesignDiagnostics(slide, component, inventory, components))
  }
  return diagnostics
}

function componentDesignDiagnostics(slide: DeckPlanSlideProjection, component: DeckPlanSlideComponentPlan, inventory: { layoutSlots?: Record<string, string[]>; componentNesting?: Record<string, { acceptsChildren: boolean; allowedChildren?: string[] }> }, components: Set<string>): DeckPlanProjectionDiagnostic[] {
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  if (component.name && !components.has(component.name)) diagnostics.push({ severity: "warning", code: "slide_component_plan_unknown", message: `Deck-plan slide ${slide.id} component plan uses '${component.name}' outside the active design inventory.`, file: slide.path, nodeId: slide.id })
  const allowedSlots = slide.layout ? inventory.layoutSlots?.[slide.layout] : undefined
  if (component.slot && allowedSlots && allowedSlots.length > 0 && !allowedSlots.includes(component.slot)) diagnostics.push({ severity: "warning", code: "slide_component_slot_invalid", message: `Deck-plan slide ${slide.id} component '${component.name}' uses slot '${component.slot}' outside layout '${slide.layout}' slots: ${allowedSlots.join(", ")}.`, file: slide.path, nodeId: slide.id })
  const nesting = inventory.componentNesting?.[component.name]
  if ((component.children?.length ?? 0) > 0 && nesting && !nesting.acceptsChildren) diagnostics.push({ severity: "warning", code: "slide_component_children_invalid", message: `Deck-plan slide ${slide.id} component '${component.name}' does not accept children.`, file: slide.path, nodeId: slide.id })
  for (const child of component.children ?? []) diagnostics.push(...componentDesignDiagnostics(slide, child, inventory, components))
  return diagnostics
}

function validateDeckPlanSlideUpsert(input: DeckPlanSlideUpsertInput, options: { designLayouts: string[]; designComponents: string[]; layoutSlots?: Record<string, string[]>; componentNesting?: Record<string, { acceptsChildren: boolean; allowedChildren?: string[] }> }): DeckPlanProjectionDiagnostic[] {
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  const nodeId = input.id?.trim() || `slide-${input.slideIndex}`
  if (!Number.isInteger(input.slideIndex) || input.slideIndex < 1) diagnostics.push(errorDiagnostic("slide_index_invalid", "slideIndex must be a positive 1-based integer.", nodeId))
  for (const [key, value] of [["title", input.title], ["chapter", input.chapter], ["narrativeRole", input.narrativeRole], ["layout", input.layout]] as const) {
    if (!String(value || "").trim()) diagnostics.push(errorDiagnostic(`slide_${key}_missing`, `${key} is required.`, nodeId))
  }
  if (!options.designLayouts.includes(input.layout)) diagnostics.push(errorDiagnostic("slide_layout_unknown", `Layout '${input.layout}' is not in the selected design inventory.`, nodeId))
  if (!Array.isArray(input.components) || input.components.length === 0) diagnostics.push(errorDiagnostic("slide_components_missing", "At least one component plan entry is required.", nodeId))
  const componentNames = new Set<string>()
  const positions = new Set<string>()
  const allowedSlots = options.layoutSlots?.[input.layout]
  for (const component of input.components ?? []) {
    validateComponentInput(component, { nodeId, componentNames, positions, options, allowedSlots, parentName: undefined, topLevel: true, diagnostics })
  }
  const visual = normalizeVisualIntent(input.visualIntent)
  if (visual.component && !componentNames.has(visual.component)) diagnostics.push(errorDiagnostic("slide_visual_component_missing", `visualIntent.component '${visual.component}' is not present in component plan.`, nodeId))
  const sourceLinks = sourceLinksForInput(input)
  if (!input.structural && linksCount(sourceLinks) === 0) diagnostics.push({ severity: "warning", code: "slide_source_link_missing", message: "Non-structural slides should include at least one material, finding, asset, or URL source link.", nodeId })
  return diagnostics
}

function validateComponentInput(component: DeckPlanSlideUpsertComponentInput, context: {
  nodeId: string
  componentNames: Set<string>
  positions: Set<string>
  options: { designComponents: string[]; componentNesting?: Record<string, { acceptsChildren: boolean; allowedChildren?: string[] }> }
  allowedSlots?: string[]
  parentName?: string
  topLevel: boolean
  diagnostics: DeckPlanProjectionDiagnostic[]
}): void {
    const name = component.name?.trim()
    if (name) context.componentNames.add(name)
    if (!name) context.diagnostics.push(errorDiagnostic("slide_component_name_missing", "Every component requires name.", context.nodeId))
    else if (!context.options.designComponents.includes(name)) context.diagnostics.push(errorDiagnostic("slide_component_unknown", `Component '${name}' is not in the selected design inventory.`, context.nodeId))
    for (const key of ["slot", "position", "purpose", "content"] as const) {
      if (!String(component[key] || "").trim()) context.diagnostics.push(errorDiagnostic("slide_component_plan_incomplete", `Component '${name || "unnamed"}' is missing ${key}.`, context.nodeId))
    }
    if (context.topLevel && component.slot && context.allowedSlots && context.allowedSlots.length > 0 && !context.allowedSlots.includes(component.slot.trim())) context.diagnostics.push(errorDiagnostic("slide_component_slot_invalid", `Component '${name || "unnamed"}' slot '${component.slot}' is not valid for this layout. Allowed slots: ${context.allowedSlots.join(", ")}.`, context.nodeId))
    if (component.position && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(component.position)) context.diagnostics.push(errorDiagnostic("slide_component_position_invalid", `Component '${name || "unnamed"}' position must be a non-empty kebab-case anchor.`, context.nodeId))
    const positionKey = `${component.slot?.trim() || ""}:${component.position?.trim() || ""}`
    if (component.slot?.trim() && component.position?.trim()) {
      if (context.positions.has(positionKey)) context.diagnostics.push(errorDiagnostic("slide_component_position_duplicate", `Duplicate component slot/position '${positionKey}' makes the plan ambiguous.`, context.nodeId))
      context.positions.add(positionKey)
    }
    const children = component.children ?? []
    const nesting = name ? context.options.componentNesting?.[name] : undefined
    if (children.length > 0 && nesting && !nesting.acceptsChildren) context.diagnostics.push(errorDiagnostic("slide_component_children_invalid", `Component '${name}' does not accept children. Use box as the semantic container.`, context.nodeId))
    if (children.length > 0 && nesting?.allowedChildren) {
      for (const child of children) {
        if (child.name && !nesting.allowedChildren.includes(child.name)) context.diagnostics.push(errorDiagnostic("slide_component_child_invalid", `Component '${name}' cannot contain child '${child.name}'.`, context.nodeId))
      }
    }
    for (const child of children) validateComponentInput(child, { ...context, parentName: name, topLevel: false })
}

function linksCount(sourceLinks: DeckPlanSourceLinks): number {
  return sourceLinks.materials.length + sourceLinks.findings.length + sourceLinks.assets.length + sourceLinks.urls.length
}

function errorDiagnostic(code: string, message: string, nodeId?: string): DeckPlanProjectionDiagnostic {
  return { severity: "error", code, message, nodeId }
}

function parseDeckPlanComponentPlan(section: string): DeckPlanSlideComponentPlan[] {
  const components: DeckPlanSlideComponentPlan[] = []
  let current: DeckPlanSlideComponentPlan | undefined
  let currentChild: DeckPlanSlideComponentPlan | undefined
  let capture: "content" | undefined
  const flush = () => {
    if (currentChild && current) {
      current.children = [...(current.children ?? []), normalizeComponentPlan(currentChild)]
      currentChild = undefined
    }
    if (current) components.push({
      ...normalizeComponentPlan(current),
      children: current.children,
    })
  }
  const target = () => currentChild ?? current
  const startComponent = (name: string, child: boolean) => {
    if (child && current) {
      if (currentChild) current.children = [...(current.children ?? []), normalizeComponentPlan(currentChild)]
      currentChild = blankComponentPlan(name)
    } else {
      flush()
      current = blankComponentPlan(name)
      currentChild = undefined
    }
  }
  for (const rawLine of section.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{3,6})\s+(.+?)\s*$/.exec(rawLine)
    if (heading) {
      startComponent(heading[2].trim(), heading[1].length > 5)
      capture = undefined
      continue
    }
    if (!current) continue
    const line = rawLine.trim()
    const field = /^-\s+([A-Za-z][A-Za-z ]+):\s*(.*)$/.exec(line)
    if (field) {
      capture = undefined
      const key = field[1].toLowerCase()
      const value = field[2].trim()
      const item = target()
      if (!item) continue
      if (key === "slot") item.slot = value
      else if (key === "position") item.position = value
      else if (key === "placement note") item.placementNote = value
      else if (key === "purpose") item.purpose = value
      else if (key === "content") {
        item.content = cleanPlanValue(value)
        capture = value ? undefined : "content"
      } else if (key === "claim ids") item.claimIds = parseCsv(value)
      else if (key === "evidence ids") item.evidenceIds = parseCsv(value)
      else if (key === "source notes") item.sourceNotes = parseListValue(value)
      else if (key === "render notes") item.renderNotes = parseListValue(value)
      continue
    }
    if (capture === "content" && rawLine.trim()) {
      const item = target()
      if (item) item.content += `${item.content ? "\n" : ""}${rawLine.replace(/^\s{2}/, "")}`
    }
  }
  flush()
  return components
}

function blankComponentPlan(name: string): DeckPlanSlideComponentPlan {
  return { name, slot: "", position: "", purpose: "", content: "", claimIds: [], evidenceIds: [], sourceNotes: [], renderNotes: [] }
}

function normalizeComponentPlan(component: DeckPlanSlideComponentPlan): DeckPlanSlideComponentPlan {
  return {
    ...component,
    content: component.content.trim(),
    claimIds: uniqueStrings(component.claimIds),
    evidenceIds: uniqueStrings(component.evidenceIds),
    sourceNotes: component.sourceNotes.filter(Boolean),
    renderNotes: component.renderNotes.filter(Boolean),
    children: component.children?.map(normalizeComponentPlan),
  }
}

function renderDeckPlanSlideMarkdown(input: DeckPlanSlideUpsertInput & { id: string }): string {
  const components = input.components.map((component) => component.name.trim())
  const lines: string[] = []
  lines.push("---")
  lines.push("type: deck-plan-slide")
  lines.push(`id: ${input.id}`)
  lines.push(`slideIndex: ${input.slideIndex}`)
  lines.push(`title: ${yamlScalar(input.title)}`)
  lines.push(`chapter: ${yamlScalar(input.chapter)}`)
  lines.push(`layout: ${input.layout.trim()}`)
  lines.push(`components: [${components.map(yamlScalar).join(", ")}]`)
  lines.push(`structural: ${input.structural ? "true" : "false"}`)
  lines.push(`narrativeRole: ${yamlScalar(input.narrativeRole)}`)
  lines.push("---")
  lines.push("")
  lines.push(`# ${input.title.trim()}`)
  lines.push("")
  lines.push("## Purpose")
  lines.push("")
  lines.push(input.narrativeRole.trim())
  lines.push("")
  lines.push("## Visual Intent")
  lines.push("")
  lines.push(renderVisualIntent(input.visualIntent))
  lines.push("")
  lines.push("## Component Plan")
  lines.push("")
  for (const component of input.components) {
    lines.push(`### ${component.name.trim()}`)
    lines.push("")
    lines.push(`- Slot: ${component.slot.trim()}`)
    lines.push(`- Position: ${component.position.trim()}`)
    if (component.placementNote?.trim()) lines.push(`- Placement note: ${component.placementNote.trim()}`)
    lines.push(`- Purpose: ${component.purpose.trim()}`)
    lines.push("- Content:")
    lines.push(...indentMultiline(component.content.trim()))
    lines.push(`- Claim ids: ${formatCsv(component.claimIds)}`)
    lines.push(`- Evidence ids: ${formatCsv(component.evidenceIds)}`)
    lines.push(`- Source notes: ${formatListValue(component.sourceNotes)}`)
    lines.push(`- Render notes: ${formatListValue(component.renderNotes)}`)
    lines.push("")
  }
  lines.push(renderSourceLinksMarkdown(sourceLinksForInput(input)).replace(/^####/gm, "##"))
  return lines.join("\n")
}

function ensureDeckPlanIndex(workspaceRoot: string, narrativeHash?: string): void {
  const absolutePath = join(workspaceRoot, DECK_PLAN_INDEX_PATH)
  if (existsSync(absolutePath)) return
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, renderMinimalDeckPlanIndex(narrativeHash, []), "utf-8")
}

function updateDeckPlanIndex(workspaceRoot: string, narrativeHash?: string): void {
  const projection = readDeckPlanProjection(workspaceRoot, { narrativeHash })
  const slides = projection?.slides ?? []
  writeFileSync(join(workspaceRoot, DECK_PLAN_INDEX_PATH), renderMinimalDeckPlanIndex(narrativeHash || projection?.narrativeHash, slides), "utf-8")
}

function renderMinimalDeckPlanIndex(narrativeHash: string | undefined, slides: DeckPlanSlideProjection[]): string {
  const chapterMap = new Map<string, number[]>()
  for (const slide of slides) {
    const chapter = slide.chapter || "Unassigned"
    chapterMap.set(chapter, [...(chapterMap.get(chapter) ?? []), slide.slideIndex ?? 0].filter(Boolean))
  }
  const lines: string[] = []
  lines.push("---")
  lines.push("id: deck-plan")
  if (narrativeHash) lines.push(`narrativeHash: ${narrativeHash}`)
  lines.push("---")
  lines.push("")
  lines.push("# Deck Plan")
  lines.push("")
  lines.push("## Source Authority")
  lines.push("")
  lines.push("- Sources: local materials, reviewed findings, workspace assets, URLs, and user intent.")
  lines.push("- Render planning: `deck-plan.md` is the execution blueprint for HTML deck generation.")
  lines.push("")
  lines.push("## Audience / Goal / Decision")
  lines.push("")
  lines.push("- To be specified by narrative state and user intent.")
  lines.push("")
  lines.push("## Deck Parameters")
  lines.push("")
  lines.push(`- Slide count: ${slides.length}`)
  if (narrativeHash) lines.push(`- Narrative hash: \`${narrativeHash}\``)
  lines.push("")
  lines.push("## Chapter Map")
  lines.push("")
  if (chapterMap.size === 0) lines.push("- No slides planned yet.")
  else for (const [chapter, indexes] of chapterMap) lines.push(`- ${chapter}: slides ${formatSlideRange(indexes)}`)
  lines.push("")
  lines.push("## Slide Plan")
  lines.push("")
  if (slides.length === 0) lines.push("- No slide blocks yet.")
  else for (const slide of slides) lines.push(`- Slide ${slide.slideIndex}: [[${slide.id}]] - ${slide.title} (${slide.path}); layout ${slide.layout || "unspecified"}; components ${slide.components.join(", ") || "none"}.`)
  lines.push("")
  lines.push("## Evidence Trace")
  lines.push("")
  const evidenceIds = uniqueStrings(slides.flatMap((slide) => slide.links.filter((link) => link.relation === "uses_evidence").map((link) => link.id)))
  if (evidenceIds.length === 0) lines.push("- No evidence links planned yet.")
  else for (const id of evidenceIds) lines.push(`- [[${id}]]`)
  lines.push("")
  lines.push("## Source Limitations")
  lines.push("")
  const boundaryIds = uniqueStrings(slides.flatMap((slide) => slide.links.filter((link) => link.relation === "addresses_risk" || link.relation === "answers_objection" || link.relation === "mentions_gap").map((link) => link.id)))
  if (boundaryIds.length === 0) lines.push("- No legacy risk, objection, or gap links planned.")
  else for (const id of boundaryIds) lines.push(`- [[${id}]]`)
  lines.push("")
  lines.push("## Chapter Writing Batches")
  lines.push("")
  if (chapterMap.size === 0) lines.push("- No chapter batches yet.")
  else for (const [chapter, indexes] of chapterMap) lines.push(`- ${chapter}: slides ${formatSlideRange(indexes)}.`)
  lines.push("")
  lines.push("## HTML Identity Contract")
  lines.push("")
  lines.push("- Render one `<section class=\"slide\" data-slide-index=\"N\">` per planned slide.")
  lines.push("- Use positive 1-based slide indexes, unique indexes, DOM order, and one direct `.slide-canvas` child per slide.")
  lines.push("")
  return lines.join("\n")
}

function narrativeHashFromMarkdown(markdown: string): string {
  const match = markdown.match(/narrativeHash:\s*`?([^`\s]+)`?/)
  return match?.[1]?.trim() ?? ""
}

function relativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).replace(/\\/g, "/")
}

function stringField(frontmatter: Record<string, string | string[] | boolean>, key: string): string {
  const value = frontmatter[key]
  return typeof value === "string" ? value.trim() : ""
}

function numberField(frontmatter: Record<string, string | string[] | boolean>, key: string): number | undefined {
  const value = Number(stringField(frontmatter, key))
  return Number.isFinite(value) ? value : undefined
}

function booleanField(frontmatter: Record<string, string | string[] | boolean>, key: string, fallback: boolean): boolean {
  const value = frontmatter[key]
  if (typeof value === "boolean") return value
  if (typeof value === "string" && (value === "true" || value === "false")) return value === "true"
  return fallback
}

function arrayField(frontmatter: Record<string, string | string[] | boolean>, key: string): string[] {
  const value = frontmatter[key]
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter((item) => item && item.toLowerCase() !== "none")
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter((item) => item && item.toLowerCase() !== "none")
  return []
}

function normalizeVisualIntent(input: DeckPlanSlideUpsertInput["visualIntent"]): { kind?: string; component?: string; rationale?: string; brief?: string } {
  if (typeof input === "string") return { brief: input.trim() }
  return {
    kind: input.kind?.trim(),
    component: input.component?.trim(),
    rationale: input.rationale?.trim(),
    brief: input.brief?.trim(),
  }
}

function renderVisualIntent(input: DeckPlanSlideUpsertInput["visualIntent"]): string {
  const visual = normalizeVisualIntent(input)
  const lines: string[] = []
  if (visual.kind) lines.push(`- Kind: ${visual.kind}`)
  if (visual.component) lines.push(`- Component: ${visual.component}`)
  if (visual.rationale) lines.push(`- Rationale: ${visual.rationale}`)
  if (visual.brief) lines.push(`- Brief: ${visual.brief}`)
  if (lines.length === 0) lines.push("- Brief: Not specified.")
  return lines.join("\n")
}

function indentMultiline(value: string): string[] {
  return value.replace(/\r\n/g, "\n").split("\n").map((line) => `  ${line}`)
}

function yamlScalar(value: string): string {
  const trimmed = value.trim()
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed
  return JSON.stringify(trimmed)
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return slug || "slide"
}

function formatCsv(value: string[] | undefined): string {
  const items = uniqueStrings(value ?? [])
  return items.length > 0 ? items.join(", ") : "none"
}

function parseCsv(value: string): string[] {
  const cleaned = cleanPlanValue(value)
  if (!cleaned || cleaned.toLowerCase() === "none") return []
  return cleaned.split(",").map((item) => item.trim()).filter(Boolean)
}

function formatListValue(value: string[] | undefined): string {
  const items = (value ?? []).map((item) => item.trim()).filter(Boolean)
  return items.length > 0 ? items.join(" | ") : "none"
}

function parseListValue(value: string): string[] {
  const cleaned = cleanPlanValue(value)
  if (!cleaned || cleaned.toLowerCase() === "none") return []
  return cleaned.split("|").map((item) => item.trim()).filter(Boolean)
}

function cleanPlanValue(value: string): string {
  return value.replace(/^`|`$/g, "").trim()
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function titleFromSectionKey(key: string): string {
  return key.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ")
}

function fileId(file: string): string {
  return file.replace(/\.md$/i, "")
}

function uniqueLinks(links: DeckPlanNarrativeLink[]): DeckPlanNarrativeLink[] {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = `${link.relation}:${link.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function renderDeckPlanMarkdown(input: DeckPlanArtifactInput): string {
  const lines: string[] = []
  lines.push("# Revela Deck Plan")
  lines.push("")
  lines.push("This file is the execution blueprint for HTML deck generation. Canonical meaning remains in `revela-narrative/`; `DECKS.json` remains compatibility/render state and cached projection data, not the HTML slide-count authority.")
  lines.push("")
  lines.push("## Plan Metadata")
  lines.push("")
  lines.push(`- Deck slug: \`${input.deck.slug}\``)
  lines.push(`- Output path: \`${input.deck.outputPath}\``)
  lines.push(`- Compiled at: \`${input.compiledAt}\``)
  lines.push(`- Narrative hash: \`${input.narrativeHash}\``)
  lines.push(`- Plan hash: \`${input.planHash}\``)
  lines.push(`- Slide count: ${input.deck.slides.length}`)
  lines.push("")
  if (input.renderPlan) {
    lines.push("## Source Authority")
    lines.push("")
    lines.push(`- Meaning: ${input.renderPlan.sourceAuthority.meaning}`)
    lines.push(`- Render plan: ${input.renderPlan.sourceAuthority.renderPlan}`)
    lines.push(`- State: ${input.renderPlan.sourceAuthority.state}`)
    lines.push(`- HTML identity: ${input.renderPlan.sourceAuthority.htmlIdentity}`)
    lines.push("")
    lines.push("## Render Rules")
    lines.push("")
    for (const rule of input.renderPlan.renderRules) lines.push(`- ${rule}`)
    lines.push("")
    lines.push("## Chapter Requirements")
    lines.push("")
    for (const requirement of input.renderPlan.chapterRequirements) {
      lines.push(`- ${requirement.title}: required substance slides ${requirement.requiredSubstanceSlides}, actual substance slides ${requirement.actualSubstanceSlides}; structural slides allowed: ${requirement.allowedStructuralSlides.join(", ") || "none"}.`)
    }
    lines.push("")
  }
  lines.push("## Deck Contract")
  lines.push("")
  lines.push("- Write one `<section class=\"slide\" data-slide-index=\"N\">` per planned slide in the completed deck, using positive 1-based slide indexes that are unique and strictly increase in DOM order. Partial chapter-by-chapter drafts may contain only the written prefix/range.")
  lines.push("- Keep every rendered slide exactly 1920x1080px with no page-level scrollbars or hidden overflow.")
  lines.push("- Preserve claim-led chapters, visual intent, evidence ids, source trace, source limitations, unresolved inputs, and user review notes.")
  lines.push(`- Generate HTML in the listed writing batches; do not add or rewrite more than ${MAX_HTML_SLIDES_PER_BATCH} slide sections in one write or patch.`)
  lines.push("")
  lines.push("## Chapter Map")
  lines.push("")
  for (const chapter of input.chapters) {
    lines.push(`- ${chapter.title} (${chapter.role}): slides ${formatSlideRange(chapter.slideIndexes)}${chapter.sourceClaimId ? `; claim ${chapter.sourceClaimId}` : ""}`)
  }
  lines.push("")
  lines.push("## Slide Plan")
  lines.push("")
  for (const slide of input.deck.slides) lines.push(renderSlidePlan(slide, input.renderPlan?.slideRenderMetadata.find((item) => item.index === slide.index)))
  if (input.renderPlan) {
    lines.push("## Slide Render Metadata")
    lines.push("")
    for (const slide of input.renderPlan.slideRenderMetadata) lines.push(renderSlideMetadata(slide))
  }
  lines.push("## Chapter Writing Batches")
  lines.push("")
  lines.push(`Use these batches for HTML generation. Each batch is capped at ${MAX_HTML_SLIDES_PER_BATCH} slide sections. Keep the HTML valid after every batch and preserve previously written slides.`)
  lines.push("")
  if (input.renderPlan) {
    for (const batch of input.renderPlan.chapterWritingBatches) lines.push(`- ${batch.label}: ${batch.chapterTitle}, slides ${formatSlideRange(batch.slideIndexes)}; max ${batch.maxSlides} slides. ${batch.instructions}`)
  } else {
    input.chapters.forEach((chapter, index) => {
      const prefix = index === 0 ? "Initial shell and first chapter" : `Chapter batch ${index + 1}`
      for (const [chunkIndex, chunk] of chunkNumbers(chapter.slideIndexes, MAX_HTML_SLIDES_PER_BATCH).entries()) {
        const suffix = chunkIndex === 0 ? "" : ` part ${chunkIndex + 1}`
        lines.push(`- ${prefix}${suffix}: ${chapter.title}, slides ${formatSlideRange(chunk)}; max ${MAX_HTML_SLIDES_PER_BATCH} slides.`)
      }
    })
  }
  if (input.renderPlan) {
    lines.push("")
    lines.push("## HTML Identity Contract")
    lines.push("")
    for (const rule of input.renderPlan.htmlIdentityContract) lines.push(`- ${rule}`)
  }
  lines.push("")
  lines.push("## Quality Checks")
  lines.push("")
  for (const check of input.qualityChecks) lines.push(`- ${check.status}: ${check.id} - ${check.message}`)
  lines.push("")
  lines.push("## Approval")
  lines.push("")
  lines.push("Edit this block to approve the deck plan. Keep `planHash` and `narrativeHash` unchanged.")
  lines.push("")
  lines.push("```yaml")
  lines.push("status: pending")
  lines.push("approvedBy:")
  lines.push("approvedAt:")
  lines.push("approvalNote:")
  lines.push(`planHash: ${input.planHash}`)
  lines.push(`narrativeHash: ${input.narrativeHash}`)
  lines.push("```")
  lines.push("")
  return `${lines.join("\n")}\n`
}

function renderSlidePlan(slide: SlideSpec, metadata?: RenderPlanSlideMetadata): string {
  const lines: string[] = []
  const contentData = slide.content?.data as { visualIntent?: { kind?: string; component?: string; rationale?: string } } | undefined
  const visualIntent = contentData?.visualIntent
  lines.push(`### Slide ${slide.index}: ${slide.title}`)
  lines.push("")
  lines.push(`- Purpose: ${slide.purpose}`)
  lines.push(`- Role: ${slide.narrativeRole}`)
  if (metadata) {
    lines.push(`- Slide kind: ${metadata.slideKind}`)
    lines.push(`- Structural: ${metadata.structural ? "yes" : "no"}`)
    lines.push(`- Counts toward claim substance: ${metadata.countsTowardClaimSubstance ? "yes" : "no"}`)
    lines.push(`- Chapter requirement: ${metadata.claimChapterRequirement ?? "none"}`)
    lines.push(`- Evidence trace required: ${metadata.evidenceTraceRequired ? "yes" : "no"}`)
  }
  lines.push(`- Layout: ${slide.layout}`)
  lines.push(`- Components: ${(slide.components ?? []).join(", ") || "none"}`)
  lines.push(`- Claim refs: ${(slide.claimRefs ?? []).map((ref) => `${ref.claimId} (${ref.role})`).join(", ") || (slide.claimIds ?? []).join(", ") || "none"}`)
  lines.push(`- Evidence bindings: ${(slide.evidenceBindingIds ?? []).join(", ") || "none"}`)
  lines.push(`- Visual intent: ${visualIntent?.kind ?? "not specified"}${visualIntent?.component ? ` via ${visualIntent.component}` : ""}${visualIntent?.rationale ? ` - ${visualIntent.rationale}` : ""}`)
  lines.push(`- Visual brief: ${(slide.visuals ?? []).map((visual) => visual.brief).join(" | ") || "none"}`)
  lines.push(`- Evidence trace: ${renderEvidenceTrace(slide)}`)
  lines.push("")
  return lines.join("\n")
}

function renderSlideMetadata(slide: RenderPlanSlideMetadata): string {
  const lines: string[] = []
  lines.push(`- Slide ${slide.index}: ${slide.slideKind}; structural: ${slide.structural ? "yes" : "no"}; counts toward claim substance: ${slide.countsTowardClaimSubstance ? "yes" : "no"}; chapter: ${slide.chapterTitle ?? "none"}; requirement: ${slide.claimChapterRequirement ?? "none"}; components: ${slide.requiredComponents.join(", ") || "none"}; evidence trace required: ${slide.evidenceTraceRequired ? "yes" : "no"}.`)
  return lines.join("\n")
}

function renderEvidenceTrace(slide: SlideSpec): string {
  if (!slide.evidence || slide.evidence.length === 0) return "none"
  return slide.evidence.map((item) => {
    const source = item.source || item.sourcePath || item.findingsFile || item.url || "source unspecified"
    const detail = [item.quote, item.location || item.page, item.caveat].filter(Boolean).join("; ")
    return detail ? `${source} (${detail})` : source
  }).join(" | ")
}

function parseDeckPlanApproval(markdown: string): DeckPlanApproval | undefined {
  const heading = markdown.match(/^## Approval\s*$/m)
  if (!heading?.index && heading?.index !== 0) return undefined
  const section = markdown.slice(heading.index)
  const block = section.match(/```ya?ml\s*\n([\s\S]*?)\n```/i)
  if (!block) return undefined
  const approval: DeckPlanApproval = {}
  for (const rawLine of block[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!match) continue
    const value = cleanYamlScalar(match[2])
    if (match[1] === "status") approval.status = value
    if (match[1] === "approvedBy") approval.approvedBy = value
    if (match[1] === "approvedAt") approval.approvedAt = value
    if (match[1] === "approvalNote") approval.approvalNote = value
    if (match[1] === "planHash") approval.planHash = value
    if (match[1] === "narrativeHash") approval.narrativeHash = value
  }
  return approval
}

function stripApprovalSection(markdown: string): string {
  return markdown.replace(/^## Approval\s*$[\s\S]*$/m, "").trim()
}

function parseMarkdownSections(markdown: string): string[] {
  const sections: string[] = []
  for (const match of markdown.matchAll(/^##\s+(.+?)\s*$/gm)) sections.push(match[1].trim())
  return sections
}

function isPlaceholderPlanHash(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === "" || normalized === "pending" || normalized === "pending-deck-plan-md" || normalized === "computed-by-confirmdeckplan" || normalized === "computed-by-confirm-deck-plan"
}

function cleanYamlScalar(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1).trim()
  return trimmed
}

function formatSlideRange(indexes: number[]): string {
  if (indexes.length === 0) return "none"
  const sorted = [...indexes].sort((a, b) => a - b)
  if (sorted.length === 1) return String(sorted[0])
  return `${sorted[0]}-${sorted[sorted.length - 1]}`
}
