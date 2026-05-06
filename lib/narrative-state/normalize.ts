import type { DeckSpec, DecksState, EvidenceRef, SlideSpec } from "../decks-state"
import {
  stableClaimId,
  stableEvidenceId,
  stableNarrativeId,
  stableObjectionId,
  stableRiskId,
} from "./hash"
import type {
  AudienceIntent,
  DecisionIntent,
  NarrativeClaim,
  NarrativeClaimKind,
  NarrativeEvidenceBinding,
  NarrativeEvidenceStatus,
  NarrativeObjection,
  NarrativeRisk,
  NarrativeStateV1,
  NarrativeStatus,
  NarrativeThesis,
} from "./types"

const MIGRATED_UPDATED_AT = "1970-01-01T00:00:00.000Z"

export function normalizeCanonicalNarrativeState(input: Partial<NarrativeStateV1> | undefined, seed = "workspace"): NarrativeStateV1 | undefined {
  if (!input) return undefined
  const id = input.id?.trim() || stableNarrativeId(seed)
  const claims = dedupeById((input.claims ?? []).map(normalizeClaim).filter((claim): claim is NarrativeClaim => Boolean(claim)))
  const evidenceBindings = dedupeById((input.evidenceBindings ?? []).map((binding) => normalizeEvidenceBinding(binding, claims)).filter((binding): binding is NarrativeEvidenceBinding => Boolean(binding)))
  return {
    version: 1,
    id,
    status: normalizeStatus(input.status),
    audience: normalizeAudience(input.audience),
    decision: normalizeDecision(input.decision),
    thesis: normalizeThesis(input.thesis),
    claims: claims.map((claim) => ({ ...claim, evidenceStatus: evidenceStatusForClaim(claim, evidenceBindings) })),
    evidenceBindings,
    objections: dedupeById((input.objections ?? []).map(normalizeObjection).filter((objection): objection is NarrativeObjection => Boolean(objection))),
    risks: dedupeById((input.risks ?? []).map(normalizeRisk).filter((risk): risk is NarrativeRisk => Boolean(risk))),
    approvals: input.approvals ?? [],
    updatedAt: input.updatedAt || MIGRATED_UPDATED_AT,
  }
}

export function normalizeNarrativeState(state: DecksState): NarrativeStateV1 {
  const deck = activeDeck(state)
  const existing = normalizeCanonicalNarrativeState(state.narrative, deck?.slug ?? state.activeDeck ?? "workspace")
  if (existing && hasCanonicalNarrativeContent(existing)) return existing
  return migrateDeckNarrative(deck, state.activeDeck ?? "workspace")
}

function migrateDeckNarrative(deck: DeckSpec | undefined, seed: string): NarrativeStateV1 {
  const brief = deck?.narrativeBrief
  const id = stableNarrativeId(deck?.slug || seed)
  const claims = migrateClaims(deck)
  const evidenceBindings = migrateEvidenceBindings(deck, claims)
  const withEvidenceStatus = claims.map((claim) => ({ ...claim, evidenceStatus: evidenceStatusForClaim(claim, evidenceBindings) }))
  return {
    version: 1,
    id,
    status: "draft",
    audience: {
      primary: clean(deck?.audience),
      beliefBefore: clean(brief?.audienceBeliefBefore),
      beliefAfter: clean(brief?.audienceBeliefAfter),
    },
    decision: {
      action: clean(brief?.decisionOrAction),
      decisionType: inferDecisionType(brief?.decisionOrAction),
    },
    thesis: migrateThesis(deck),
    claims: withEvidenceStatus,
    evidenceBindings,
    objections: (brief?.objections ?? []).map((text) => ({ id: stableObjectionId(text), text, priority: "medium" as const })),
    risks: (brief?.risks ?? []).map((text) => ({ id: stableRiskId(text), text, severity: "medium" as const })),
    approvals: [],
    updatedAt: MIGRATED_UPDATED_AT,
  }
}

function migrateClaims(deck: DeckSpec | undefined): NarrativeClaim[] {
  const claims: NarrativeClaim[] = []
  for (const text of deck?.narrativeBrief?.keyClaims ?? []) {
    pushClaim(claims, {
      id: stableClaimId(text),
      kind: "recommendation",
      text,
      importance: "central",
      evidenceRequired: true,
      evidenceStatus: "missing",
    })
  }

  for (const slide of deck?.slides ?? []) {
    for (const item of slideClaimTexts(slide)) {
      pushClaim(claims, {
        id: stableClaimId(item.text),
        kind: claimKindFromSlide(slide),
        text: item.text,
        importance: item.origin === "title" || item.origin === "purpose" ? "background" : "supporting",
        evidenceRequired: isEvidenceRequiredText(item.text, slide),
        evidenceStatus: "missing",
      })
    }
  }
  return claims
}

function migrateEvidenceBindings(deck: DeckSpec | undefined, claims: NarrativeClaim[]): NarrativeEvidenceBinding[] {
  const bindings: NarrativeEvidenceBinding[] = []
  for (const slide of deck?.slides ?? []) {
    const slideClaims = slideClaimTexts(slide)
      .map((item) => claims.find((claim) => claim.text === item.text))
      .filter((claim): claim is NarrativeClaim => Boolean(claim))
    const targetClaims = slideClaims.length > 0 ? slideClaims : claims.filter((claim) => claim.importance === "central")
    for (const evidence of slide.evidence ?? []) {
      for (const claim of targetClaims) {
        const binding = evidenceToBinding(evidence, claim.id)
        if (binding) pushBinding(bindings, binding)
      }
    }
  }
  return bindings
}

function evidenceToBinding(evidence: EvidenceRef, claimId: string): NarrativeEvidenceBinding | undefined {
  const source = clean(evidence.source || evidence.sourcePath || evidence.findingsFile || evidence.url)
  if (!source) return undefined
  const seed = [source, evidence.sourcePath, evidence.findingsFile, evidence.quote, evidence.location, evidence.page, evidence.url, evidence.caveat].filter(Boolean).join("|")
  return {
    id: stableEvidenceId(claimId, seed),
    claimId,
    source,
    sourcePath: clean(evidence.sourcePath),
    findingsFile: clean(evidence.findingsFile),
    quote: clean(evidence.quote),
    location: clean(evidence.location || evidence.page),
    url: clean(evidence.url),
    caveat: clean(evidence.caveat),
    strength: evidence.quote || evidence.location || evidence.page || evidence.url || evidence.findingsFile || evidence.sourcePath ? "partial" : "weak",
  }
}

function slideClaimTexts(slide: SlideSpec): Array<{ origin: string; text: string }> {
  return [
    { origin: "title", text: clean(slide.title) },
    { origin: "purpose", text: clean(slide.purpose) },
    { origin: "headline", text: clean(slide.content?.headline) },
    ...(slide.content?.body ?? []).map((text) => ({ origin: "body", text: clean(text) })),
    ...(slide.content?.bullets ?? []).map((text) => ({ origin: "bullet", text: clean(text) })),
  ].filter((item) => item.text.length > 0)
}

function migrateThesis(deck: DeckSpec | undefined): NarrativeThesis | undefined {
  const statement = clean(deck?.narrativeBrief?.narrativeArc) || clean(deck?.goal)
  if (!statement) return undefined
  return { id: `thesis:${stableClaimId(statement).replace(/^claim:/, "")}`, statement, confidence: "medium" }
}

function normalizeAudience(input: Partial<AudienceIntent> | undefined): AudienceIntent {
  return {
    primary: clean(input?.primary),
    secondary: (input?.secondary ?? []).map(clean).filter(Boolean),
    beliefBefore: clean(input?.beliefBefore),
    beliefAfter: clean(input?.beliefAfter),
    decisionContext: clean(input?.decisionContext),
    successCriteria: (input?.successCriteria ?? []).map(clean).filter(Boolean),
  }
}

function normalizeDecision(input: Partial<DecisionIntent> | undefined): DecisionIntent {
  return {
    action: clean(input?.action),
    owner: clean(input?.owner),
    deadline: clean(input?.deadline),
    decisionType: input?.decisionType,
    consequenceOfNoDecision: clean(input?.consequenceOfNoDecision),
  }
}

function normalizeThesis(input: Partial<NarrativeThesis> | undefined): NarrativeThesis | undefined {
  const statement = clean(input?.statement)
  if (!statement) return undefined
  return {
    id: input?.id?.trim() || `thesis:${stableClaimId(statement).replace(/^claim:/, "")}`,
    statement,
    confidence: input?.confidence ?? "medium",
    caveat: clean(input?.caveat),
  }
}

function normalizeClaim(input: Partial<NarrativeClaim>): NarrativeClaim | undefined {
  const text = clean(input.text)
  if (!text) return undefined
  return {
    id: input.id?.trim() || stableClaimId(text),
    kind: input.kind ?? "evidence",
    text,
    importance: input.importance ?? "supporting",
    evidenceRequired: input.evidenceRequired ?? true,
    evidenceStatus: input.evidenceStatus ?? "missing",
    supportedScope: clean(input.supportedScope),
    unsupportedScope: clean(input.unsupportedScope),
    caveats: (input.caveats ?? []).map(clean).filter(Boolean),
  }
}

function normalizeEvidenceBinding(input: Partial<NarrativeEvidenceBinding>, claims: NarrativeClaim[]): NarrativeEvidenceBinding | undefined {
  const source = clean(input.source || input.sourcePath || input.findingsFile || input.url)
  const claimId = clean(input.claimId)
  if (!source || !claimId || !claims.some((claim) => claim.id === claimId)) return undefined
  const seed = [source, input.sourcePath, input.findingsFile, input.quote, input.location, input.url, input.caveat].filter(Boolean).join("|")
  return {
    id: input.id?.trim() || stableEvidenceId(claimId, seed),
    claimId,
    source,
    sourcePath: clean(input.sourcePath),
    findingsFile: clean(input.findingsFile),
    quote: clean(input.quote),
    location: clean(input.location),
    url: clean(input.url),
    caveat: clean(input.caveat),
    supportScope: clean(input.supportScope),
    unsupportedScope: clean(input.unsupportedScope),
    strength: input.strength ?? "weak",
  }
}

function normalizeObjection(input: Partial<NarrativeObjection>): NarrativeObjection | undefined {
  const text = clean(input.text)
  if (!text) return undefined
  return { id: input.id?.trim() || stableObjectionId(text), text, claimId: clean(input.claimId), priority: input.priority ?? "medium", response: clean(input.response) }
}

function normalizeRisk(input: Partial<NarrativeRisk>): NarrativeRisk | undefined {
  const text = clean(input.text)
  if (!text) return undefined
  return { id: input.id?.trim() || stableRiskId(text), text, claimId: clean(input.claimId), severity: input.severity ?? "medium", mitigation: clean(input.mitigation) }
}

function evidenceStatusForClaim(claim: NarrativeClaim, bindings: NarrativeEvidenceBinding[]): NarrativeEvidenceStatus {
  if (!claim.evidenceRequired) return "not_required"
  const claimBindings = bindings.filter((binding) => binding.claimId === claim.id)
  if (claimBindings.some((binding) => binding.strength === "strong")) return "supported"
  if (claimBindings.some((binding) => binding.strength === "partial")) return "partial"
  if (claimBindings.some((binding) => binding.strength === "weak")) return "weak"
  return "missing"
}

function claimKindFromSlide(slide: SlideSpec): NarrativeClaimKind {
  if (slide.narrativeRole === "recommendation") return "recommendation"
  if (slide.narrativeRole === "risk") return "risk"
  if (slide.narrativeRole === "ask") return "ask"
  if (slide.narrativeRole === "tension") return "problem"
  if (slide.narrativeRole === "context") return "context"
  return "evidence"
}

function isEvidenceRequiredText(text: string, slide: SlideSpec): boolean {
  if (slide.narrativeRole === "ask" || slide.narrativeRole === "close" || slide.narrativeRole === "appendix") return false
  return /\d|%|\$|market|growth|cagr|tam|risk|recommend|approve|should|must|increase|decrease|增长|市场|风险|建议|投资|批准/i.test(text)
}

function inferDecisionType(action: string | undefined): DecisionIntent["decisionType"] {
  const text = clean(action).toLowerCase()
  if (!text) return undefined
  if (/approve|批准/.test(text)) return "approve"
  if (/invest|投资/.test(text)) return "invest"
  if (/prioriti[sz]e|优先/.test(text)) return "prioritize"
  if (/align|共识/.test(text)) return "align"
  if (/choose|select|选择/.test(text)) return "choose"
  if (/understand|理解/.test(text)) return "understand"
  return "other"
}

function normalizeStatus(status: NarrativeStatus | undefined): NarrativeStatus {
  return status ?? "draft"
}

function activeDeck(state: DecksState): DeckSpec | undefined {
  if (state.activeDeck && state.decks[state.activeDeck]) return state.decks[state.activeDeck]
  const keys = Object.keys(state.decks ?? {})
  return keys.length === 1 ? state.decks[keys[0]] : undefined
}

function hasCanonicalNarrativeContent(narrative: NarrativeStateV1): boolean {
  return Boolean(narrative.audience.primary || narrative.audience.beliefBefore || narrative.audience.beliefAfter || narrative.decision.action || narrative.thesis || narrative.claims.length > 0)
}

function pushClaim(claims: NarrativeClaim[], claim: NarrativeClaim): void {
  if (claims.some((item) => item.text === claim.text)) return
  claims.push(claim)
}

function pushBinding(bindings: NarrativeEvidenceBinding[], binding: NarrativeEvidenceBinding): void {
  if (bindings.some((item) => item.id === binding.id)) return
  bindings.push(binding)
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

function clean(value: string | undefined): string {
  return value?.trim() ?? ""
}
