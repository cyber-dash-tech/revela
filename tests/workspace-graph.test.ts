import { describe, expect, it } from "bun:test"
import { createEmptyDecksState, upsertDeck, upsertSlides } from "../lib/decks-state"
import { projectWorkspaceGraph } from "../lib/workspace-state/graph"
import { recordArtifactRenderTarget } from "../lib/workspace-state/render-targets"

describe("workspace graph projection", () => {
  function stateWithGraphInputs() {
    let state = createEmptyDecksState()
    state.workspace.sourceMaterials = [
      {
        path: "sources/market.pdf",
        type: "pdf",
        size: 1234,
        fingerprint: "market-fingerprint",
        status: "extracted",
        extraction: {
          manifestPath: ".opencode/revela/doc-materials/market/manifest.json",
          textPath: ".opencode/revela/doc-materials/market/text.txt",
          cacheDir: ".opencode/revela/doc-materials/market",
        },
      },
      {
        path: "sources/candidate-only.pdf",
        type: "pdf",
        status: "discovered",
      },
    ]

    state = upsertDeck(state, {
      slug: "graph-demo",
      goal: "Recommend whether to approve expansion.",
      audience: "Investment committee",
      language: "en",
      outputPath: "decks/graph-demo.html",
      narrativeBrief: {
        audienceBeliefBefore: "The committee is unsure about demand.",
        audienceBeliefAfter: "The committee trusts phased expansion.",
        decisionOrAction: "Approve phased expansion.",
        narrativeArc: "context -> evidence -> risk -> ask",
        keyClaims: ["Demand supports phased expansion."],
        objections: ["The forecast may be too optimistic."],
        risks: ["Execution risk remains material."],
      },
      researchPlan: [{
        axis: "market-data",
        needed: true,
        status: "read",
        findingsFile: "researches/graph-demo/market-data.md",
        notes: "Market finding read by reviewer.",
      }],
    })

    state = upsertSlides(state, "graph-demo", [
      {
        index: 1,
        title: "Market Context",
        purpose: "Frame the demand case",
        narrativeRole: "context",
        layout: "two-col",
        components: ["card"],
        content: {
          headline: "Market demand grew 25% since 2024",
          body: ["Expansion should be phased around proven demand."],
          bullets: ["Demand evidence is directionally positive"],
        },
        evidence: [{
          source: "Market report",
          sourcePath: "sources/market.pdf",
          findingsFile: "researches/graph-demo/market-data.md",
          location: "page 4",
          quote: "Demand increased 25% from 2024 to 2025.",
          caveat: "Forecast excludes downside scenario.",
          extractedTextPath: ".opencode/revela/doc-materials/market/text.txt",
          extractedManifestPath: ".opencode/revela/doc-materials/market/manifest.json",
        }],
        status: "ready",
      },
      {
        index: 2,
        title: "Execution Risk",
        purpose: "Expose delivery risk",
        narrativeRole: "risk",
        layout: "two-col",
        components: ["card"],
        content: { headline: "Execution risk remains material", bullets: ["Hiring capacity is the main constraint"] },
        evidence: [{ source: "Operations interview notes" }],
        status: "ready",
      },
    ])

    return state
  }

  it("projects the same state into a stable graph", () => {
    const state = stateWithGraphInputs()

    expect(projectWorkspaceGraph(state)).toEqual(projectWorkspaceGraph(state))
  })

  it("projects source materials and extractions without treating candidate sources as proof", () => {
    const graph = projectWorkspaceGraph(stateWithGraphInputs())

    expect(graph.nodes["source:sources/market.pdf"]).toMatchObject({
      type: "source",
      data: { path: "sources/market.pdf", status: "extracted" },
    })
    expect(graph.nodes["source:sources/candidate-only.pdf"]).toMatchObject({ type: "source" })
    expect(graph.nodes["extraction:.opencode/revela/doc-materials/market/manifest.json"]).toMatchObject({ type: "extraction" })
    expect(graph.edges).toContainEqual(expect.objectContaining({
      type: "extracted_as",
      from: "source:sources/market.pdf",
      to: "extraction:.opencode/revela/doc-materials/market/manifest.json",
    }))

    const candidateSupportEdges = graph.edges.filter((edge) => edge.type === "supports" && edge.from === "source:sources/candidate-only.pdf")
    expect(candidateSupportEdges).toEqual([])
  })

  it("projects slides and stable claim nodes from recorded slide text", () => {
    const graph = projectWorkspaceGraph(stateWithGraphInputs())
    const claim = Object.values(graph.nodes).find((node) => node.type === "claim" && node.label === "Market demand grew 25% since 2024")

    expect(graph.nodes["slide:1"]).toMatchObject({ type: "slide", label: "Market Context" })
    expect(claim).toMatchObject({
      type: "claim",
      data: { slideIndex: 1, origin: "headline", text: "Market demand grew 25% since 2024" },
    })
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "contains", from: "slide:1", to: claim?.id }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "appears_in", from: claim?.id, to: "slide:1" }))
  })

  it("projects slide evidence as support edges with source trace preserved", () => {
    const graph = projectWorkspaceGraph(stateWithGraphInputs())
    const claim = Object.values(graph.nodes).find((node) => node.type === "claim" && node.label === "Market demand grew 25% since 2024")
    const support = graph.edges.find((edge) => edge.type === "supports" && edge.from === "finding:researches/graph-demo/market-data.md" && edge.to === claim?.id)

    expect(graph.nodes["finding:researches/graph-demo/market-data.md"]).toMatchObject({
      type: "finding",
      label: "researches/graph-demo/market-data.md",
    })
    expect(support).toMatchObject({
      data: {
        detailLevel: "detailed",
        source: "Market report",
        sourcePath: "sources/market.pdf",
        findingsFile: "researches/graph-demo/market-data.md",
        location: "page 4",
        quote: "Demand increased 25% from 2024 to 2025.",
        caveat: "Forecast excludes downside scenario.",
      },
    })
  })

  it("keeps source-only evidence visible as weak support", () => {
    const graph = projectWorkspaceGraph(stateWithGraphInputs())
    const claim = Object.values(graph.nodes).find((node) => node.type === "claim" && node.label === "Execution risk remains material")
    const source = Object.values(graph.nodes).find((node) => node.type === "source" && node.label === "Operations interview notes")
    const support = graph.edges.find((edge) => edge.type === "supports" && edge.from === source?.id && edge.to === claim?.id)

    expect(support).toMatchObject({ data: { detailLevel: "weak", source: "Operations interview notes" } })
  })

  it("projects narrative state and the active HTML deck artifact", () => {
    const graph = projectWorkspaceGraph(stateWithGraphInputs())
    const narrative = Object.values(graph.nodes).find((node) => node.type === "narrativeIntent")
    const objection = Object.values(graph.nodes).find((node) => node.type === "objection")
    const risk = Object.values(graph.nodes).find((node) => node.type === "risk")

    expect(narrative).toMatchObject({
      type: "narrativeIntent",
      data: { decisionOrAction: "Approve phased expansion." },
    })
    expect(objection).toMatchObject({ type: "objection", label: "The forecast may be too optimistic." })
    expect(risk).toMatchObject({ type: "risk", label: "Execution risk remains material." })
    expect(graph.nodes["artifact:decks/graph-demo.html"]).toMatchObject({
      type: "artifact",
      data: {
        renderTargetId: "target:html_deck:decks/graph-demo.html",
        type: "html_deck",
        outputPath: "decks/graph-demo.html",
      },
    })
    expect(graph.edges).toContainEqual(expect.objectContaining({
      type: "renders_from",
      from: "artifact:decks/graph-demo.html",
      to: "slide:1",
    }))
  })

  it("prefers canonical narrative claims, evidence, objections, and risks when available", () => {
    const state = stateWithGraphInputs()
    state.narrative = {
      version: 1,
      id: "narrative:canonical-demo",
      status: "ready_for_approval",
      audience: {
        primary: "Board",
        beliefBefore: "The board is unsure a pilot is safer.",
        beliefAfter: "The board sees pilot approval as the safer path.",
      },
      decision: { action: "Approve pilot expansion.", decisionType: "approve" },
      thesis: { id: "thesis:pilot", statement: "Pilot expansion bounds risk.", confidence: "medium" },
      claims: [{
        id: "claim:capacity-proof",
        kind: "evidence",
        text: "Capacity evidence supports pilot sequencing.",
        importance: "supporting",
        evidenceRequired: true,
        evidenceStatus: "partial",
      }, {
        id: "claim:pilot-risk",
        kind: "recommendation",
        text: "Pilot expansion lowers execution risk.",
        importance: "central",
        evidenceRequired: true,
        evidenceStatus: "partial",
        unsupportedScope: "Does not prove full rollout readiness.",
      }],
      claimRelations: [{
        id: "relation:capacity-pilot",
        fromClaimId: "claim:capacity-proof",
        toClaimId: "claim:pilot-risk",
        relation: "supports",
        rationale: "Capacity proof supports the recommendation.",
      }],
      evidenceBindings: [{
        id: "evidence:pilot-risk:ops",
        claimId: "claim:pilot-risk",
        source: "Operations findings",
        findingsFile: "researches/graph-demo/ops.md",
        quote: "Pilot scope fits current hiring capacity.",
        location: "section 2",
        strength: "partial",
        unsupportedScope: "Full rollout capacity remains unproven.",
      }],
      objections: [{ id: "objection:capacity", text: "Capacity may still be too thin.", claimId: "claim:pilot-risk", priority: "high" }],
      risks: [{ id: "risk:hiring", text: "Hiring capacity remains constrained.", claimId: "claim:pilot-risk", severity: "medium" }],
      researchGaps: [{
        id: "research-gap:pilot-capacity",
        targetType: "claim",
        targetId: "claim:pilot-risk",
        question: "Find evidence that pilot capacity is sufficient.",
        status: "attached",
        priority: "high",
        findingsFile: "researches/graph-demo/ops.md",
        evidenceBindingIds: ["evidence:pilot-risk:ops"],
        createdFromIssueType: "missing_evidence",
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z",
      }],
      approvals: [],
      updatedAt: "2026-05-06T00:00:00.000Z",
    }

    const graph = projectWorkspaceGraph(state)

    expect(graph.nodes["narrative:canonical-demo"]).toMatchObject({
      type: "narrativeIntent",
      data: { decisionOrAction: "Approve pilot expansion.", thesis: "Pilot expansion bounds risk." },
    })
    expect(graph.nodes["claim:pilot-risk"]).toMatchObject({
      type: "claim",
      label: "Pilot expansion lowers execution risk.",
      data: { source: "canonicalNarrative", unsupportedScope: "Does not prove full rollout readiness." },
    })
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "contains", from: "narrative:canonical-demo", to: "claim:pilot-risk" }))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      type: "supports",
      from: "claim:capacity-proof",
      to: "claim:pilot-risk",
      data: expect.objectContaining({ relationId: "relation:capacity-pilot", source: "canonicalNarrative" }),
    }))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      type: "supports",
      from: "finding:researches/graph-demo/ops.md",
      to: "claim:pilot-risk",
      data: expect.objectContaining({ strength: "partial", unsupportedScope: "Full rollout capacity remains unproven." }),
    }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "challenges", from: "objection:capacity", to: "claim:pilot-risk" }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "constrained_by", from: "claim:pilot-risk", to: "risk:hiring" }))
    expect(graph.nodes["research-gap:pilot-capacity"]).toMatchObject({ type: "researchGap", label: "Find evidence that pilot capacity is sufficient." })
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "contains", from: "narrative:canonical-demo", to: "research-gap:pilot-capacity" }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "derived_from", from: "research-gap:pilot-capacity", to: "claim:pilot-risk" }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "derived_from", from: "research-gap:pilot-capacity", to: "finding:researches/graph-demo/ops.md" }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ type: "renders_from", from: "artifact:decks/graph-demo.html", to: "narrative:canonical-demo" }))
  })

  it("projects exported render targets as artifacts derived from the HTML deck", () => {
    const state = stateWithGraphInputs()
    recordArtifactRenderTarget(state, {
      sourceHtmlPath: "decks/graph-demo.html",
      type: "pdf",
      outputPath: "decks/graph-demo.pdf",
    })

    const graph = projectWorkspaceGraph(state)

    expect(graph.nodes["artifact:decks/graph-demo.pdf"]).toMatchObject({
      type: "artifact",
      data: {
        renderTargetId: "target:pdf:decks/graph-demo.pdf",
        type: "pdf",
        outputPath: "decks/graph-demo.pdf",
      },
    })
    expect(graph.edges).toContainEqual(expect.objectContaining({
      type: "renders_from",
      from: "artifact:decks/graph-demo.pdf",
      to: "artifact:decks/graph-demo.html",
    }))
  })
})
