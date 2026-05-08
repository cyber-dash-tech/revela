import type { DecksState } from "../decks-state"
import { recordWorkspaceAction } from "../workspace-state/actions"
import {
  artifactNodeIdForRenderTarget,
  normalizeWorkspacePath,
  renderTargetId,
  upsertRenderTarget,
} from "../workspace-state/render-targets"
import type { RenderTarget } from "../workspace-state/types"
import { computeNarrativeHash } from "./hash"
import { normalizeNarrativeState } from "./normalize"
import { reviewNarrativeState } from "./readiness"
import type { NarrativeApproval, NarrativeClaim, NarrativeEvidenceBinding, NarrativeStateV1 } from "./types"

export const DEFAULT_EXECUTIVE_BRIEF_PATH = "briefs/executive-brief.md"

export interface CompileExecutiveBriefOptions {
  outputPath?: string
  now?: string
}

export type CompileExecutiveBriefResult =
  | {
    ok: true
    state: DecksState
    outputPath: string
    content: string
    target: RenderTarget
    narrativeHash: string
  }
  | {
    ok: false
    state: DecksState
    reason: string
    narrativeHash?: string
  }

export function compileExecutiveBrief(state: DecksState, options: CompileExecutiveBriefOptions = {}): CompileExecutiveBriefResult {
  const now = options.now ?? new Date().toISOString()
  const reviewed = reviewNarrativeState(state, { now })
  const narrative = reviewed.state.narrative ?? normalizeNarrativeState(reviewed.state)
  const narrativeHash = reviewed.result.narrativeHash || computeNarrativeHash(narrative)
  const allowedApproval = currentNarrativeApprovalOrOverride(narrative, narrativeHash)

  if (!allowedApproval) {
    return {
      ok: false,
      state: reviewed.state,
      reason: "Executive brief rendering requires current narrative approval or an explicit render override.",
      narrativeHash,
    }
  }

  const outputPath = normalizeWorkspacePath(options.outputPath || DEFAULT_EXECUTIVE_BRIEF_PATH)
  const content = renderExecutiveBriefMarkdown(narrative, narrativeHash, now, allowedApproval)
  const claimIds = narrative.claims.map((claim) => claim.id).sort()
  const evidenceBindingIds = narrative.evidenceBindings.map((binding) => binding.id).sort()
  const target: RenderTarget = {
    id: renderTargetId("executive_brief", outputPath),
    type: "executive_brief",
    outputPath,
    sourceNodeIds: [narrative.id, ...claimIds, ...evidenceBindingIds],
    artifactVersion: narrativeHash,
    contractStatus: "valid",
    data: {
      narrativeHash,
      generatedAt: now,
      format: "markdown",
      claimIds,
      evidenceBindingIds,
      approvalId: allowedApproval.id,
      approvalScope: allowedApproval.scope,
    },
  }

  const next: DecksState = { ...reviewed.state, narrative }
  upsertRenderTarget(next, target)
  recordWorkspaceAction(next, {
    type: "artifact.rendered",
    actor: "revela-brief",
    inputs: {
      type: "executive_brief",
      narrativeId: narrative.id,
      narrativeHash,
      approvalId: allowedApproval.id,
    },
    outputs: {
      outputPath,
      targetId: target.id,
      claimCount: claimIds.length,
      evidenceBindingCount: evidenceBindingIds.length,
    },
    status: "success",
    summary: "Rendered executive brief from approved narrative state.",
    nodeIds: [target.id, artifactNodeIdForRenderTarget(target), narrative.id, ...claimIds],
    timestamp: now,
  })

  return { ok: true, state: next, outputPath, content, target, narrativeHash }
}

function currentNarrativeApprovalOrOverride(narrative: NarrativeStateV1, narrativeHash: string): NarrativeApproval | undefined {
  const approvals = [...(narrative.approvals ?? [])]
  for (let index = approvals.length - 1; index >= 0; index -= 1) {
    const approval = approvals[index]
    if (approval.narrativeHash !== narrativeHash) continue
    if (approval.scope === "narrative" && approval.approvedBy === "user") return approval
    if (approval.scope === "render_override" || approval.approvedBy === "override") return approval
  }
  return undefined
}

function renderExecutiveBriefMarkdown(narrative: NarrativeStateV1, narrativeHash: string, generatedAt: string, approval: NarrativeApproval): string {
  const evidenceByClaim = groupEvidenceByClaim(narrative.evidenceBindings)
  const centralClaims = narrative.claims.filter((claim) => claim.importance === "central")
  const supportingClaims = narrative.claims.filter((claim) => claim.importance !== "central")
  const lines: string[] = []

  lines.push("# Executive Brief")
  lines.push("")
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Narrative ID: ${narrative.id}`)
  lines.push(`Narrative hash: ${narrativeHash}`)
  lines.push(`Approval: ${approval.id} (${approval.scope}, ${approval.approvedBy})`)
  lines.push("")
  lines.push("## Decision Context")
  lines.push(`- Audience: ${fallback(narrative.audience.primary)}`)
  lines.push(`- Belief before: ${fallback(narrative.audience.beliefBefore)}`)
  lines.push(`- Belief after: ${fallback(narrative.audience.beliefAfter)}`)
  lines.push(`- Decision/action: ${fallback(narrative.decision.action)}`)
  if (narrative.decision.owner) lines.push(`- Owner: ${narrative.decision.owner}`)
  if (narrative.decision.deadline) lines.push(`- Deadline: ${narrative.decision.deadline}`)
  if (narrative.decision.consequenceOfNoDecision) lines.push(`- Consequence of no decision: ${narrative.decision.consequenceOfNoDecision}`)
  lines.push("")
  lines.push("## Thesis")
  lines.push(narrative.thesis?.statement ? `${narrative.thesis.statement} (${narrative.thesis.confidence} confidence)` : "Not recorded.")
  if (narrative.thesis?.caveat) lines.push(`Caveat: ${narrative.thesis.caveat}`)
  lines.push("")

  appendClaims(lines, "Central Claims", centralClaims, evidenceByClaim)
  appendClaims(lines, "Supporting Claims", supportingClaims, evidenceByClaim)
  appendObjections(lines, narrative)
  appendRisks(lines, narrative)
  appendResearchGaps(lines, narrative)
  lines.push("## Provenance")
  lines.push(`- Render target: executive_brief`)
  lines.push(`- Source narrative: ${narrative.id}`)
  lines.push(`- Narrative hash: ${narrativeHash}`)
  lines.push(`- Approval id: ${approval.id}`)
  lines.push("- This brief is compiled from canonical narrative state, not from a deck summary.")
  lines.push("")

  return lines.join("\n")
}

function appendClaims(lines: string[], title: string, claims: NarrativeClaim[], evidenceByClaim: Map<string, NarrativeEvidenceBinding[]>): void {
  lines.push(`## ${title}`)
  if (claims.length === 0) {
    lines.push("Not recorded.")
    lines.push("")
    return
  }

  for (const claim of claims) {
    lines.push(`### ${claim.text}`)
    lines.push(`- Claim ID: ${claim.id}`)
    lines.push(`- Kind: ${claim.kind}`)
    lines.push(`- Evidence status: ${claim.evidenceStatus}`)
    if (claim.supportedScope) lines.push(`- Supported scope: ${claim.supportedScope}`)
    if (claim.unsupportedScope) lines.push(`- Unsupported scope: ${claim.unsupportedScope}`)
    for (const caveat of claim.caveats ?? []) lines.push(`- Caveat: ${caveat}`)
    const bindings = evidenceByClaim.get(claim.id) ?? []
    if (bindings.length === 0) lines.push("- Evidence: none bound")
    else {
      lines.push("- Evidence:")
      for (const binding of bindings) appendEvidence(lines, binding)
    }
    lines.push("")
  }
}

function appendEvidence(lines: string[], binding: NarrativeEvidenceBinding): void {
  lines.push(`  - ${binding.id} (${binding.strength})`)
  lines.push(`    - Source: ${binding.source}`)
  if (binding.findingsFile) lines.push(`    - Findings file: ${binding.findingsFile}`)
  if (binding.sourcePath) lines.push(`    - Source path: ${binding.sourcePath}`)
  if (binding.location) lines.push(`    - Location: ${binding.location}`)
  if (binding.url) lines.push(`    - URL: ${binding.url}`)
  if (binding.quote) lines.push(`    - Quote: ${binding.quote}`)
  if (binding.supportScope) lines.push(`    - Support scope: ${binding.supportScope}`)
  if (binding.unsupportedScope) lines.push(`    - Unsupported scope: ${binding.unsupportedScope}`)
  if (binding.caveat) lines.push(`    - Caveat: ${binding.caveat}`)
}

function appendObjections(lines: string[], narrative: NarrativeStateV1): void {
  lines.push("## Objections")
  if (narrative.objections.length === 0) lines.push("Not recorded.")
  for (const objection of narrative.objections) {
    lines.push(`- ${objection.text}`)
    lines.push(`  - Objection ID: ${objection.id}`)
    if (objection.claimId) lines.push(`  - Challenges claim: ${objection.claimId}`)
    lines.push(`  - Priority: ${objection.priority}`)
    if (objection.response) lines.push(`  - Response: ${objection.response}`)
  }
  lines.push("")
}

function appendRisks(lines: string[], narrative: NarrativeStateV1): void {
  lines.push("## Risks")
  if (narrative.risks.length === 0) lines.push("Not recorded.")
  for (const risk of narrative.risks) {
    lines.push(`- ${risk.text}`)
    lines.push(`  - Risk ID: ${risk.id}`)
    if (risk.claimId) lines.push(`  - Constrains claim: ${risk.claimId}`)
    lines.push(`  - Severity: ${risk.severity}`)
    if (risk.mitigation) lines.push(`  - Mitigation: ${risk.mitigation}`)
  }
  lines.push("")
}

function appendResearchGaps(lines: string[], narrative: NarrativeStateV1): void {
  lines.push("## Research Gaps")
  const gaps = narrative.researchGaps ?? []
  if (gaps.length === 0) lines.push("Not recorded.")
  for (const gap of gaps) {
    lines.push(`- ${gap.question}`)
    lines.push(`  - Gap ID: ${gap.id}`)
    lines.push(`  - Status: ${gap.status}`)
    lines.push(`  - Priority: ${gap.priority}`)
    if (gap.targetId) lines.push(`  - Target: ${gap.targetType}:${gap.targetId}`)
    if (gap.findingsFile) lines.push(`  - Findings file: ${gap.findingsFile}`)
    if (gap.evidenceBindingIds?.length) lines.push(`  - Evidence bindings: ${gap.evidenceBindingIds.join(", ")}`)
    if (gap.notes) lines.push(`  - Notes: ${gap.notes}`)
  }
  lines.push("")
}

function groupEvidenceByClaim(bindings: NarrativeEvidenceBinding[]): Map<string, NarrativeEvidenceBinding[]> {
  const grouped = new Map<string, NarrativeEvidenceBinding[]>()
  for (const binding of bindings) grouped.set(binding.claimId, [...(grouped.get(binding.claimId) ?? []), binding])
  return grouped
}

function fallback(value: string | undefined): string {
  return value?.trim() || "Not recorded"
}
