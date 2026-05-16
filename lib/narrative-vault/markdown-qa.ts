import { readFileSync } from "fs"
import { readNarrativeVaultDocuments } from "./read"
import { inspectVaultMarkdown } from "./authoring-guard"
import { buildNarrativeVaultInventory, type NarrativeVaultInventoryUnresolvedRef } from "./inventory"
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

export function runNarrativeMarkdownQa(workspaceRoot: string, touched?: string[]): MarkdownQaReport {
  const { documents } = readNarrativeVaultDocuments(workspaceRoot)
  const touchedSet = touched ? new Set(touched.map(normalizeVaultFile).filter(Boolean)) : undefined
  const selected = touchedSet ? documents.filter((doc) => touchedSet.has(doc.relativePath)) : documents
  const repairCards: MarkdownQaRepairCard[] = []

  for (const doc of selected) {
    repairCards.push(...inspectVaultMarkdown(doc.relativePath, readFileSync(doc.path, "utf-8")).map(cardFromDiagnostic))
    repairCards.push(...evidenceTraceCards(doc))
  }

  const inventory = buildNarrativeVaultInventory(workspaceRoot)
  for (const unresolved of inventory.unresolvedRefs) {
    if (touchedSet && !touchedSet.has(unresolved.file)) continue
    repairCards.push(cardFromUnresolved(unresolved))
  }

  const deduped = dedupeCards(repairCards)
  const blockers = deduped.filter((card) => card.severity === "error")
  const warnings = deduped.filter((card) => card.severity === "warning")
  return { ok: blockers.length === 0, repairCards: deduped, blockers, warnings }
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
