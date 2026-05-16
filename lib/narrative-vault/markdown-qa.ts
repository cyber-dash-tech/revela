import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"
import { readNarrativeVaultDocuments } from "./read"
import { inspectVaultMarkdown } from "./authoring-guard"
import { buildNarrativeVaultInventory, type NarrativeVaultInventoryUnresolvedRef } from "./inventory"
import { narrativeVaultPath } from "./paths"
import type { VaultDiagnosticDisplay } from "./diagnostic-report"
import type { VaultDocument } from "./types"

export interface MarkdownQaRepairCard {
  severity: "error" | "warning"
  file: string
  nodeId?: string
  issueCode: string
  message: string
  smallestRepair: string
  examples?: string[]
}

export interface MarkdownQaReport {
  ok: boolean
  repairCards: MarkdownQaRepairCard[]
  blockers: MarkdownQaRepairCard[]
  warnings: MarkdownQaRepairCard[]
}

export interface MarkdownQaOptions {
  touched?: string[]
  scope?: "touched" | "affected" | "full"
  strictness?: "authoring" | "readiness" | "render"
}

export function runNarrativeMarkdownQa(workspaceRoot: string, touchedOrOptions?: string[] | MarkdownQaOptions): MarkdownQaReport {
  const options = Array.isArray(touchedOrOptions) ? { touched: touchedOrOptions, scope: "touched" as const, strictness: "authoring" as const } : touchedOrOptions ?? {}
  const { documents } = readNarrativeVaultDocuments(workspaceRoot)
  const scope = options.scope ?? (options.touched ? "touched" : "full")
  const strictness = options.strictness ?? "authoring"
  const touchedSet = options.touched ? new Set(options.touched.map(normalizeVaultFile).filter(Boolean)) : undefined
  const selected = touchedSet ? documents.filter((doc) => touchedSet.has(doc.relativePath)) : documents
  const inventory = buildNarrativeVaultInventory(workspaceRoot)
  const repairCards: MarkdownQaRepairCard[] = []

  for (const doc of selected) {
    repairCards.push(...inspectVaultMarkdown(doc.relativePath, readFileSync(doc.path, "utf-8"))
      .filter((diagnostic) => !isEvidenceClaimIdCoveredByInlineRelation(doc, diagnostic.code, inventory))
      .map(cardFromDiagnostic))
    repairCards.push(...evidenceTraceCards(doc))
  }

  repairCards.push(...unsupportedRootMarkdownCards(workspaceRoot, touchedSet))

  for (const unresolved of inventory.unresolvedRefs) {
    if (touchedSet && !touchedSet.has(unresolved.file)) continue
    repairCards.push(cardFromUnresolved(unresolved))
  }
  for (const diagnostic of inventory.diagnostics) {
    if (touchedSet && diagnostic.file && !touchedSet.has(diagnostic.file)) continue
    repairCards.push(cardFromDiagnostic({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      file: diagnostic.file,
      nodeId: diagnostic.nodeId,
      suggestedFix: diagnostic.code === "unknown_relation_type" ? "Use one of: leads_to, supports, depends_on, contrasts_with, constrains, answers." : "Repair the Markdown node.",
      suggestedAction: "Repair the Markdown relation line and rerun markdownQa.",
    }))
  }
  if (scope !== "touched") repairCards.push(...relationCoverageCards(inventory, strictness))

  const deduped = dedupeCards(repairCards)
  const blockers = deduped.filter((card) => card.severity === "error")
  const warnings = deduped.filter((card) => card.severity === "warning")
  return { ok: blockers.length === 0, repairCards: deduped, blockers, warnings }
}

function isEvidenceClaimIdCoveredByInlineRelation(doc: VaultDocument, issueCode: string, inventory: ReturnType<typeof buildNarrativeVaultInventory>): boolean {
  if (issueCode !== "evidence_claim_id_missing_authoring") return false
  const id = stringField(doc, "id")
  if (!id) return false
  return inventory.evidence.some((item) => item.id === id && Boolean(item.claimId))
}

function relationCoverageCards(inventory: ReturnType<typeof buildNarrativeVaultInventory>, strictness: NonNullable<MarkdownQaOptions["strictness"]>): MarkdownQaRepairCard[] {
  const cards: MarkdownQaRepairCard[] = []
  const severity = strictness === "authoring" ? "warning" : "error"
  for (const id of inventory.relationCoverage.unboundEvidence) cards.push(relationCoverageCard(severity, id, "unbound_evidence", "Evidence node has no claim-support relation.", "Add `## Relations` with `- supports: [[claim-id]]`, or bind the evidence through bindResearchFindings."))
  for (const id of inventory.relationCoverage.unboundObjections) cards.push(relationCoverageCard(severity, id, "unbound_objection", "Objection node has no claim relation.", "Add `## Relations` with `- answers: [[claim-id]]` or `- contrasts_with: [[claim-id]]`, or set an explicit claim target if preserving existing shape."))
  for (const id of inventory.relationCoverage.unboundRisks) cards.push(relationCoverageCard(severity, id, "unbound_risk", "Risk node has no claim relation.", "Add `## Relations` with `- constrains: [[claim-id]]`, or set an explicit claim target if preserving existing shape."))
  for (const id of inventory.relationCoverage.unboundResearchGaps) cards.push(relationCoverageCard("warning", id, "unbound_research_gap", "Research gap has no target relation or target id.", "Add `## Relations` with `- depends_on: [[target-node-id]]` or a targetId after checking narrativeInventory."))
  for (const id of inventory.relationCoverage.isolatedClaims) cards.push(relationCoverageCard(strictness === "render" ? "error" : "warning", id, "isolated_central_claim", "Central claim is not connected to the claim-flow graph.", "Add a claim-flow edge in the source node `## Relations`, or downgrade importance if it is background context."))
  return cards
}

function relationCoverageCard(severity: "error" | "warning", nodeId: string, issueCode: string, message: string, smallestRepair: string): MarkdownQaRepairCard {
  return { severity, file: "revela-narrative", nodeId, issueCode, message, smallestRepair }
}

function cardFromDiagnostic(diagnostic: VaultDiagnosticDisplay): MarkdownQaRepairCard {
  return {
    severity: diagnostic.severity,
    file: diagnostic.file ?? "revela-narrative",
    nodeId: diagnostic.nodeId,
    issueCode: diagnostic.code,
    message: diagnostic.message,
    smallestRepair: diagnostic.suggestedFix || diagnostic.suggestedAction || "Repair the Markdown node and rerun markdownQa.",
    examples: examplesFor(diagnostic.code),
  }
}

function cardFromUnresolved(ref: NarrativeVaultInventoryUnresolvedRef): MarkdownQaRepairCard {
  const target = ref.targetId || "<missing>"
  if (ref.kind === "relation") {
    return {
      severity: "error",
      file: ref.file,
      nodeId: ref.fromId,
      issueCode: "broken_relation_target",
      message: `Relation points to unknown node ${target}.`,
      smallestRepair: "Create the referenced node or patch the relation wikilink to an existing id from narrativeInventory.",
      examples: ["- supports: [[claim-existing-id]]"],
    }
  }
  if (ref.kind === "evidenceClaimId") {
    return {
      severity: "error",
      file: ref.file,
      nodeId: ref.fromId,
      issueCode: ref.targetId ? "unresolved_evidence_claim_id" : "missing_evidence_claim_id",
      message: ref.targetId ? `Evidence references unknown claimId ${target}.` : "Evidence is missing claimId.",
      smallestRepair: "Set claimId to an existing claim id from narrativeInventory, or create the missing claim node first.",
      examples: ["claimId: claim-market-context"],
    }
  }
  return {
    severity: "warning",
    file: ref.file,
    nodeId: ref.fromId,
    issueCode: `unresolved_${ref.kind}`,
    message: `${ref.field ?? "target"} references unknown node ${target}.`,
    smallestRepair: "Check narrativeInventory and patch the target id, or create the missing target node if intentional.",
  }
}

function evidenceTraceCards(doc: VaultDocument): MarkdownQaRepairCard[] {
  if (stringField(doc, "type") !== "evidence") return []
  const cards: MarkdownQaRepairCard[] = []
  const missing: string[] = []
  if (!hasSource(doc)) missing.push("source|sourcePath|url|findingsFile")
  if (!stringField(doc, "quote") && !firstBodyLine(doc.body)) missing.push("quote|snippet body")
  for (const field of ["supportScope", "unsupportedScope", "caveat", "strength"]) {
    if (!stringField(doc, field)) missing.push(field)
  }
  if (missing.length > 0) {
    cards.push({
      severity: "warning",
      file: doc.relativePath,
      nodeId: stringField(doc, "id"),
      issueCode: "evidence_trace_fields_missing",
      message: `Evidence node is missing trace field(s): ${missing.join(", ")}.`,
      smallestRepair: "Add explicit source trace, quote/snippet, support scope, unsupported scope, caveat, and strength before treating the evidence as strong support.",
      examples: ["sourcePath: proposal.md", "supportScope: Scope explicitly supported by the quote.", "unsupportedScope: What this evidence does not prove."],
    })
  }
  return cards
}

function unsupportedRootMarkdownCards(workspaceRoot: string, touchedSet?: Set<string>): MarkdownQaRepairCard[] {
  const root = narrativeVaultPath(workspaceRoot)
  if (!existsSync(root) || !statSync(root).isDirectory()) return []
  const supportedRootFiles = new Set(["index.md", "audience.md", "decision.md", "thesis.md"])
  const cards: MarkdownQaRepairCard[] = []

  for (const entry of readdirSync(root).sort()) {
    if (!entry.endsWith(".md") || supportedRootFiles.has(entry)) continue
    const filePath = join(root, entry)
    if (!statSync(filePath).isFile()) continue
    const relativePath = entry.replace(/\\/g, "/")
    if (touchedSet && !touchedSet.has(relativePath) && !touchedSet.has(`revela-narrative/${relativePath}`)) continue
    cards.push({
      severity: "warning",
      file: relativePath,
      issueCode: "unsupported_vault_root_markdown",
      message: "Markdown file is in the vault root but only index.md, audience.md, decision.md, and thesis.md are supported there.",
      smallestRepair: "Move claim/evidence/objection/risk/research-gap nodes into their supported subdirectory, or remove this unsupported root file if it was temporary.",
      examples: ["claims/claim-market-context.md", "evidence/evidence-proposal-intent.md", "research-gaps/gap-market-size.md"],
    })
  }

  return cards
}

function normalizeVaultFile(file: string): string {
  return file.replace(/\\/g, "/").replace(/^revela-narrative\//, "")
}

function stringField(doc: VaultDocument, key: string): string {
  const value = doc.frontmatter[key]
  return typeof value === "string" ? value.trim() : ""
}

function hasSource(doc: VaultDocument): boolean {
  return Boolean(stringField(doc, "source") || stringField(doc, "sourcePath") || stringField(doc, "url") || stringField(doc, "findingsFile"))
}

function firstBodyLine(body: string): string {
  return body.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? ""
}

function examplesFor(code: string): string[] | undefined {
  if (code === "typed_wikilink_target") return ["- supports: [[claim-existing-id]]"]
  if (code === "invalid_node_type_authoring") return ["type: research-gap"]
  if (code === "duplicate_stable_heading") return ["Merge duplicate section bodies under one ## Caveats or ## Relations heading."]
  if (code === "duplicate_frontmatter") return ["Keep exactly one leading --- frontmatter block."]
  return undefined
}

function dedupeCards(cards: MarkdownQaRepairCard[]): MarkdownQaRepairCard[] {
  const seen = new Set<string>()
  const result: MarkdownQaRepairCard[] = []
  for (const card of cards) {
    const key = [card.severity, card.file, card.nodeId ?? "", card.issueCode, card.message].join("\0")
    if (seen.has(key)) continue
    seen.add(key)
    result.push(card)
  }
  return result
}
