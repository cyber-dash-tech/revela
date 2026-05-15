import type { VaultDiagnostic, VaultDiagnosticSeverity } from "./types"

export interface VaultDiagnosticDisplay {
  code: string
  severity: VaultDiagnosticSeverity
  file?: string
  nodeId?: string
  message: string
  suggestedFix: string
  suggestedAction?: string
}

export interface VaultDiagnosticReport {
  ok: boolean
  errorCount: number
  warningCount: number
  blockers: VaultDiagnosticDisplay[]
  warnings: VaultDiagnosticDisplay[]
  nextActions: string[]
  summary: string
}

export function formatVaultDiagnosticReport(diagnostics: VaultDiagnostic[]): VaultDiagnosticReport {
  const displays = diagnostics.map(formatDiagnostic)
  const blockers = displays.filter((diagnostic) => diagnostic.severity === "error")
  const warnings = displays.filter((diagnostic) => diagnostic.severity === "warning")
  const nextActions = unique(displays.map((diagnostic) => diagnostic.suggestedAction).filter(Boolean) as string[])
  const summary = blockers.length === 0 && warnings.length === 0
    ? "Narrative vault diagnostics: clean."
    : `Narrative vault diagnostics: ${blockers.length} blocker(s), ${warnings.length} warning(s).`
  return {
    ok: blockers.length === 0,
    errorCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    nextActions,
    summary,
  }
}

export function formatVaultDiagnosticMarkdown(report: VaultDiagnosticReport): string {
  if (report.errorCount === 0 && report.warningCount === 0) return ""
  const lines = ["**Narrative vault diagnostics**", "", report.summary]
  if (report.blockers.length > 0) {
    lines.push("", "Blockers:")
    for (const diagnostic of report.blockers) lines.push(`- ${formatDisplayLine(diagnostic)}`)
  }
  if (report.warnings.length > 0) {
    lines.push("", "Warnings:")
    for (const diagnostic of report.warnings) lines.push(`- ${formatDisplayLine(diagnostic)}`)
  }
  if (report.nextActions.length > 0) {
    lines.push("", "Next actions:")
    for (const action of report.nextActions) lines.push(`- ${action}`)
  }
  return lines.join("\n")
}

function formatDiagnostic(diagnostic: VaultDiagnostic): VaultDiagnosticDisplay {
  const suggestion = suggestionForCode(diagnostic.code)
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    file: diagnostic.file,
    nodeId: diagnostic.nodeId,
    message: diagnostic.message,
    suggestedFix: suggestion.fix,
    suggestedAction: suggestion.action,
  }
}

function suggestionForCode(code: string): { fix: string; action?: string } {
  switch (code) {
    case "empty_vault":
      return { fix: "Export the existing JSON narrative with exportNarrativeVault, or add the required Markdown narrative nodes.", action: "Run exportNarrativeVault if DECKS.json has a narrative; otherwise add core vault Markdown nodes." }
    case "duplicate_id":
      return { fix: "Rename one Markdown node id so each canonical narrative id is unique.", action: "Edit the duplicate Markdown node id and rerun compileNarrativeVault." }
    case "missing_type":
      return { fix: "Add the required frontmatter field type with a valid narrative vault node type.", action: "Edit the reported Markdown file and rerun compileNarrativeVault." }
    case "missing_id":
      return { fix: "Add the required frontmatter field id and keep it stable after creation.", action: "Edit the reported Markdown file and rerun compileNarrativeVault." }
    case "unknown_node_type":
      return { fix: "Use one of the supported node types: index, audience, decision, thesis, claim, evidence, objection, risk, or research-gap.", action: "Correct the type frontmatter and rerun compileNarrativeVault." }
    case "broken_link":
      return { fix: "Create the linked target node or correct the wikilink id in the Relations section.", action: "Repair the wikilink and rerun compileNarrativeVault." }
    case "illegal_relation_target":
      return { fix: "Change the relation type or target node so the typed relation connects allowed node types.", action: "Repair the relation and rerun compileNarrativeVault." }
    case "compile_failed":
      return { fix: "Fix structural vault diagnostics first; the narrative could not be normalized.", action: "Resolve blocker diagnostics and rerun compileNarrativeVault." }
    case "evidence_claim_missing":
      return { fix: "Correct the evidence claimId or create the target claim before treating the evidence as support.", action: "Use upsertVaultClaim for the missing claim or update the evidence claimId, then rerun compileNarrativeVault." }
    case "stale_approval_hash":
      return { fix: "The latest approval no longer matches the current narrative hash.", action: "Run /revela story and ask for approval or an explicit render override after review." }
    case "evidence_trace_incomplete":
      return { fix: "Add explicit source, quote/snippet, support scope, unsupported scope, caveat, and strength to the evidence node.", action: "Use upsertVaultEvidence with complete source trace fields." }
    case "orphan_central_claim":
      return { fix: "Add or repair claim relations, or confirm the central claim should stand alone.", action: "Review the claim in /revela story; edit Relations only when the relation is explicit." }
    case "claim_missing_evidence":
      return { fix: "Bind explicit evidence or keep the missing support visible as a research gap.", action: "Run /revela research or use upsertVaultEvidence when source trace is explicit." }
    case "research_gap_unresolved":
      return { fix: "Resolve, close, or keep researching the gap; do not treat it as evidence until bound.", action: "Run /revela research or updateVaultResearchGap with the current lifecycle status." }
    case "gap_evidence_missing":
      return { fix: "Correct evidenceBindingIds or create the referenced evidence node.", action: "Use upsertVaultEvidence for the missing evidence or updateVaultResearchGap to remove the bad reference." }
    default:
      return { fix: "Inspect the reported Markdown file or node and rerun compileNarrativeVault after the smallest safe fix.", action: "Rerun compileNarrativeVault after fixing the reported vault node." }
  }
}

function formatDisplayLine(diagnostic: VaultDiagnosticDisplay): string {
  const location = [diagnostic.file, diagnostic.nodeId].filter(Boolean).join(" / ")
  return `\`${diagnostic.code}\`${location ? ` (${location})` : ""}: ${diagnostic.message} Fix: ${diagnostic.suggestedFix}`
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
