import { readNarrativeVaultDocuments } from "./read"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { narrativeVaultPath } from "./paths"
import { parseRelationRegistry } from "./relations"
import type { VaultDiagnostic, VaultDocument, VaultNodeType, VaultRelation } from "./types"

export interface NarrativeVaultInventoryNode {
  id: string
  type: VaultNodeType
  file: string
  title: string
  text: string
}

export interface NarrativeVaultInventoryClaim extends NarrativeVaultInventoryNode {
  kind: string
  importance: string
  evidenceRequired: boolean
  evidenceStatus: string
}

export interface NarrativeVaultInventoryEvidence extends NarrativeVaultInventoryNode {
  claimId: string
  source: string
  sourcePath: string
  url: string
  findingsFile: string
  strength: string
  quote: string
}

export interface NarrativeVaultInventoryResearchGap extends NarrativeVaultInventoryNode {
  targetType: string
  targetId: string
  question: string
  status: string
  priority: string
  findingsFile: string
}

export interface NarrativeVaultInventoryObjection extends NarrativeVaultInventoryNode {
  claimId: string
  priority: string
}

export interface NarrativeVaultInventoryRisk extends NarrativeVaultInventoryNode {
  claimId: string
  severity: string
}

export interface NarrativeVaultInventoryRelation extends VaultRelation {
  unresolved: boolean
}

export interface NarrativeVaultRelationCoverage {
  danglingEdges: NarrativeVaultInventoryRelation[]
  unboundEvidence: string[]
  unboundObjections: string[]
  unboundRisks: string[]
  unboundResearchGaps: string[]
  isolatedClaims: string[]
  orphanNodes: string[]
  legacyInlineRelations: Array<{ file: string; nodeId: string }>
}

export interface NarrativeVaultInventoryUnresolvedRef {
  kind: "relation" | "evidenceClaimId" | "gapTarget" | "objectionClaimId" | "riskClaimId"
  fromId: string
  targetId: string
  file: string
  field?: string
}

export interface NarrativeVaultInventory {
  ok: boolean
  path: "revela-narrative"
  counts: {
    claims: number
    evidence: number
    researchGaps: number
    objections: number
    risks: number
    relations: number
    unresolvedRefs: number
  }
  claims: NarrativeVaultInventoryClaim[]
  evidence: NarrativeVaultInventoryEvidence[]
  researchGaps: NarrativeVaultInventoryResearchGap[]
  objections: NarrativeVaultInventoryObjection[]
  risks: NarrativeVaultInventoryRisk[]
  relations: NarrativeVaultInventoryRelation[]
  relationCoverage: NarrativeVaultRelationCoverage
  unresolvedRefs: NarrativeVaultInventoryUnresolvedRef[]
  idHints: {
    nextClaimIdExamples: string[]
    nextEvidenceIdExamples: string[]
    nextResearchGapIdExamples: string[]
  }
  diagnostics: VaultDiagnostic[]
}

export function buildNarrativeVaultInventory(workspaceRoot: string): NarrativeVaultInventory {
  const { documents, diagnostics } = readNarrativeVaultDocuments(workspaceRoot)
  const ids = new Set(documents.map((doc) => nodeId(doc)).filter(Boolean))
  const claimIds = new Set(documents.filter((doc) => nodeType(doc) === "claim").map((doc) => nodeId(doc)).filter(Boolean))
  const unresolvedRefs: NarrativeVaultInventoryUnresolvedRef[] = []
  const relations: NarrativeVaultInventoryRelation[] = []
  const registry = readRegistryRelations(workspaceRoot)
  diagnostics.push(...registry.diagnostics)

  for (const doc of documents) {
    const fromId = nodeId(doc)
    for (const relation of doc.relations) {
      const unresolved = !ids.has(relation.toId)
      relations.push({ ...relation, unresolved })
      if (unresolved) unresolvedRefs.push({ kind: "relation", fromId, targetId: relation.toId, file: relation.file })
    }
  }

  for (const relation of registry.relations) {
    const unresolved = !ids.has(relation.fromId) || !ids.has(relation.toId)
    relations.push({ ...relation, unresolved })
    if (unresolved) unresolvedRefs.push({ kind: "relation", fromId: relation.fromId, targetId: !ids.has(relation.fromId) ? relation.fromId : relation.toId, file: relation.file })
  }

  const claims: NarrativeVaultInventoryClaim[] = []
  const evidence: NarrativeVaultInventoryEvidence[] = []
  const researchGaps: NarrativeVaultInventoryResearchGap[] = []
  const objections: NarrativeVaultInventoryObjection[] = []
  const risks: NarrativeVaultInventoryRisk[] = []

  for (const doc of documents) {
    const id = nodeId(doc)
    const type = nodeType(doc)
    if (!id || !type) continue
    const base = baseNode(doc, id, type)
    if (type === "claim") {
      claims.push({
        ...base,
        kind: stringField(doc, "kind"),
        importance: stringField(doc, "importance"),
        evidenceRequired: booleanField(doc, "evidenceRequired"),
        evidenceStatus: stringField(doc, "evidenceStatus"),
      })
      continue
    }
    if (type === "evidence") {
      const claimId = stringField(doc, "claimId")
      const registryClaimId = relationTargetFor(relations, id, "supports", claimIds)
      if (!claimId && !registryClaimId) unresolvedRefs.push({ kind: "evidenceClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      else if (claimId && !claimIds.has(claimId)) unresolvedRefs.push({ kind: "evidenceClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      evidence.push({
        ...base,
        claimId: claimId || registryClaimId,
        source: stringField(doc, "source"),
        sourcePath: stringField(doc, "sourcePath"),
        url: stringField(doc, "url"),
        findingsFile: stringField(doc, "findingsFile"),
        strength: stringField(doc, "strength"),
        quote: firstText(stringField(doc, "quote") || doc.body),
      })
      continue
    }
    if (type === "research-gap") {
      const targetType = stringField(doc, "targetType")
      const targetId = stringField(doc, "targetId")
      const registryTargetId = relationTargetFor(relations, id, "depends_on", ids)
      if (targetId && !isLooseTargetType(targetType) && !ids.has(targetId)) unresolvedRefs.push({ kind: "gapTarget", fromId: id, targetId, file: doc.relativePath, field: "targetId" })
      researchGaps.push({
        ...base,
        targetType,
        targetId: targetId || registryTargetId,
        question: stringField(doc, "question") || firstText(doc.body),
        status: stringField(doc, "status"),
        priority: stringField(doc, "priority"),
        findingsFile: stringField(doc, "findingsFile"),
      })
      continue
    }
    if (type === "objection") {
      const claimId = stringField(doc, "claimId")
      const registryClaimId = relationTargetFor(relations, id, "answers", claimIds) || relationTargetFor(relations, id, "contrasts_with", claimIds)
      if (!claimId && !registryClaimId) unresolvedRefs.push({ kind: "objectionClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      else if (claimId && !claimIds.has(claimId)) unresolvedRefs.push({ kind: "objectionClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      objections.push({ ...base, claimId: claimId || registryClaimId, priority: stringField(doc, "priority") })
      continue
    }
    if (type === "risk") {
      const claimId = stringField(doc, "claimId")
      const registryClaimId = relationTargetFor(relations, id, "constrains", claimIds)
      if (!claimId && !registryClaimId) unresolvedRefs.push({ kind: "riskClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      else if (claimId && !claimIds.has(claimId)) unresolvedRefs.push({ kind: "riskClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      risks.push({ ...base, claimId: claimId || registryClaimId, severity: stringField(doc, "severity") })
    }
  }

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error") && unresolvedRefs.length === 0
  const relationCoverage = buildRelationCoverage(documents, claims, evidence, objections, risks, researchGaps, relations, ids)
  return {
    ok,
    path: "revela-narrative",
    counts: {
      claims: claims.length,
      evidence: evidence.length,
      researchGaps: researchGaps.length,
      objections: objections.length,
      risks: risks.length,
      relations: relations.length,
      unresolvedRefs: unresolvedRefs.length,
    },
    claims,
    evidence,
    researchGaps,
    objections,
    risks,
    relations,
    relationCoverage,
    unresolvedRefs,
    idHints: buildIdHints(ids),
    diagnostics,
  }
}

function readRegistryRelations(workspaceRoot: string): { relations: VaultRelation[]; diagnostics: VaultDiagnostic[] } {
  const file = join(narrativeVaultPath(workspaceRoot), "relations.md")
  if (!existsSync(file)) return { relations: [], diagnostics: [] }
  const parsed = parseRelationRegistry(readFileSync(file, "utf-8"), "relations.md")
  return {
    relations: parsed.relations,
    diagnostics: parsed.diagnostics.map((diagnostic) => ({ severity: "error", code: diagnostic.code, message: diagnostic.message, file: "relations.md", nodeId: diagnostic.edgeId })),
  }
}

function buildRelationCoverage(
  documents: VaultDocument[],
  claims: NarrativeVaultInventoryClaim[],
  evidence: NarrativeVaultInventoryEvidence[],
  objections: NarrativeVaultInventoryObjection[],
  risks: NarrativeVaultInventoryRisk[],
  researchGaps: NarrativeVaultInventoryResearchGap[],
  relations: NarrativeVaultInventoryRelation[],
  ids: Set<string>,
): NarrativeVaultRelationCoverage {
  const connected = new Set<string>()
  for (const relation of relations) {
    if (ids.has(relation.fromId)) connected.add(relation.fromId)
    if (ids.has(relation.toId)) connected.add(relation.toId)
  }
  const relationToClaim = (id: string, relation: string) => relations.some((edge) => edge.fromId === id && edge.relation === relation && claims.some((claim) => claim.id === edge.toId))
  const claimLinked = (id: string) => relations.some((edge) => (edge.fromId === id && claims.some((claim) => claim.id === edge.toId)) || (edge.toId === id && claims.some((claim) => claim.id === edge.fromId)))
  return {
    danglingEdges: relations.filter((relation) => relation.unresolved),
    unboundEvidence: evidence.filter((item) => !item.claimId && !relationToClaim(item.id, "supports")).map((item) => item.id),
    unboundObjections: objections.filter((item) => !item.claimId && !relationToClaim(item.id, "answers") && !relationToClaim(item.id, "contrasts_with")).map((item) => item.id),
    unboundRisks: risks.filter((item) => !item.claimId && !relationToClaim(item.id, "constrains")).map((item) => item.id),
    unboundResearchGaps: researchGaps.filter((item) => !item.targetId && !relations.some((edge) => edge.fromId === item.id)).map((item) => item.id),
    isolatedClaims: claims.filter((claim) => claim.importance === "central" && claims.length > 1 && !claimLinked(claim.id)).map((claim) => claim.id),
    orphanNodes: [...claims, ...evidence, ...objections, ...risks, ...researchGaps].filter((item) => !connected.has(item.id)).map((item) => item.id),
    legacyInlineRelations: documents.filter((doc) => doc.relations.length > 0).map((doc) => ({ file: doc.relativePath, nodeId: nodeId(doc) })),
  }
}

function relationTargetFor(relations: NarrativeVaultInventoryRelation[], fromId: string, relation: string, targetIds: Set<string>): string {
  return relations.find((edge) => edge.fromId === fromId && edge.relation === relation && targetIds.has(edge.toId))?.toId ?? ""
}

function baseNode(doc: VaultDocument, id: string, type: VaultNodeType): NarrativeVaultInventoryNode {
  return {
    id,
    type,
    file: doc.relativePath,
    title: stringField(doc, "title"),
    text: firstText(doc.body),
  }
}

function nodeId(doc: VaultDocument): string {
  return stringField(doc, "id")
}

function nodeType(doc: VaultDocument): VaultNodeType | "" {
  const type = stringField(doc, "type")
  return isVaultNodeType(type) ? type : ""
}

function isVaultNodeType(type: string): type is VaultNodeType {
  return ["index", "audience", "decision", "thesis", "claim", "evidence", "objection", "risk", "research-gap"].includes(type)
}

function stringField(doc: VaultDocument, key: string): string {
  const value = doc.frontmatter[key]
  return typeof value === "string" ? value.trim() : ""
}

function booleanField(doc: VaultDocument, key: string): boolean {
  return doc.frontmatter[key] === true
}

function firstText(markdown: string): string {
  return markdown
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s+/, "").trim())
    .find((line) => line && !line.startsWith("- ")) ?? ""
}

function isLooseTargetType(targetType: string): boolean {
  return !targetType || targetType === "narrative" || targetType === "decision"
}

function buildIdHints(ids: Set<string>): NarrativeVaultInventory["idHints"] {
  return {
    nextClaimIdExamples: [nextAvailableId("claim-market-context", ids), nextAvailableId("claim-recommendation", ids)],
    nextEvidenceIdExamples: [nextAvailableId("evidence-source-quote", ids), nextAvailableId("evidence-research-finding", ids)],
    nextResearchGapIdExamples: [nextAvailableId("gap-market-size", ids), nextAvailableId("gap-source-validation", ids)],
  }
}

function nextAvailableId(base: string, ids: Set<string>): string {
  if (!ids.has(base)) return base
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`
    if (!ids.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}
