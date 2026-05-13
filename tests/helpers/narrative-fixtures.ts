import { confirmDeckPlan, createEmptyDecksState, reviewDeckState, upsertDeck, upsertSlides, type DecksState } from "../../lib/decks-state"
import { computeNarrativeHash } from "../../lib/narrative-state/hash"
import { normalizeNarrativeState } from "../../lib/narrative-state/normalize"
import { recordArtifactRenderTarget, renderTargetId, upsertRenderTarget } from "../../lib/workspace-state/render-targets"

export function legacyDecisionDeck(): DecksState {
  let state = createEmptyDecksState()
  state = upsertDeck(state, {
    slug: "narrative-demo",
    goal: "Recommend whether to approve phased expansion.",
    audience: "Investment committee",
    outputPath: "decks/narrative-demo.html",
    narrativeBrief: {
      audienceBeliefBefore: "The committee is unsure about demand.",
      audienceBeliefAfter: "The committee trusts phased expansion.",
      decisionOrAction: "Approve phased expansion.",
      narrativeArc: "Demand proof supports a phased approval with explicit execution risk.",
      keyClaims: ["Demand supports phased expansion."],
      objections: ["The forecast may be too optimistic."],
      risks: ["Execution risk remains material."],
    },
  })
  return upsertSlides(state, "narrative-demo", [{
    index: 1,
    title: "Demand Proof",
    purpose: "Show why phased expansion is credible",
    narrativeRole: "evidence",
    layout: "two-col",
    components: ["card"],
    content: {
      headline: "Demand supports phased expansion.",
      bullets: ["Market demand grew 25% since 2024"],
    },
    evidence: [{
      source: "Market report",
      findingsFile: "researches/narrative-demo/market.md",
      location: "page 4",
      quote: "Demand increased 25% from 2024 to 2025.",
    }],
    status: "ready",
  }])
}

export function confirmTestDeckPlan(state: DecksState): DecksState {
  return confirmDeckPlan(state, { approvedBy: "user", note: "Confirmed test deck plan.", now: "2026-01-01T00:00:00.000Z" }).state
}

export function readyDeckState(): DecksState {
  let state = createEmptyDecksState()
  state = upsertDeck(state, {
    slug: "test-two-page-deck",
    goal: "Create a two-slide test deck.",
    outputPath: "decks/test-two-page-deck.html",
    theme: { design: "aurora", domain: "general" },
    requiredInputs: {
      topicClarified: true,
      audienceClarified: true,
      languageDecided: true,
      visualStyleSelected: true,
      sourceMaterialsIdentified: true,
      researchNeedAssessed: true,
      researchFindingsRead: true,
      slidePlanConfirmed: true,
      designLayoutsFetched: true,
    },
    researchPlan: [{ axis: "none", needed: false, status: "skipped" }],
  })
  state = upsertSlides(state, "test-two-page-deck", [
    {
      index: 1,
      title: "封面",
      purpose: "Introduce the test deck",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: "测试演示文稿", body: ["验证生成流程"] },
      evidence: [{ source: "user request" }],
      status: "ready",
    },
    {
      index: 2,
      title: "要点",
      purpose: "Show validation targets",
      layout: "card-grid",
      components: ["card"],
      content: { headline: "验证目标", bullets: ["页面生成", "布局检查"] },
      evidence: [{ source: "user request" }],
      status: "ready",
    },
  ])
  return reviewDeckState(confirmTestDeckPlan(state), "test-two-page-deck").state
}

export function narrativeMapState(): DecksState {
  let state = createEmptyDecksState()
  state = upsertDeck(state, {
    slug: "map-demo",
    goal: "Approve a phased AI manufacturing pilot.",
    audience: "Board",
    outputPath: "decks/map-demo.html",
  })
  state.narrative = {
    version: 1,
    id: "narrative:map-demo",
    status: "ready_for_approval",
    audience: {
      primary: "Board",
      beliefBefore: "The board sees AI manufacturing as speculative.",
      beliefAfter: "The board sees a phased pilot as bounded and evidence-backed.",
    },
    decision: { action: "Approve the phased pilot.", decisionType: "approve" },
    thesis: { id: "thesis:pilot", statement: "A phased pilot captures upside while bounding execution risk.", confidence: "medium" },
    claims: [
      {
        id: "claim:supported",
        kind: "recommendation",
        text: "Phased pilot approval is the safer path.",
        importance: "central",
        evidenceRequired: true,
        evidenceStatus: "supported",
        supportedScope: "Pilot scope only.",
      },
      {
        id: "claim:partial",
        kind: "evidence",
        text: "Current line data supports initial automation gains.",
        importance: "supporting",
        evidenceRequired: true,
        evidenceStatus: "partial",
        unsupportedScope: "Does not prove lights-out manufacturing.",
      },
      {
        id: "claim:missing",
        kind: "opportunity",
        text: "Supplier ecosystem readiness is proven.",
        importance: "supporting",
        evidenceRequired: true,
        evidenceStatus: "missing",
      },
      {
        id: "claim:not-required",
        kind: "context",
        text: "The decision is about sequencing.",
        importance: "background",
        evidenceRequired: false,
        evidenceStatus: "not_required",
      },
    ],
    claimRelations: [
      { id: "relation:supported-partial", fromClaimId: "claim:supported", toClaimId: "claim:partial", relation: "supports", rationale: "Pilot recommendation depends on line evidence." },
      { id: "relation:partial-missing", fromClaimId: "claim:partial", toClaimId: "claim:missing", relation: "depends_on", rationale: "Supplier readiness remains the unresolved proof point." },
    ],
    evidenceBindings: [
      {
        id: "evidence:supported:ops",
        claimId: "claim:supported",
        source: "Operations study",
        findingsFile: "researches/map-demo/ops.md",
        quote: "Pilot scope fits current operating constraints.",
        location: "section 2",
        strength: "strong",
        supportScope: "Pilot scope only.",
      },
      {
        id: "evidence:partial:line",
        claimId: "claim:partial",
        source: "Line data",
        sourcePath: "sources/line-data.xlsx",
        quote: "Automation reduced manual interventions by 18%.",
        location: "Sheet1!B2",
        strength: "partial",
        unsupportedScope: "No supplier readiness proof.",
      },
    ],
    objections: [{ id: "objection:roi", text: "ROI may be too uncertain.", claimId: "claim:supported", priority: "high", response: "Stage gates cap exposure." }],
    risks: [{ id: "risk:supplier", text: "Supplier readiness may lag.", claimId: "claim:partial", severity: "medium", mitigation: "Gate supplier integration separately." }],
    researchGaps: [{
      id: "research-gap:supplier-readiness",
      targetType: "claim",
      targetId: "claim:missing",
      question: "Find supplier ecosystem readiness evidence.",
      status: "open",
      priority: "high",
      createdFromIssueType: "missing_evidence",
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }],
    approvals: [],
    updatedAt: "2026-05-07T00:00:00.000Z",
  }
  state.narrative = normalizeNarrativeState(state)
  const hash = computeNarrativeHash(state.narrative)
  state.narrative.approvals.push({
    id: "approval:map-demo",
    narrativeHash: hash,
    approvedAt: "2026-05-07T00:00:00.000Z",
    approvedBy: "user",
    scope: "narrative",
  })
  state = upsertSlides(state, "map-demo", [{
    index: 1,
    title: "Pilot Recommendation",
    purpose: "Show why the phased pilot is safer.",
    narrativeRole: "recommendation",
    layout: "two-col",
    components: ["card"],
    content: { headline: "Phased pilot approval is the safer path.", bullets: ["Current line data supports initial automation gains."] },
    evidence: [{ source: "Operations study", findingsFile: "researches/map-demo/ops.md", quote: "Pilot scope fits current operating constraints." }],
    status: "planned",
  }])
  recordArtifactRenderTarget(state, { sourceHtmlPath: "decks/map-demo.html", type: "pdf", outputPath: "decks/map-demo.pdf" })
  recordArtifactRenderTarget(state, { sourceHtmlPath: "decks/map-demo.html", type: "pptx", outputPath: "decks/map-demo.pptx" })
  return state
}

export function narrativeOnlyState(): DecksState {
  const state = createEmptyDecksState()
  state.narrative = narrativeMapState().narrative
  state.activeDeck = ""
  state.decks = {}
  state.renderTargets = []
  return state
}

export function resolvedState(): DecksState {
  const state = narrativeMapState()
  for (const claim of state.narrative!.claims) {
    if (claim.id === "claim:supported") claim.evidenceStatus = "supported"
    else {
      claim.evidenceRequired = false
      claim.evidenceStatus = "not_required"
    }
    delete claim.unsupportedScope
  }
  state.narrative!.researchGaps = []
  state.narrative = normalizeNarrativeState(state)
  const hash = computeNarrativeHash(state.narrative)
  state.narrative.approvals = [{
    id: "approval:resolved",
    narrativeHash: hash,
    approvedAt: "2026-05-07T00:00:00.000Z",
    approvedBy: "user",
    scope: "narrative",
  }]
  return state
}

export function staleApprovalState(): DecksState {
  const state = resolvedState()
  state.narrative!.claims[0].text = "Updated phased pilot approval is the safer path."
  return state
}

export function resolvedNarrativeOnlyState(): DecksState {
  const state = resolvedState()
  state.activeDeck = ""
  state.decks = {}
  state.renderTargets = []
  return state
}

export function currentHtmlWithStaleExportsState(): DecksState {
  let state = narrativeMapState()
  state = upsertSlides(state, "map-demo", [
    {
      index: 1,
      title: "Pilot Recommendation",
      purpose: "Show why the phased pilot is safer.",
      narrativeRole: "recommendation",
      layout: "two-col",
      components: ["box"],
      claimIds: ["claim:supported", "claim:partial"],
      content: { headline: "Phased pilot approval is the safer path.", bullets: ["Current line data supports initial automation gains."] },
      evidence: [{ source: "Operations study", findingsFile: "researches/map-demo/ops.md", quote: "Pilot scope fits current operating constraints." }],
      evidenceBindingIds: ["evidence:supported:ops", "evidence:partial:line"],
      status: "planned",
    },
    {
      index: 2,
      title: "Supplier Readiness",
      purpose: "Keep the remaining supplier proof explicit.",
      narrativeRole: "evidence",
      layout: "one-col",
      components: ["box"],
      claimIds: ["claim:missing"],
      content: { headline: "Supplier ecosystem readiness is proven." },
      evidence: [],
      status: "planned",
    },
  ])
  return withCurrentHtmlAndStaleExports(state)
}

export function resolvedCurrentHtmlWithStaleExportsState(): DecksState {
  return withCurrentHtmlAndStaleExports(resolvedState())
}

function withCurrentHtmlAndStaleExports(state: DecksState): DecksState {
  const hash = computeNarrativeHash(state.narrative!)
  state.renderTargets = []
  state = upsertRenderTarget(state, {
    id: renderTargetId("html_deck", "decks/map-demo.html"),
    type: "html_deck",
    outputPath: "decks/map-demo.html",
    sourceNodeIds: [state.narrative!.id],
    contractStatus: "valid",
    data: { narrativeHash: hash },
  })
  state = upsertRenderTarget(state, {
    id: renderTargetId("pdf", "decks/map-demo.pdf"),
    type: "pdf",
    outputPath: "decks/map-demo.pdf",
    sourceNodeIds: [],
    contractStatus: "valid",
    data: { sourceOutputPath: "decks/map-demo.html", narrativeHash: "old-hash" },
  })
  return upsertRenderTarget(state, {
    id: renderTargetId("pptx", "decks/map-demo.pptx"),
    type: "pptx",
    outputPath: "decks/map-demo.pptx",
    sourceNodeIds: [],
    contractStatus: "valid",
    data: { sourceOutputPath: "decks/map-demo.html", narrativeHash: "old-hash" },
  })
}
