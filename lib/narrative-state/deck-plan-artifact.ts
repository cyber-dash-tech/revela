import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { createHash } from "crypto"
import type { DeckSpec, SlideSpec } from "../decks-state"
import type { DeckPlanChapter, DeckPlanQualityCheck, RenderPlanContract, RenderPlanSlideMetadata } from "./render-plan"

export const DECK_PLAN_ARTIFACT_PATH = "decks/deck-plan.md"

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
  "Approval",
]

export function writeDeckPlanArtifact(workspaceRoot: string, input: DeckPlanArtifactInput): { path: string; absolutePath: string } {
  const absolutePath = join(workspaceRoot, DECK_PLAN_ARTIFACT_PATH)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, renderDeckPlanMarkdown(input), "utf-8")
  return { path: DECK_PLAN_ARTIFACT_PATH, absolutePath }
}

export function readDeckPlanArtifact(workspaceRoot: string, expected?: { narrativeHash?: string }): DeckPlanReadResult {
  const absolutePath = join(workspaceRoot, DECK_PLAN_ARTIFACT_PATH)
  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      path: DECK_PLAN_ARTIFACT_PATH,
      absolutePath,
      approvalStatus: "missing",
      sections: [],
      missingSections: REQUIRED_DECK_PLAN_SECTIONS,
      warnings: [],
      reason: `Deck plan file is missing: ${DECK_PLAN_ARTIFACT_PATH}. Write the LLM-authored deck plan before confirmation or HTML generation.`,
    }
  }
  const markdown = readFileSync(absolutePath, "utf-8")
  const planHash = deckPlanBodyHash(markdown)
  const approval = parseDeckPlanApproval(markdown)
  const sections = parseMarkdownSections(markdown)
  const missingSections = REQUIRED_DECK_PLAN_SECTIONS.filter((section) => !sections.includes(section))
  const warnings: string[] = []
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
      warnings.push("Approval planHash does not match the current deck-plan.md body.")
    }
  } else {
    warnings.push("Approval block is missing or malformed.")
  }
  return {
    ok: true,
    path: DECK_PLAN_ARTIFACT_PATH,
    absolutePath,
    markdown,
    planHash,
    approval,
    approvalStatus,
    sections,
    missingSections,
    warnings,
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
  if (approval.status !== "approved") return { ok: false, approval, reason: "Deck plan is not approved. Set Approval status to approved in decks/deck-plan.md." }
  if (!approval.approvedBy) return { ok: false, approval, reason: "Deck plan approval requires approvedBy." }
  if (!approval.approvedAt) return { ok: false, approval, reason: "Deck plan approval requires approvedAt." }
  if (Number.isNaN(Date.parse(approval.approvedAt))) return { ok: false, approval, reason: "Deck plan approval approvedAt must be a parseable date/time." }
  if (missingSections.length > 0) return { ok: false, approval, planHash, sections, missingSections, reason: `Deck plan is missing required sections: ${missingSections.join(", ")}.` }
  if (approval.narrativeHash !== expected.narrativeHash) return { ok: false, approval, reason: "Deck plan approval is stale because narrativeHash does not match current narrative state." }
  if (expected.planHash && approval.planHash !== expected.planHash) return { ok: false, approval, planHash, reason: "Deck plan approval is stale because planHash does not match the expected deck plan." }
  if (approval.planHash && !isPlaceholderPlanHash(approval.planHash) && approval.planHash !== planHash) return { ok: false, approval, planHash, reason: "Deck plan approval is stale because planHash does not match the current deck-plan.md body." }
  return { ok: true, approval, planHash, sections, missingSections }
}

export function deckPlanBodyHash(markdown: string): string {
  return createHash("sha1").update(stripApprovalSection(markdown).trim()).digest("hex")
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
