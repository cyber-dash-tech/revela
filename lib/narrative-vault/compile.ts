import { normalizeCanonicalNarrativeState } from "../narrative-state/normalize"
import { computeNarrativeHash, stableClaimRelationId } from "../narrative-state/hash"
import type {
  AudienceIntent,
  DecisionIntent,
  NarrativeApproval,
  NarrativeClaim,
  NarrativeClaimKind,
  NarrativeEvidenceBinding,
  NarrativeObjection,
  NarrativeResearchGap,
  NarrativeResearchGapTargetType,
  NarrativeRisk,
  NarrativeStateV1,
  NarrativeStatus,
  NarrativeThesis,
} from "../narrative-state/types"
import { firstParagraphOrBody, parseMarkdownList } from "./markdown"
import { readNarrativeVaultDocuments } from "./read"
import type { NarrativeVaultCompileResult, NarrativeVaultGraph, VaultDiagnostic, VaultDocument, VaultNodeType } from "./types"

export interface CompileNarrativeVaultOptions {
  fallbackApprovals?: NarrativeApproval[]
  now?: string
}

export function compileNarrativeVault(workspaceRoot: string, options: CompileNarrativeVaultOptions = {}): NarrativeVaultCompileResult {
  const read = readNarrativeVaultDocuments(workspaceRoot)
  const diagnostics: VaultDiagnostic[] = [...read.diagnostics]
  const docs = read.documents
  if (docs.length === 0) {
    return {
      ok: false,
      diagnostics: [{ severity: "error", code: "empty_vault", message: "revela-narrative/ exists but contains no Markdown narrative nodes." }],
      graph: { nodes: [], relations: [] },
    }
  }
  const nodeDocs = docs.filter((doc) => stringField(doc, "id"))
  const duplicateIds = duplicateValues(nodeDocs.map((doc) => stringField(doc, "id")))
  for (const id of duplicateIds) diagnostics.push({ severity: "error", code: "duplicate_id", message: `Duplicate narrative vault id: ${id}`, nodeId: id })

  const byId = new Map<string, VaultDocument>()
  for (const doc of nodeDocs) if (!byId.has(stringField(doc, "id"))) byId.set(stringField(doc, "id"), doc)
  const claimIds = new Set(docs.filter((doc) => typeField(doc) === "claim").map((doc) => stringField(doc, "id")).filter(Boolean))

  for (const doc of docs) {
    if (!stringField(doc, "type")) diagnostics.push({ severity: "error", code: "missing_type", message: "Missing required frontmatter field: type", file: doc.relativePath })
    else if (!isVaultNodeType(stringField(doc, "type"))) diagnostics.push({ severity: "error", code: "unknown_node_type", message: `Unknown narrative vault node type: ${stringField(doc, "type")}`, file: doc.relativePath, nodeId: stringField(doc, "id") })
    if (requiresId(doc) && !stringField(doc, "id")) diagnostics.push({ severity: "error", code: "missing_id", message: "Missing required frontmatter field: id", file: doc.relativePath })
  }

  const relations = docs.flatMap((doc) => doc.relations)
  for (const relation of relations) {
    const from = byId.get(relation.fromId)
    const to = byId.get(relation.toId)
    if (!to) {
      diagnostics.push({ severity: "error", code: "broken_link", message: `Relation points to unknown node: ${relation.toId}`, file: relation.file, nodeId: relation.fromId })
      continue
    }
    const illegalReason = illegalRelationReason(typeField(from), typeField(to), relation.relation)
    if (illegalReason) diagnostics.push({ severity: "error", code: "illegal_relation_target", message: illegalReason, file: relation.file, nodeId: relation.fromId })
  }

  for (const doc of docs.filter((item) => typeField(item) === "evidence")) {
    const evidenceId = stringField(doc, "id")
    const claimId = stringField(doc, "claimId")
    if (!claimId) {
      diagnostics.push({ severity: "error", code: "evidence_claim_missing", message: `Evidence ${evidenceId || doc.relativePath} is missing required claimId.`, file: doc.relativePath, nodeId: evidenceId })
    } else if (!claimIds.has(claimId)) {
      diagnostics.push({ severity: "error", code: "evidence_claim_missing", message: `Evidence ${evidenceId || doc.relativePath} references unknown claim ${claimId}.`, file: doc.relativePath, nodeId: evidenceId })
    }
  }

  const narrative: Partial<NarrativeStateV1> = {
    version: 1,
    id: stringField(findType(docs, "index"), "id") || "narrative:workspace",
    status: statusField(findType(docs, "index"), "status") ?? "draft",
    audience: compileAudience(findType(docs, "audience")),
    decision: compileDecision(findType(docs, "decision")),
    thesis: compileThesis(findType(docs, "thesis")),
    claims: docs.filter((doc) => typeField(doc) === "claim").map(compileClaim),
    evidenceBindings: docs.filter((doc) => typeField(doc) === "evidence").map(compileEvidence),
    objections: docs.filter((doc) => typeField(doc) === "objection").map(compileObjection),
    risks: docs.filter((doc) => typeField(doc) === "risk").map(compileRisk),
    researchGaps: docs.filter((doc) => typeField(doc) === "research-gap").map((doc) => compileResearchGap(doc, options.now)),
    claimRelations: relations
      .filter((relation) => byId.get(relation.fromId) && typeField(byId.get(relation.fromId)) === "claim" && byId.get(relation.toId) && typeField(byId.get(relation.toId)) === "claim")
      .map((relation) => ({ id: stableClaimRelationId(relation.fromId, relation.toId, relation.relation), fromClaimId: relation.fromId, toClaimId: relation.toId, relation: relation.relation, rationale: relation.rationale })),
    approvals: options.fallbackApprovals ?? [],
    updatedAt: options.now ?? new Date().toISOString(),
  }

  const normalized = normalizeCanonicalNarrativeState(narrative, "vault")
  if (!normalized) diagnostics.push({ severity: "error", code: "compile_failed", message: "Narrative vault could not be normalized." })
  if (normalized) addSemanticDiagnostics(normalized, diagnostics)
  if (normalized && normalized.approvals.length > 0) {
    const currentHash = computeNarrativeHash(normalized)
    const latest = normalized.approvals[normalized.approvals.length - 1]
    if (latest && latest.narrativeHash !== currentHash) diagnostics.push({ severity: "warning", code: "stale_approval_hash", message: "Latest narrative approval hash is stale.", nodeId: normalized.id })
  }

  const graph: NarrativeVaultGraph = {
    nodes: nodeDocs.map((doc) => ({ id: stringField(doc, "id"), type: typeField(doc), file: doc.relativePath })),
    relations,
  }
  return { ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error") && Boolean(normalized), narrative: normalized, diagnostics, graph }
}

function compileAudience(doc: VaultDocument | undefined): AudienceIntent {
  return {
    primary: stringField(doc, "primary") || firstParagraphOrBody(doc?.body ?? ""),
    secondary: arrayField(doc, "secondary"),
    beliefBefore: stringField(doc, "beliefBefore"),
    beliefAfter: stringField(doc, "beliefAfter"),
    decisionContext: stringField(doc, "decisionContext"),
    successCriteria: arrayField(doc, "successCriteria"),
  }
}

function compileDecision(doc: VaultDocument | undefined): DecisionIntent {
  return {
    action: stringField(doc, "action") || firstParagraphOrBody(doc?.body ?? ""),
    owner: stringField(doc, "owner"),
    deadline: stringField(doc, "deadline"),
    decisionType: enumField(doc, "decisionType", ["approve", "invest", "prioritize", "align", "choose", "understand", "other"]),
    consequenceOfNoDecision: stringField(doc, "consequenceOfNoDecision"),
  }
}

function compileThesis(doc: VaultDocument | undefined): NarrativeThesis | undefined {
  if (!doc) return undefined
  return { id: stringField(doc, "id") || "thesis:main", statement: stringField(doc, "statement") || firstParagraphOrBody(doc.body), confidence: enumField(doc, "confidence", ["high", "medium", "low"]) ?? "medium", caveat: stringField(doc, "caveat") }
}

function compileClaim(doc: VaultDocument): NarrativeClaim {
  return {
    id: stringField(doc, "id"),
    kind: enumField(doc, "kind", ["context", "problem", "opportunity", "evidence", "recommendation", "risk", "assumption", "ask"]) ?? "evidence",
    text: stringField(doc, "text") || firstParagraphOrBody(doc.body),
    importance: enumField(doc, "importance", ["central", "supporting", "background"]) ?? "supporting",
    evidenceRequired: booleanField(doc, "evidenceRequired", true),
    evidenceStatus: "missing",
    supportedScope: stringField(doc, "supportedScope"),
    unsupportedScope: stringField(doc, "unsupportedScope"),
    caveats: [...arrayField(doc, "caveats"), ...parseMarkdownList(doc.sections.caveats ?? "")],
  }
}

function compileEvidence(doc: VaultDocument): NarrativeEvidenceBinding {
  return {
    id: stringField(doc, "id"),
    claimId: stringField(doc, "claimId"),
    source: stringField(doc, "source") || stringField(doc, "sourcePath") || stringField(doc, "findingsFile") || stringField(doc, "url"),
    sourcePath: stringField(doc, "sourcePath"),
    findingsFile: stringField(doc, "findingsFile"),
    quote: stringField(doc, "quote") || firstParagraphOrBody(doc.body),
    location: stringField(doc, "location"),
    url: stringField(doc, "url"),
    caveat: stringField(doc, "caveat"),
    supportScope: stringField(doc, "supportScope"),
    unsupportedScope: stringField(doc, "unsupportedScope"),
    strength: enumField(doc, "strength", ["strong", "partial", "weak"]) ?? "weak",
  }
}

function compileObjection(doc: VaultDocument): NarrativeObjection {
  return { id: stringField(doc, "id"), text: stringField(doc, "text") || firstParagraphOrBody(doc.body), claimId: stringField(doc, "claimId"), priority: enumField(doc, "priority", ["high", "medium", "low"]) ?? "medium", response: stringField(doc, "response") || firstParagraphOrBody(doc.sections.response ?? "") }
}

function compileRisk(doc: VaultDocument): NarrativeRisk {
  return { id: stringField(doc, "id"), text: stringField(doc, "text") || firstParagraphOrBody(doc.body), claimId: stringField(doc, "claimId"), severity: enumField(doc, "severity", ["high", "medium", "low"]) ?? "medium", mitigation: stringField(doc, "mitigation") || firstParagraphOrBody(doc.sections.mitigation ?? "") }
}

function compileResearchGap(doc: VaultDocument, now = new Date().toISOString()): NarrativeResearchGap {
  return {
    id: stringField(doc, "id"),
    targetType: enumField(doc, "targetType", ["claim", "objection", "risk", "decision", "narrative"]) ?? "narrative",
    targetId: stringField(doc, "targetId"),
    question: stringField(doc, "question") || firstParagraphOrBody(doc.body),
    status: enumField(doc, "status", ["open", "in_progress", "findings_saved", "attached", "evidence_bound", "closed"]) ?? "open",
    priority: enumField(doc, "priority", ["high", "medium", "low"]) ?? "medium",
    findingsFile: stringField(doc, "findingsFile"),
    evidenceBindingIds: arrayField(doc, "evidenceBindingIds"),
    notes: stringField(doc, "notes") || firstParagraphOrBody(doc.sections.notes ?? ""),
    createdAt: stringField(doc, "createdAt") || now,
    updatedAt: stringField(doc, "updatedAt") || now,
    closedAt: stringField(doc, "closedAt"),
  }
}

function addSemanticDiagnostics(narrative: NarrativeStateV1, diagnostics: VaultDiagnostic[]): void {
  const claimIds = new Set(narrative.claims.map((claim) => claim.id))
  const evidenceIds = new Set(narrative.evidenceBindings.map((binding) => binding.id))
  for (const binding of narrative.evidenceBindings) {
    if (!binding.source || !binding.quote || !binding.supportScope || !binding.unsupportedScope || !binding.caveat) diagnostics.push({ severity: "warning", code: "evidence_trace_incomplete", message: `Evidence node ${binding.id} is missing source trace, quote, scope, unsupported scope, or caveat.`, nodeId: binding.id })
    if (!claimIds.has(binding.claimId)) diagnostics.push({ severity: "error", code: "evidence_claim_missing", message: `Evidence ${binding.id} references unknown claim ${binding.claimId}.`, nodeId: binding.id })
  }
  for (const claim of narrative.claims) {
    if (claim.importance === "central" && !narrative.claimRelations?.some((relation) => relation.fromClaimId === claim.id || relation.toClaimId === claim.id) && narrative.claims.length > 1) diagnostics.push({ severity: "warning", code: "orphan_central_claim", message: `Central claim ${claim.id} has no claim relations.`, nodeId: claim.id })
    if (claim.evidenceRequired && !narrative.evidenceBindings.some((binding) => binding.claimId === claim.id)) diagnostics.push({ severity: "warning", code: "claim_missing_evidence", message: `Evidence-required claim ${claim.id} has no evidence binding.`, nodeId: claim.id })
  }
  for (const gap of narrative.researchGaps ?? []) {
    if (gap.status !== "closed") diagnostics.push({ severity: "warning", code: "research_gap_unresolved", message: `Research gap ${gap.id} is unresolved.`, nodeId: gap.id })
    for (const id of gap.evidenceBindingIds ?? []) if (!evidenceIds.has(id)) diagnostics.push({ severity: "warning", code: "gap_evidence_missing", message: `Research gap ${gap.id} references unknown evidence ${id}.`, nodeId: gap.id })
  }
}

function findType(docs: VaultDocument[], type: VaultNodeType): VaultDocument | undefined {
  return docs.find((doc) => typeField(doc) === type)
}

function typeField(doc: VaultDocument | undefined): VaultNodeType {
  const value = stringField(doc, "type")
  if (isVaultNodeType(value)) return value
  return "index"
}

function isVaultNodeType(value: string): value is VaultNodeType {
  return value === "research-gap" || ["index", "audience", "decision", "thesis", "claim", "evidence", "objection", "risk"].includes(value)
}

function illegalRelationReason(fromType: VaultNodeType, toType: VaultNodeType, relation: string): string | undefined {
  if (fromType !== "claim") return `Relation ${relation} must start from a claim node, not ${fromType}.`
  const allowedTargets: Record<string, VaultNodeType[]> = {
    leads_to: ["claim"],
    supports: ["claim"],
    contrasts_with: ["claim"],
    depends_on: ["claim", "evidence"],
    constrains: ["claim", "risk"],
    answers: ["claim", "objection"],
  }
  if (!allowedTargets[relation]?.includes(toType)) return `Relation ${relation} from a claim cannot target ${toType}.`
  return undefined
}

function requiresId(doc: VaultDocument): boolean {
  return typeField(doc) !== "audience" && typeField(doc) !== "decision"
}

function stringField(doc: VaultDocument | undefined, key: string): string {
  const value = doc?.frontmatter[key]
  return typeof value === "string" ? value.trim() : ""
}

function arrayField(doc: VaultDocument | undefined, key: string): string[] {
  const value = doc?.frontmatter[key]
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean)
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean)
  return []
}

function booleanField(doc: VaultDocument | undefined, key: string, fallback: boolean): boolean {
  const value = doc?.frontmatter[key]
  return typeof value === "boolean" ? value : fallback
}

function enumField<T extends string>(doc: VaultDocument | undefined, key: string, allowed: readonly T[]): T | undefined {
  const value = stringField(doc, key)
  return allowed.includes(value as T) ? value as T : undefined
}

function statusField(doc: VaultDocument | undefined, key: string): NarrativeStatus | undefined {
  return enumField(doc, key, ["draft", "needs_research", "needs_user_confirmation", "ready_for_approval", "approved"])
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}
