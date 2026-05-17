import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import type { DeckSpec, SlideSpec } from "../decks-state"
import type { DeckPlanChapter, DeckPlanQualityCheck } from "./render-plan"

export const DECK_PLAN_ARTIFACT_PATH = "decks/deck-plan.md"

export interface DeckPlanArtifactInput {
  deck: DeckSpec
  narrativeHash: string
  planHash: string
  chapters: DeckPlanChapter[]
  qualityChecks: DeckPlanQualityCheck[]
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
}

export function writeDeckPlanArtifact(workspaceRoot: string, input: DeckPlanArtifactInput): { path: string; absolutePath: string } {
  const absolutePath = join(workspaceRoot, DECK_PLAN_ARTIFACT_PATH)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, renderDeckPlanMarkdown(input), "utf-8")
  return { path: DECK_PLAN_ARTIFACT_PATH, absolutePath }
}

export function validateDeckPlanApprovalFile(workspaceRoot: string, expected: { narrativeHash: string; planHash: string }): DeckPlanApprovalValidation {
  const absolutePath = join(workspaceRoot, DECK_PLAN_ARTIFACT_PATH)
  if (!existsSync(absolutePath)) return { ok: false, reason: `Deck plan approval file is missing: ${DECK_PLAN_ARTIFACT_PATH}. Re-run compileDeckPlan first.` }
  return validateDeckPlanApproval(readFileSync(absolutePath, "utf-8"), expected)
}

export function validateDeckPlanApproval(markdown: string, expected: { narrativeHash: string; planHash: string }): DeckPlanApprovalValidation {
  const approval = parseDeckPlanApproval(markdown)
  if (!approval) return { ok: false, reason: "Deck plan approval block is missing or malformed." }
  if (approval.status !== "approved") return { ok: false, approval, reason: "Deck plan is not approved. Set Approval status to approved in decks/deck-plan.md." }
  if (!approval.approvedBy) return { ok: false, approval, reason: "Deck plan approval requires approvedBy." }
  if (!approval.approvedAt) return { ok: false, approval, reason: "Deck plan approval requires approvedAt." }
  if (Number.isNaN(Date.parse(approval.approvedAt))) return { ok: false, approval, reason: "Deck plan approval approvedAt must be a parseable date/time." }
  if (approval.narrativeHash !== expected.narrativeHash) return { ok: false, approval, reason: "Deck plan approval is stale because narrativeHash does not match current narrative state." }
  if (approval.planHash !== expected.planHash) return { ok: false, approval, reason: "Deck plan approval is stale because planHash does not match current slide plan." }
  return { ok: true, approval }
}

function renderDeckPlanMarkdown(input: DeckPlanArtifactInput): string {
  const lines: string[] = []
  lines.push("# Revela Deck Plan")
  lines.push("")
  lines.push("This file is an execution blueprint for HTML deck generation. It is not the source of truth; canonical meaning remains in `revela-narrative/` and compiled deck state remains in `DECKS.json`.")
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
  lines.push("## Deck Contract")
  lines.push("")
  lines.push("- Write one `<section class=\"slide\" data-slide-index=\"N\">` per planned slide, using 1-based slide indexes.")
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
  for (const slide of input.deck.slides) lines.push(renderSlidePlan(slide))
  lines.push("## Chapter Writing Batches")
  lines.push("")
  lines.push("Use these batches for HTML generation. Keep the HTML valid after every batch and preserve previously written slides.")
  lines.push("")
  input.chapters.forEach((chapter, index) => {
    const prefix = index === 0 ? "Initial shell and first chapter" : `Chapter batch ${index + 1}`
    lines.push(`- ${prefix}: ${chapter.title}, slides ${formatSlideRange(chapter.slideIndexes)}.`)
  })
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

function renderSlidePlan(slide: SlideSpec): string {
  const lines: string[] = []
  const contentData = slide.content?.data as { visualIntent?: { kind?: string; component?: string; rationale?: string } } | undefined
  const visualIntent = contentData?.visualIntent
  lines.push(`### Slide ${slide.index}: ${slide.title}`)
  lines.push("")
  lines.push(`- Purpose: ${slide.purpose}`)
  lines.push(`- Role: ${slide.narrativeRole}`)
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
