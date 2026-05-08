import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, upsertDeck, upsertSlides, workspaceDeckSlug, writeDecksState } from "../lib/decks-state"
import { clearInspectRequestsForTests, getInspectRequest } from "../lib/inspect/requests"
import { handleEdit } from "../lib/commands/edit"
import { handleInspect } from "../lib/commands/inspect"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { openRefineDeck } from "../lib/refine/open"
import { renderRefineShell, stopRefineServer } from "../lib/refine/server"

const roots: string[] = []

afterEach(() => {
  clearInspectRequestsForTests()
  stopRefineServer()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "revela-refine-test-"))
  roots.push(root)
  mkdirSync(join(root, "decks"), { recursive: true })
  return root
}

describe("renderRefineShell", () => {
  it("combines edit comments and narrative reading inspect cards behind tabs", () => {
    const html = renderRefineShell("test-token")

    expect(html).toContain("Revela Refine")
    expect(html).toContain("id=\"editTab\"")
    expect(html).toContain("id=\"inspectTab\"")
    expect(html).toContain("Send Edit")
    expect(html).toContain("Inspect Selection")
    expect(html).toContain("/api/comment")
    expect(html).toContain("/api/inspect")
    expect(html).toContain("/api/inspect-result")
    expect(html).toContain("Preprocessed")
    expect(html).toContain("Generated")
    expect(html).toContain("collectReferenceSnapshot")
    expect(html).toContain("Narrative Reading, Source, and Purpose")
    expect(html).toContain("renderReading")
    expect(html).toContain("Artifact Coverage")
    expect(html).toContain("Cmd/Ctrl-click slide elements once")
    expect(html).not.toContain("Ask anything")
  })

  it("can default to the Inspect tab", () => {
    const html = renderRefineShell("test-token", "inspect")

    expect(html).toContain("const defaultMode = \"inspect\"")
    expect(html).toContain("state.mode = mode === 'inspect' ? 'inspect' : 'edit'")
  })
})

describe("openRefineDeck", () => {
  it("opens a refine session for the only HTML deck without launching a browser when disabled", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Market Map</h2></section></body></html>", "utf-8")

    const result = openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })

    expect(result.mode).toBe("edit")
    expect(result.deck.slug).toBe(workspaceDeckSlug(root))
    expect(result.deck.file).toBe("decks/market-map.html")
    expect(result.url).toStartWith("http://127.0.0.1:")
    expect(result.url).toContain("/refine?token=")
    expect(result.openedBrowser).toBe(false)
  })

  it("opens the active render target instead of requiring a single fallback deck", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "active.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Active</h2></section></body></html>", "utf-8")
    writeFileSync(join(root, "decks", "other.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Other</h2></section></body></html>", "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, { slug, goal: "Refine active", outputPath: "decks/active.html" })
    state = upsertSlides(state, slug, [{
      index: 1,
      title: "Active",
      purpose: "Use active render target",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: "Active" },
      evidence: [{ source: "user request" }],
      status: "ready",
    }])
    writeDecksState(root, state)

    const result = openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })

    expect(result.deck.file).toBe("decks/active.html")
    expect(result.deck.source).toBe("render-target")
  })

  it("refuses to open the active deck when slide identity does not match DECKS.json", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "active.html"), "<html><body><section class=\"slide\"><h2>Active</h2></section></body></html>", "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, { slug, goal: "Refine active", outputPath: "decks/active.html" })
    state = upsertSlides(state, slug, [{
      index: 1,
      title: "Active",
      purpose: "Use active render target",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: "Active" },
      evidence: [{ source: "user request" }],
      status: "ready",
    }])
    writeDecksState(root, state)

    expect(() => openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })).toThrow("Deck HTML contract validation failed")
  })
})

describe("deprecated refine command shims", () => {
  it("opens Refine Edit mode from /revela edit", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const messages: string[] = []

    await handleEdit({
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    }, async (message) => {
      messages.push(message)
    })

    expect(messages[0]).toContain("`/revela edit` is deprecated")
    expect(messages[0]).toContain("`/revela refine` in Edit mode")
    expect(messages[0]).toContain("/refine?token=")
  })

  it("opens Refine Inspect mode from /revela inspect", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const messages: string[] = []

    await handleInspect({
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    }, async (message) => {
      messages.push(message)
    })

    expect(messages[0]).toContain("`/revela inspect` is deprecated")
    expect(messages[0]).toContain("`/revela refine` in Inspect mode")
    expect(messages[0]).toContain("/refine?token=")
  })
})

describe("refine HTTP inspect lifecycle", () => {
  it("returns deterministic preprocess before the generated inspection completes", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><h1>Launch</h1><h2>Conversion improved 18%</h2></section>', "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug,
      goal: "Approve launch",
      audience: "Executive team",
      outputPath: "decks/demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:demo",
      status: "approved",
      audience: { primary: "Executive team", beliefBefore: "Unsure", beliefAfter: "Ready to approve" },
      decision: { action: "Approve launch" },
      claims: [{
        id: "claim:conversion",
        kind: "evidence",
        text: "Conversion improved 18%",
        importance: "central",
        evidenceRequired: true,
        evidenceStatus: "supported",
      }],
      evidenceBindings: [{
        id: "evidence:conversion",
        claimId: "claim:conversion",
        source: "Pilot dashboard",
        sourcePath: "sources/pilot.csv",
        quote: "Conversion improved 18%",
        strength: "strong",
      }],
      objections: [],
      risks: [],
      approvals: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    state = upsertSlides(state, slug, [{
      index: 1,
      title: "Launch",
      purpose: "Show evidence for launch approval",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      claimRefs: [{ claimId: "claim:conversion", role: "primary" }],
      evidenceBindingIds: ["evidence:conversion"],
      content: { headline: "Conversion improved 18%" },
      evidence: [{ source: "Pilot dashboard", sourcePath: "sources/pilot.csv", quote: "Conversion improved 18%" }],
      status: "ready",
    }])
    state.renderTargets = [{
      id: "target:html_deck:decks/demo.html",
      type: "html_deck",
      outputPath: "decks/demo.html",
      sourceNodeIds: ["narrative:demo", "claim:conversion"],
      artifactVersion: computeNarrativeHash(state.narrative!),
      contractStatus: "valid",
      data: { narrativeHash: computeNarrativeHash(state.narrative!) },
    }]
    writeDecksState(root, state)

    let promptCalled = false
    const client = {
      session: {
        prompt: () => {
          promptCalled = true
          return new Promise(() => {})
        },
      },
    }
    const opened = openRefineDeck("", { client, sessionID: "session-1", workspaceRoot: root, openBrowser: false })
    const url = new URL(opened.url)
    url.pathname = "/api/inspect"

    const response = await withTimeout(fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { slideIndex: 1, text: "Conversion improved 18%", tagName: "H2", classList: [] } }),
    }), 100)
    const data = await response.json() as any

    expect(promptCalled).toBe(true)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("pending")
    expect(data.preprocess.cards.purpose.status).toBe("clear")
    expect(data.preprocess.cards.source.status).toBe("supported")
    expect(data.preprocess.cards.reading.status).toBe("matched")
    expect(data.preprocess.cards.reading.claimText).toBe("Conversion improved 18%")
    expect(data.preprocess.cards.reading.artifactCoverage).toContainEqual(expect.objectContaining({
      type: "html_deck",
      outputPath: "decks/demo.html",
      coverageStatus: "current",
      containsClaim: true,
    }))
    expect(getInspectRequest(data.requestId)?.status).toBe("pending")
  })
})

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: Timer | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out waiting for refine response")), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
