import { describe, expect, it } from "bun:test"
import { join } from "path"
import { createEmptyDecksState, readDecksState, upsertDeck, upsertSlides, writeDecksState } from "../lib/decks-state"
import { recordRenderedArtifact } from "../lib/workspace-state/rendered-artifacts"
import { recordArtifactRenderTarget, resolveActiveHtmlDeckPath } from "../lib/workspace-state/render-targets"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("workspace render targets", () => {
  function stateWithDeck() {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "demo",
      goal: "Create a render target demo.",
      outputPath: "decks/demo.html",
    })
    state = upsertSlides(state, "demo", [
      {
        index: 1,
        title: "Intro",
        purpose: "Introduce the topic",
        layout: "cover",
        components: ["hero-title"],
        content: { headline: "Render Targets" },
        evidence: [{ source: "user request" }],
        status: "ready",
      },
      {
        index: 2,
        title: "Details",
        purpose: "Explain the model",
        layout: "two-col",
        components: ["card"],
        content: { headline: "HTML is the first render target" },
        evidence: [{ source: "user request" }],
        status: "ready",
      },
    ])
    return state
  }

  it("normalizes the active HTML deck into a render target", () => {
    const state = stateWithDeck()

    expect(resolveActiveHtmlDeckPath(state)).toBe("decks/demo.html")
    expect(state.renderTargets).toContainEqual(expect.objectContaining({
      id: "target:html_deck:decks/demo.html",
      type: "html_deck",
      outputPath: "decks/demo.html",
      sourceNodeIds: ["slide:1", "slide:2"],
      data: { slug: "demo", compatibilityOutputPath: "decks/demo.html" },
    }))
  })

  it("records exported artifacts as derived render targets", () => {
    const state = stateWithDeck()
    const target = recordArtifactRenderTarget(state, {
      sourceHtmlPath: "decks/demo.html",
      type: "pdf",
      outputPath: "decks/demo.pdf",
    })

    expect(target).toMatchObject({
      id: "target:pdf:decks/demo.pdf",
      type: "pdf",
      outputPath: "decks/demo.pdf",
      sourceNodeIds: ["artifact:decks/demo.html"],
      data: {
        sourceTargetId: "target:html_deck:decks/demo.html",
        sourceOutputPath: "decks/demo.html",
      },
    })
    expect(state.renderTargets).toContainEqual(expect.objectContaining({ id: "target:pdf:decks/demo.pdf" }))
  })

  it("does not attribute an explicit non-active HTML export to the active deck", () => {
    const state = stateWithDeck()
    const target = recordArtifactRenderTarget(state, {
      sourceHtmlPath: "decks/standalone.html",
      type: "pdf",
      outputPath: "decks/standalone.pdf",
    })

    expect(target).toMatchObject({
      id: "target:pdf:decks/standalone.pdf",
      sourceNodeIds: ["artifact:decks/standalone.html"],
      data: {
        sourceTargetId: "target:html_deck:decks/standalone.html",
        sourceOutputPath: "decks/standalone.html",
      },
    })
  })

  it("records artifact render provenance in DECKS.json", () => {
    const root = tempWorkspace("revela-render-targets-")
    writeDecksState(root, stateWithDeck())

    recordRenderedArtifact(root, {
      sourceHtmlPath: "decks/demo.html",
      outputPath: join(root, "decks", "demo.pptx"),
      type: "pptx",
      actor: "revela-pptx",
    })

    const state = readDecksState(root)
    expect(state.renderTargets).toContainEqual(expect.objectContaining({
      id: "target:pptx:decks/demo.pptx",
      type: "pptx",
      sourceNodeIds: ["artifact:decks/demo.html"],
    }))
    expect(state.actions).toContainEqual(expect.objectContaining({
      type: "artifact.rendered",
      actor: "revela-pptx",
      inputs: { sourceHtmlPath: "decks/demo.html", type: "pptx" },
      outputs: { outputPath: "decks/demo.pptx", targetId: "target:pptx:decks/demo.pptx" },
      nodeIds: ["target:pptx:decks/demo.pptx"],
    }))
  })
})
