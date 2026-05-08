import { createHash } from "crypto"
import type { DeckSpec, DecksState, EvidenceRef, NarrativeBrief, ResearchAxis, SlideSpec, SourceMaterial } from "../decks-state"
import type { NarrativeClaimRelation, NarrativeEvidenceBinding, NarrativeResearchGap, NarrativeStateV1 } from "../narrative-state/types"
import { renderTargetId } from "./render-targets"
import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeType, RenderTarget, WorkspaceGraph } from "./types"

export interface ProjectWorkspaceGraphOptions {
  slug?: string
}

interface GraphBuilder {
  nodes: Map<string, GraphNode>
  edges: Map<string, GraphEdge>
}

export function projectWorkspaceGraph(state: DecksState, options: ProjectWorkspaceGraphOptions = {}): WorkspaceGraph {
  const deck = activeDeck(state, options.slug)
  const builder: GraphBuilder = { nodes: new Map(), edges: new Map() }

  for (const material of state.workspace.sourceMaterials ?? []) addSourceMaterial(builder, material)
  for (const axis of deck.researchPlan ?? []) addResearchFinding(builder, axis)

  const narrativeId = addNarrative(builder, state, deck)
  for (const slide of deck.slides.slice().sort((a, b) => a.index - b.index)) addSlide(builder, slide)
  for (const slide of deck.slides.slice().sort((a, b) => a.index - b.index)) addSlideClaimsAndEvidence(builder, slide)
  const targets = renderTargetsForDeck(state, deck)
  for (const target of targets) addArtifact(builder, deck, target, narrativeId, targets)

  return normalizeGraph(builder)
}

function activeDeck(state: DecksState, slug?: string): DeckSpec {
  const key = slug || state.activeDeck || (Object.keys(state.decks).length === 1 ? Object.keys(state.decks)[0] : undefined)
  if (!key || !state.decks[key]) throw new Error("No active deck is available for workspace graph projection.")
  return state.decks[key]
}

function addSourceMaterial(builder: GraphBuilder, material: SourceMaterial): void {
  const sourceId = sourceNodeId(material.path || material.fingerprint || "unknown-source")
  addNode(builder, {
    id: sourceId,
    type: "source",
    label: material.path,
    data: compactData({
      path: material.path,
      type: material.type,
      size: material.size,
      fingerprint: material.fingerprint,
      status: material.status,
      summary: material.summary,
      bestUsedFor: material.bestUsedFor,
    }),
  })

  const extraction = material.extraction
  if (!extraction) return
  const extractionKey = extraction.manifestPath || extraction.textPath || extraction.cacheDir
  if (!extractionKey) return

  const extractionId = extractionNodeId(extractionKey)
  addNode(builder, {
    id: extractionId,
    type: "extraction",
    label: extractionKey,
    data: compactData(extraction),
  })
  addEdge(builder, "extracted_as", sourceId, extractionId)
}

function addResearchFinding(builder: GraphBuilder, axis: ResearchAxis): void {
  if (!axis.findingsFile?.trim()) return
  const id = findingNodeId(axis.findingsFile)
  addNode(builder, {
    id,
    type: "finding",
    label: axis.findingsFile,
    data: compactData({
      axis: axis.axis,
      needed: axis.needed,
      status: axis.status,
      findingsFile: axis.findingsFile,
      notes: axis.notes,
      sourceKind: "researchPlan",
    }),
  })
}

function addNarrative(builder: GraphBuilder, state: DecksState, deck: DeckSpec): string | undefined {
  if (hasCanonicalNarrative(state.narrative)) return addCanonicalNarrative(builder, state.narrative, deck)

  const brief = deck.narrativeBrief
  if (!hasNarrativeBrief(brief)) return undefined

  const narrativeId = `narrative:${stableHash(deck.slug)}`
  addNode(builder, {
    id: narrativeId,
    type: "narrativeIntent",
    label: deck.goal || deck.slug,
    data: compactData({
      goal: deck.goal,
      audience: deck.audience,
      language: deck.language,
      audienceBeliefBefore: brief?.audienceBeliefBefore,
      audienceBeliefAfter: brief?.audienceBeliefAfter,
      decisionOrAction: brief?.decisionOrAction,
      narrativeArc: brief?.narrativeArc,
      keyClaims: brief?.keyClaims,
    }),
  })

  for (const objection of brief?.objections ?? []) {
    const objectionId = `objection:${stableHash(objection)}`
    addNode(builder, { id: objectionId, type: "objection", label: objection, data: { text: objection } })
    addEdge(builder, "contains", narrativeId, objectionId)
    addEdge(builder, "challenges", objectionId, narrativeId)
  }

  for (const risk of brief?.risks ?? []) {
    const riskId = `risk:${stableHash(risk)}`
    addNode(builder, { id: riskId, type: "risk", label: risk, data: { text: risk } })
    addEdge(builder, "contains", narrativeId, riskId)
    addEdge(builder, "constrained_by", narrativeId, riskId)
  }

  return narrativeId
}

function addCanonicalNarrative(builder: GraphBuilder, narrative: NarrativeStateV1, deck: DeckSpec): string {
  addNode(builder, {
    id: narrative.id,
    type: "narrativeIntent",
    label: narrative.thesis?.statement || deck.goal || narrative.id,
    data: compactData({
      status: narrative.status,
      goal: deck.goal,
      audience: narrative.audience.primary || deck.audience,
      language: deck.language,
      beliefBefore: narrative.audience.beliefBefore,
      beliefAfter: narrative.audience.beliefAfter,
      decisionOrAction: narrative.decision.action,
      thesis: narrative.thesis?.statement,
    }),
  })

  for (const claim of narrative.claims) {
    addNode(builder, {
      id: claim.id,
      type: "claim",
      label: claim.text,
      data: compactData({
        text: claim.text,
        kind: claim.kind,
        importance: claim.importance,
        evidenceRequired: claim.evidenceRequired,
        evidenceStatus: claim.evidenceStatus,
        supportedScope: claim.supportedScope,
        unsupportedScope: claim.unsupportedScope,
        caveats: claim.caveats,
        source: "canonicalNarrative",
      }),
    })
    addEdge(builder, "contains", narrative.id, claim.id)
  }

  for (const binding of narrative.evidenceBindings) {
    const supportId = addNarrativeEvidenceSupportNode(builder, binding)
    addEdge(builder, "supports", supportId, binding.claimId, compactData({
      strength: binding.strength,
      source: binding.source,
      quote: binding.quote,
      url: binding.url,
      sourcePath: binding.sourcePath,
      location: binding.location,
      findingsFile: binding.findingsFile,
      caveat: binding.caveat,
      supportScope: binding.supportScope,
      unsupportedScope: binding.unsupportedScope,
    }))
  }

  for (const relation of narrative.claimRelations ?? []) addClaimRelation(builder, relation)

  for (const objection of narrative.objections) {
    addNode(builder, {
      id: objection.id,
      type: "objection",
      label: objection.text,
      data: compactData({ text: objection.text, priority: objection.priority, response: objection.response }),
    })
    addEdge(builder, "contains", narrative.id, objection.id)
    addEdge(builder, "challenges", objection.id, objection.claimId || narrative.id)
  }

  for (const risk of narrative.risks) {
    addNode(builder, {
      id: risk.id,
      type: "risk",
      label: risk.text,
      data: compactData({ text: risk.text, severity: risk.severity, mitigation: risk.mitigation }),
    })
    addEdge(builder, "contains", narrative.id, risk.id)
    addEdge(builder, "constrained_by", risk.claimId || narrative.id, risk.id)
  }

  for (const gap of narrative.researchGaps ?? []) addResearchGap(builder, narrative, gap)

  return narrative.id
}

function addClaimRelation(builder: GraphBuilder, relation: NarrativeClaimRelation): void {
  addEdge(builder, graphEdgeTypeForClaimRelation(relation.relation), relation.fromClaimId, relation.toClaimId, compactData({
    relationId: relation.id,
    relation: relation.relation,
    rationale: relation.rationale,
    source: "canonicalNarrative",
  }))
}

function graphEdgeTypeForClaimRelation(relation: NarrativeClaimRelation["relation"]): GraphEdgeType {
  if (relation === "constrains") return "constrained_by"
  if (relation === "supports") return "supports"
  return relation
}

function addResearchGap(builder: GraphBuilder, narrative: NarrativeStateV1, gap: NarrativeResearchGap): void {
  addNode(builder, {
    id: gap.id,
    type: "researchGap",
    label: gap.question,
    data: compactData({
      question: gap.question,
      status: gap.status,
      priority: gap.priority,
      targetType: gap.targetType,
      targetId: gap.targetId,
      findingsFile: gap.findingsFile,
      evidenceBindingIds: gap.evidenceBindingIds,
      createdFromIssueType: gap.createdFromIssueType,
      notes: gap.notes,
    }),
  })
  addEdge(builder, "contains", narrative.id, gap.id)
  addEdge(builder, "derived_from", gap.id, gapTargetNodeId(narrative, gap))
  if (gap.findingsFile) addEdge(builder, "derived_from", gap.id, findingNodeId(gap.findingsFile), { status: gap.status })
  for (const evidenceId of gap.evidenceBindingIds ?? []) {
    const binding = narrative.evidenceBindings.find((item) => item.id === evidenceId)
    if (binding) addEdge(builder, "derived_from", gap.id, binding.claimId, { evidenceBindingId: evidenceId })
  }
}

function gapTargetNodeId(narrative: NarrativeStateV1, gap: NarrativeResearchGap): string {
  if (gap.targetId) return gap.targetId
  if (gap.targetType === "narrative" || gap.targetType === "decision") return narrative.id
  return narrative.id
}

function addSlide(builder: GraphBuilder, slide: SlideSpec): void {
  addNode(builder, {
    id: slideNodeId(slide.index),
    type: "slide",
    label: slide.title,
    data: compactData({
      index: slide.index,
      title: slide.title,
      purpose: slide.purpose,
      narrativeRole: slide.narrativeRole,
      layout: slide.layout,
      components: slide.components,
      status: slide.status,
    }),
  })
}

function addSlideClaimsAndEvidence(builder: GraphBuilder, slide: SlideSpec): void {
  const slideId = slideNodeId(slide.index)
  const claims = claimCandidates(slide)
  const claimIds = claims.map((claim) => addClaim(builder, slide, claim))

  for (const claimId of claimIds) {
    addEdge(builder, "contains", slideId, claimId)
    addEdge(builder, "appears_in", claimId, slideId)
  }

  for (const evidence of slide.evidence ?? []) {
    const supportId = addEvidenceSupportNode(builder, evidence)
    for (const claimId of claimIds) {
      addEdge(builder, "supports", supportId, claimId, compactData({
        slideIndex: slide.index,
        detailLevel: hasEvidenceDetail(evidence) ? "detailed" : "weak",
        source: evidence.source,
        quote: evidence.quote,
        page: evidence.page,
        url: evidence.url,
        sourcePath: evidence.sourcePath,
        location: evidence.location,
        findingsFile: evidence.findingsFile,
        caveat: evidence.caveat,
        extractedTextPath: evidence.extractedTextPath,
        extractedManifestPath: evidence.extractedManifestPath,
      }))
    }
  }
}

function addClaim(builder: GraphBuilder, slide: SlideSpec, claim: { origin: string; text: string }): string {
  const id = claimNodeId(slide.index, claim.text)
  addNode(builder, {
    id,
    type: "claim",
    label: claim.text,
    data: compactData({
      slideIndex: slide.index,
      slideTitle: slide.title,
      origin: claim.origin,
      text: claim.text,
    }),
  })
  return id
}

function addEvidenceSupportNode(builder: GraphBuilder, evidence: EvidenceRef): string {
  if (evidence.findingsFile?.trim()) {
    const id = findingNodeId(evidence.findingsFile)
    addNode(builder, {
      id,
      type: "finding",
      label: evidence.findingsFile,
      data: compactData({ findingsFile: evidence.findingsFile, source: evidence.source, quote: evidence.quote, location: evidence.location, caveat: evidence.caveat }),
    })
    return id
  }

  const sourceKey = evidence.sourcePath || evidence.source || evidence.url || "unknown-evidence-source"
  const id = sourceNodeId(sourceKey)
  addNode(builder, {
    id,
    type: "source",
    label: sourceKey,
    data: compactData({ source: evidence.source, sourcePath: evidence.sourcePath, url: evidence.url }),
  })

  if (evidence.extractedTextPath || evidence.extractedManifestPath) {
    const extractionKey = evidence.extractedTextPath || evidence.extractedManifestPath
    const extractionId = extractionNodeId(extractionKey ?? sourceKey)
    addNode(builder, {
      id: extractionId,
      type: "extraction",
      label: extractionKey,
      data: compactData({ textPath: evidence.extractedTextPath, manifestPath: evidence.extractedManifestPath }),
    })
    addEdge(builder, "extracted_as", id, extractionId)
  }

  return id
}

function addNarrativeEvidenceSupportNode(builder: GraphBuilder, binding: NarrativeEvidenceBinding): string {
  if (binding.findingsFile?.trim()) {
    const id = findingNodeId(binding.findingsFile)
    addNode(builder, {
      id,
      type: "finding",
      label: binding.findingsFile,
      data: compactData({ findingsFile: binding.findingsFile, source: binding.source, quote: binding.quote, location: binding.location, caveat: binding.caveat }),
    })
    return id
  }

  const sourceKey = binding.sourcePath || binding.source || binding.url || "unknown-narrative-evidence-source"
  const id = sourceNodeId(sourceKey)
  addNode(builder, {
    id,
    type: "source",
    label: sourceKey,
    data: compactData({ source: binding.source, sourcePath: binding.sourcePath, url: binding.url }),
  })
  return id
}

function addArtifact(builder: GraphBuilder, deck: DeckSpec, target: RenderTarget, narrativeId: string | undefined, targets: RenderTarget[]): void {
  const artifactId = artifactNodeId(target.outputPath ?? deck.outputPath)
  addNode(builder, {
    id: artifactId,
    type: "artifact",
    label: target.outputPath ?? deck.outputPath,
    data: compactData({
      renderTargetId: target.id,
      type: target.type,
      outputPath: target.outputPath ?? deck.outputPath,
      slug: deck.slug,
      status: deck.status,
      artifactVersion: target.artifactVersion,
      contractStatus: target.contractStatus,
    }),
  })

  if (narrativeId) addEdge(builder, "renders_from", artifactId, narrativeId)
  const sourceNodeIds = target.sourceNodeIds.length > 0 ? target.sourceNodeIds : deck.slides.map((slide) => slideNodeId(slide.index))
  for (const sourceNodeId of sourceNodeIds) addEdge(builder, "renders_from", artifactId, resolveRenderSourceNodeId(sourceNodeId, targets))
}

function renderTargetsForDeck(state: DecksState, deck: DeckSpec): RenderTarget[] {
  const deckOutputPath = normalizePath(deck.outputPath)
  const htmlTargetId = renderTargetId("html_deck", deckOutputPath)
  const htmlArtifactId = artifactNodeId(deckOutputPath)
  const targets = (state.renderTargets ?? []).filter((target) => {
    if (target.id === htmlTargetId) return true
    if (target.type === "html_deck") return normalizePath(target.outputPath ?? "") === deckOutputPath
    const data = target.data ?? {}
    return data.sourceTargetId === htmlTargetId ||
      data.sourceOutputPath === deckOutputPath ||
      target.sourceNodeIds.includes(htmlTargetId) ||
      target.sourceNodeIds.includes(htmlArtifactId)
  })
  const htmlTarget = targets.find((target) => target.id === htmlTargetId) ?? fallbackHtmlDeckRenderTarget(deck)
  if (!targets.some((target) => target.id === htmlTarget.id)) targets.push(htmlTarget)
  return targets.sort((a, b) => a.id.localeCompare(b.id))
}

function resolveRenderSourceNodeId(sourceNodeId: string, targets: RenderTarget[]): string {
  if (!sourceNodeId.startsWith("target:")) return sourceNodeId
  const target = targets.find((item) => item.id === sourceNodeId)
  return target ? artifactNodeId(target.outputPath ?? target.id) : sourceNodeId
}

function fallbackHtmlDeckRenderTarget(deck: DeckSpec): RenderTarget {
  return {
    id: renderTargetId("html_deck", deck.outputPath),
    type: "html_deck",
    outputPath: deck.outputPath,
    sourceNodeIds: deck.slides.map((slide) => slideNodeId(slide.index)),
    contractStatus: "unknown",
    data: { slug: deck.slug, compatibilityOutputPath: deck.outputPath },
  }
}

function claimCandidates(slide: SlideSpec): Array<{ origin: string; text: string }> {
  const claims: Array<{ origin: string; text: string }> = []
  pushClaim(claims, "title", slide.title)
  pushClaim(claims, "purpose", slide.purpose)
  pushClaim(claims, "headline", slide.content?.headline)
  for (const item of slide.content?.body ?? []) pushClaim(claims, "body", item)
  for (const item of slide.content?.bullets ?? []) pushClaim(claims, "bullet", item)
  return claims
}

function pushClaim(claims: Array<{ origin: string; text: string }>, origin: string, text: string | undefined): void {
  const value = cleanOptionalText(text)
  if (!value) return
  if (claims.some((claim) => claim.text === value)) return
  claims.push({ origin, text: value })
}

function hasNarrativeBrief(brief: NarrativeBrief | undefined): boolean {
  return Boolean(
    brief?.audienceBeliefBefore?.trim() ||
      brief?.audienceBeliefAfter?.trim() ||
      brief?.decisionOrAction?.trim() ||
      brief?.narrativeArc?.trim() ||
      brief?.keyClaims.length ||
      brief?.objections.length ||
      brief?.risks.length,
  )
}

function hasCanonicalNarrative(narrative: NarrativeStateV1 | undefined): narrative is NarrativeStateV1 {
  return Boolean(
    narrative?.audience.primary?.trim() ||
      narrative?.audience.beliefBefore?.trim() ||
      narrative?.audience.beliefAfter?.trim() ||
      narrative?.decision.action?.trim() ||
      narrative?.thesis?.statement?.trim() ||
      narrative?.claims.length ||
      narrative?.evidenceBindings.length ||
      narrative?.objections.length ||
      narrative?.risks.length ||
      narrative?.researchGaps?.length,
  )
}

function hasEvidenceDetail(evidence: EvidenceRef): boolean {
  return Boolean(
    evidence.quote?.trim() ||
      evidence.page?.trim() ||
      evidence.location?.trim() ||
      evidence.url?.trim() ||
      evidence.findingsFile?.trim() ||
      evidence.sourcePath?.trim() ||
      evidence.extractedTextPath?.trim(),
  )
}

function addNode(builder: GraphBuilder, node: GraphNode): void {
  const existing = builder.nodes.get(node.id)
  if (!existing) {
    builder.nodes.set(node.id, cleanNode(node))
    return
  }
  builder.nodes.set(node.id, cleanNode({
    ...existing,
    label: existing.label || node.label,
    data: compactData({ ...(existing.data ?? {}), ...(node.data ?? {}) }),
  }))
}

function addEdge(builder: GraphBuilder, type: GraphEdgeType, from: string, to: string, data?: Record<string, unknown>): void {
  const cleanedData = compactData(data ?? {})
  const edge: GraphEdge = {
    id: edgeId(type, from, to, cleanedData),
    type,
    from,
    to,
    ...(Object.keys(cleanedData).length > 0 ? { data: cleanedData } : {}),
  }
  builder.edges.set(edge.id, edge)
}

function normalizeGraph(builder: GraphBuilder): WorkspaceGraph {
  const nodes = [...builder.nodes.values()].sort((a, b) => a.id.localeCompare(b.id))
  return {
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    edges: [...builder.edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

function cleanNode(node: GraphNode): GraphNode {
  const data = compactData(node.data ?? {})
  return {
    id: node.id,
    type: node.type as GraphNodeType,
    ...(node.label ? { label: node.label } : {}),
    ...(Object.keys(data).length > 0 ? { data } : {}),
  }
}

function compactData(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    if (typeof value === "string" && value.trim() === "") continue
    if (Array.isArray(value) && value.length === 0) continue
    output[key] = value
  }
  return output
}

function sourceNodeId(value: string): string {
  return `source:${stablePathOrHash(value)}`
}

function extractionNodeId(value: string): string {
  return `extraction:${stablePathOrHash(value)}`
}

function findingNodeId(value: string): string {
  return `finding:${stablePathOrHash(value)}`
}

function claimNodeId(slideIndex: number, text: string): string {
  return `claim:${slideIndex}:${stableHash(normalizeText(text))}`
}

function slideNodeId(index: number): string {
  return `slide:${index}`
}

function artifactNodeId(outputPath: string): string {
  return `artifact:${stablePathOrHash(outputPath)}`
}

function edgeId(type: GraphEdgeType, from: string, to: string, data: Record<string, unknown>): string {
  return `edge:${type}:${stableHash(JSON.stringify({ from, to, data }))}`
}

function stablePathOrHash(value: string): string {
  const normalized = normalizePath(value)
  if (/^[a-z0-9._/-]+$/i.test(normalized) && normalized.length <= 80) return normalized
  return stableHash(normalized)
}

function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12)
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "")
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const text = String(value ?? "").trim()
  return text || undefined
}
