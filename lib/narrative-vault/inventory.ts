import { readNarrativeVaultDocuments } from "./read"
import { stableVaultRelationId } from "./relations"
import type { NarrativeClaimRelationType } from "../narrative-state/types"
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

export interface NarrativeVaultRelationCandidate {
  id: string
  fromId: string
  toId: string
  relation: NarrativeClaimRelationType
  rationale: string
  source: "frontmatter"
}

export interface NarrativeVaultRelationCoverage {
  danglingEdges: NarrativeVaultInventoryRelation[]
  unboundEvidence: string[]
  unboundObjections: string[]
  unboundRisks: string[]
  unboundResearchGaps: string[]
  fallbackOnlyBindings: Array<{ nodeId: string; file: string; field: string; relation: NarrativeClaimRelationType; targetId: string }>
  isolatedClaims: string[]
  orphanNodes: string[]
  inlineRelations: Array<{ file: string; nodeId: string }>
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
  relationSummary: {
    inlineEdges: number
    advisoryCandidates: number
  }
  relationCandidates: NarrativeVaultRelationCandidate[]
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

  for (const doc of documents) {
    const fromId = nodeId(doc)
    for (const relation of doc.relations) {
      const unresolved = !ids.has(relation.toId)
      relations.push({ ...relation, unresolved })
      if (unresolved) unresolvedRefs.push({ kind: "relation", fromId, targetId: relation.toId, file: relation.file })
    }
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
      const inlineClaimId = relationTargetFor(relations, id, "supports", claimIds)
      if (!claimId && !inlineClaimId) unresolvedRefs.push({ kind: "evidenceClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      else if (claimId && !claimIds.has(claimId)) unresolvedRefs.push({ kind: "evidenceClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      evidence.push({
        ...base,
        claimId: inlineClaimId || claimId,
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
      const inlineTargetId = relationTargetFor(relations, id, "depends_on", ids)
      if (targetId && !isLooseTargetType(targetType) && !ids.has(targetId)) unresolvedRefs.push({ kind: "gapTarget", fromId: id, targetId, file: doc.relativePath, field: "targetId" })
      researchGaps.push({
        ...base,
        targetType,
        targetId: inlineTargetId || targetId,
        question: stringField(doc, "question") || firstText(doc.body),
        status: stringField(doc, "status"),
        priority: stringField(doc, "priority"),
        findingsFile: stringField(doc, "findingsFile"),
      })
      continue
    }
    if (type === "objection") {
      const claimId = stringField(doc, "claimId")
      const inlineClaimId = relationTargetFor(relations, id, "answers", claimIds) || relationTargetFor(relations, id, "contrasts_with", claimIds)
      if (!claimId && !inlineClaimId) unresolvedRefs.push({ kind: "objectionClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      else if (claimId && !claimIds.has(claimId)) unresolvedRefs.push({ kind: "objectionClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      objections.push({ ...base, claimId: inlineClaimId || claimId, priority: stringField(doc, "priority") })
      continue
    }
    if (type === "risk") {
      const claimId = stringField(doc, "claimId")
      const inlineClaimId = relationTargetFor(relations, id, "constrains", claimIds)
      if (!claimId && !inlineClaimId) unresolvedRefs.push({ kind: "riskClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      else if (claimId && !claimIds.has(claimId)) unresolvedRefs.push({ kind: "riskClaimId", fromId: id, targetId: claimId, file: doc.relativePath, field: "claimId" })
      risks.push({ ...base, claimId: inlineClaimId || claimId, severity: stringField(doc, "severity") })
    }
  }

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error") && unresolvedRefs.length === 0
  const relationCoverage = buildRelationCoverage(documents, claims, evidence, objections, risks, researchGaps, relations, ids)
  const relationCandidates = buildRelationCandidates(documents, relations, ids)
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
    relationSummary: {
      inlineEdges: relations.length,
      advisoryCandidates: relationCandidates.length,
    },
    relationCandidates,
    unresolvedRefs,
    idHints: buildIdHints(ids),
    diagnostics,
  }
}

function buildRelationCandidates(documents: VaultDocument[], relations: NarrativeVaultInventoryRelation[], ids: Set<string>): NarrativeVaultRelationCandidate[] {
  const candidates: NarrativeVaultRelationCandidate[] = []
  const addCandidate = (candidate: NarrativeVaultRelationCandidate) => {
    if (!ids.has(candidate.fromId) || !ids.has(candidate.toId)) return
    if (relations.some((edge) => edge.fromId === candidate.fromId && edge.toId === candidate.toId && edge.relation === candidate.relation)) return
    if (candidates.some((edge) => edge.fromId === candidate.fromId && edge.toId === candidate.toId && edge.relation === candidate.relation)) return
    candidates.push(candidate)
  }

  for (const doc of documents) {
    const id = nodeId(doc)
    const type = nodeType(doc)
    if (!id || !type) continue
    if (type === "evidence") {
      addFrontmatterCandidate(doc, id, "claimId", "supports", "Evidence frontmatter points at this claim.", addCandidate)
    } else if (type === "objection") {
      addFrontmatterCandidate(doc, id, "claimId", "answers", "Objection frontmatter points at this claim.", addCandidate)
    } else if (type === "risk") {
      addFrontmatterCandidate(doc, id, "claimId", "constrains", "Risk frontmatter points at this claim.", addCandidate)
    } else if (type === "research-gap") {
      addFrontmatterCandidate(doc, id, "targetId", "depends_on", "Research gap frontmatter points at this target.", addCandidate)
    }
  }

  return candidates.sort((a, b) => a.id.localeCompare(b.id))
}

function addFrontmatterCandidate(
  doc: VaultDocument,
  fromId: string,
  targetField: string,
  relation: NarrativeClaimRelationType,
  rationale: string,
  addCandidate: (candidate: NarrativeVaultRelationCandidate) => void,
): void {
  const toId = stringField(doc, targetField)
  if (!toId) return
  addCandidate({ id: candidateRelationId(fromId, relation, toId), fromId, toId, relation, rationale, source: "frontmatter" })
}

function candidateRelationId(fromId: string, relation: NarrativeClaimRelationType, toId: string): string {
  return stableVaultRelationId(fromId, relation, toId)
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
  const fallbackOnlyBindings = buildFallbackOnlyBindings(documents, relations, ids)
  return {
    danglingEdges: relations.filter((relation) => relation.unresolved),
    unboundEvidence: evidence.filter((item) => !item.claimId && !relationToClaim(item.id, "supports")).map((item) => item.id),
    unboundObjections: objections.filter((item) => !item.claimId && !relationToClaim(item.id, "answers") && !relationToClaim(item.id, "contrasts_with")).map((item) => item.id),
    unboundRisks: risks.filter((item) => !item.claimId && !relationToClaim(item.id, "constrains")).map((item) => item.id),
    unboundResearchGaps: researchGaps.filter((item) => !item.targetId && !relations.some((edge) => edge.fromId === item.id)).map((item) => item.id),
    fallbackOnlyBindings,
    isolatedClaims: claims.filter((claim) => claim.importance === "central" && claims.length > 1 && !claimLinked(claim.id)).map((claim) => claim.id),
    orphanNodes: [...claims, ...evidence, ...objections, ...risks, ...researchGaps].filter((item) => !connected.has(item.id)).map((item) => item.id),
    inlineRelations: documents.filter((doc) => doc.relations.length > 0).map((doc) => ({ file: doc.relativePath, nodeId: nodeId(doc) })),
  }
}

function buildFallbackOnlyBindings(documents: VaultDocument[], relations: NarrativeVaultInventoryRelation[], ids: Set<string>): NarrativeVaultRelationCoverage["fallbackOnlyBindings"] {
  const items: NarrativeVaultRelationCoverage["fallbackOnlyBindings"] = []
  const add = (doc: VaultDocument, field: string, relation: NarrativeClaimRelationType) => {
    const node = nodeId(doc)
    const targetId = stringField(doc, field)
    if (!node || !targetId || !ids.has(targetId)) return
    if (relations.some((edge) => edge.fromId === node && edge.toId === targetId && edge.relation === relation)) return
    items.push({ nodeId: node, file: doc.relativePath, field, relation, targetId })
  }
  for (const doc of documents) {
    const type = nodeType(doc)
    if (type === "evidence") add(doc, "claimId", "supports")
    else if (type === "objection") add(doc, "claimId", "answers")
    else if (type === "risk") add(doc, "claimId", "constrains")
    else if (type === "research-gap") add(doc, "targetId", "depends_on")
  }
  return items
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
