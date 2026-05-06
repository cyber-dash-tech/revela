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
