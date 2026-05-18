import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs"
import { dirname, join, relative } from "path"
import { createHash } from "crypto"
import type { DeckSpec, SlideSpec } from "../decks-state"
import { parseVaultFrontmatter } from "../narrative-vault/frontmatter"
import { splitMarkdownSections } from "../narrative-vault/markdown"
import { stableVaultRelationId } from "../narrative-vault/relations"
import type { VaultRelation, WorkspaceGraphNodeType } from "../narrative-vault/types"
import type { DeckPlanChapter, DeckPlanQualityCheck, RenderPlanContract, RenderPlanSlideMetadata } from "./render-plan"

export const DECK_PLAN_DIR = "deck-plan"
export const DECK_PLAN_INDEX_PATH = "deck-plan/index.md"
export const DECK_PLAN_SLIDES_DIR = "deck-plan/slides"
export const LEGACY_DECK_PLAN_ARTIFACT_PATH = "decks/deck-plan.md"
export const DECK_PLAN_ARTIFACT_PATH = DECK_PLAN_INDEX_PATH

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
  outputPath?: string
  slides: DeckPlanSlideProjection[]
  graphNodes: Array<{ id: string; type: WorkspaceGraphNodeType; file: string }>
  graphRelations: VaultRelation[]
  diagnostics: DeckPlanProjectionDiagnostic[]
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
  structural: boolean
  narrativeRole: string
  markdown: string
  frontmatter: Record<string, string | string[] | boolean>
  sections: string[]
  links: DeckPlanNarrativeLink[]
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
  "Source Authority",
  "Audience / Goal / Decision",
  "Deck Parameters",
  "Chapter Map",
  "Slide Plan",
  "Evidence Trace",
  "Boundary / Risk Treatment",
  "Chapter Writing Batches",
  "HTML Identity Contract",
]

export function writeDeckPlanArtifact(workspaceRoot: string, input: DeckPlanArtifactInput): { path: string; absolutePath: string } {
  const absolutePath = join(workspaceRoot, DECK_PLAN_ARTIFACT_PATH)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, renderDeckPlanMarkdown(input), "utf-8")
  return { path: DECK_PLAN_ARTIFACT_PATH, absolutePath }
}

export function readDeckPlanArtifact(workspaceRoot: string, expected?: { narrativeHash?: string; knownNodeIds?: Set<string> }): DeckPlanReadResult {
  const projection = readDeckPlanProjection(workspaceRoot, expected)
  const absolutePath = projection?.absolutePath ?? join(workspaceRoot, DECK_PLAN_INDEX_PATH)
  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      path: DECK_PLAN_INDEX_PATH,
      absolutePath,
      approvalStatus: "missing",
      sections: [],
      missingSections: REQUIRED_DECK_PLAN_SECTIONS,
      warnings: [],
      reason: `Deck plan file is missing: ${DECK_PLAN_INDEX_PATH}. Write the LLM-authored deck-plan/ projection before HTML generation.`,
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
    path: projection?.path ?? DECK_PLAN_INDEX_PATH,
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
  const indexPath = join(workspaceRoot, DECK_PLAN_INDEX_PATH)
  const legacyPath = join(workspaceRoot, LEGACY_DECK_PLAN_ARTIFACT_PATH)
  const absolutePath = existsSync(indexPath) ? indexPath : existsSync(legacyPath) ? legacyPath : ""
  if (!absolutePath) return undefined
  const markdown = readFileSync(absolutePath, "utf-8")
  const parsed = parseVaultFrontmatter(markdown)
  const split = splitMarkdownSections(parsed.body)
  const sections = parseMarkdownSections(markdown)
  const path = relativePath(workspaceRoot, absolutePath)
  const id = stringField(parsed.frontmatter, "id") || "deck-plan"
  const slides = existsSync(join(root, "slides")) ? readDeckPlanSlideFiles(workspaceRoot, expected?.knownNodeIds) : []
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
  return {
    path,
    absolutePath,
    id,
    markdown,
    frontmatter: parsed.frontmatter,
    sections,
    narrativeHash,
    outputPath: stringField(parsed.frontmatter, "outputPath"),
    slides,
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
    const links = parseDeckPlanNarrativeLinks(split.sections["narrative-links"] ?? parsed.body, knownNodeIds)
    slides.push({
      path,
      absolutePath,
      id,
      slideIndex: numberField(parsed.frontmatter, "slideIndex"),
      title: stringField(parsed.frontmatter, "title") || id,
      chapter: stringField(parsed.frontmatter, "chapter"),
      layout: stringField(parsed.frontmatter, "layout"),
      components: arrayField(parsed.frontmatter, "components"),
      structural: booleanField(parsed.frontmatter, "structural", false),
      narrativeRole: stringField(parsed.frontmatter, "narrativeRole"),
      markdown,
      frontmatter: parsed.frontmatter,
      sections: parseMarkdownSections(markdown),
      links,
    })
  }
  return slides.sort((a, b) => (a.slideIndex ?? Number.MAX_SAFE_INTEGER) - (b.slideIndex ?? Number.MAX_SAFE_INTEGER) || a.path.localeCompare(b.path))
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

function relationForDeckPlanLink(group: string, id: string): DeckPlanNarrativeLink["relation"] {
  const normalized = group.toLowerCase()
  if (normalized.includes("evidence") || id.startsWith("evidence")) return "uses_evidence"
  if (normalized.includes("risk") || id.startsWith("risk")) return "addresses_risk"
  if (normalized.includes("objection") || id.startsWith("objection")) return "answers_objection"
  if (normalized.includes("gap") || id.startsWith("gap") || id.startsWith("research-gap")) return "mentions_gap"
  return "uses_claim"
}

function inferredLinkGroup(id: string, knownNodeIds?: Set<string>): string {
  if (id.startsWith("evidence")) return "evidence"
  if (id.startsWith("risk")) return "risk"
  if (id.startsWith("objection")) return "objection"
  if (id.startsWith("gap") || id.startsWith("research-gap")) return "gaps"
  if (knownNodeIds?.has(id)) return "claims"
  return "unknown"
}

function deckPlanIndexDiagnostics(slides: DeckPlanSlideProjection[]): DeckPlanProjectionDiagnostic[] {
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  if (slides.length === 0) diagnostics.push({ severity: "warning", code: "deck_plan_slides_missing", message: "deck-plan/slides contains no slide plan Markdown files." })
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

function slideDiagnostics(slide: DeckPlanSlideProjection, knownNodeIds?: Set<string>): DeckPlanProjectionDiagnostic[] {
  const diagnostics: DeckPlanProjectionDiagnostic[] = []
  if (!slide.structural && !slide.links.some((link) => link.relation === "uses_claim")) diagnostics.push({ severity: "warning", code: "slide_claim_link_missing", message: `Non-structural deck-plan slide ${slide.id} has no claim wikilink in ## Narrative Links.`, file: slide.path, nodeId: slide.id })
  if (knownNodeIds) {
    for (const link of slide.links) {
      if (!knownNodeIds.has(link.id)) diagnostics.push({ severity: "warning", code: "deck_plan_broken_link", message: `Deck-plan slide ${slide.id} links to unknown narrative node ${link.id}.`, file: slide.path, nodeId: slide.id })
    }
  }
  return diagnostics
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
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean)
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean)
  return []
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
  lines.push("- Preserve claim-led chapters, visual intent, evidence ids, source trace, supported scope, unsupported scope, caveats, and strength.")
  lines.push("- Generate HTML chapter by chapter; do not draft a full 5+ slide deck in one broad write or patch.")
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
  lines.push("Use these batches for HTML generation. Keep the HTML valid after every batch and preserve previously written slides.")
  lines.push("")
  if (input.renderPlan) {
    for (const batch of input.renderPlan.chapterWritingBatches) lines.push(`- ${batch.label}: ${batch.chapterTitle}, slides ${formatSlideRange(batch.slideIndexes)}. ${batch.instructions}`)
  } else {
    input.chapters.forEach((chapter, index) => {
      const prefix = index === 0 ? "Initial shell and first chapter" : `Chapter batch ${index + 1}`
      lines.push(`- ${prefix}: ${chapter.title}, slides ${formatSlideRange(chapter.slideIndexes)}.`)
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
