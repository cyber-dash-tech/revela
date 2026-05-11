import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, upsertDeck, upsertSlides, workspaceDeckSlug, writeDecksState } from "../lib/decks-state"
import { clearInspectRequestsForTests, getInspectRequest } from "../lib/inspect/requests"
import { handleEdit } from "../lib/commands/edit"
import { handleInspect } from "../lib/commands/inspect"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { ensureRefineDeckOpenForChange, openRefineDeck } from "../lib/refine/open"
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
    expect(html).toContain("Select refs, describe the change, then send.")
    expect(html).toContain("background: linear-gradient(180deg, #fbfaf7 0%, #f2eee6 100%)")
    expect(html).toContain("border-left: 1px solid #d8d2c6")
    expect(html).toContain("background: linear-gradient(135deg, #111827 0%, #1f2937 100%)")
    expect(html).toContain("border-color: #a9793f")
    expect(html).toContain("rgba(169,121,63,.14)")
    expect(html).not.toContain("#2563eb")
    expect(html).not.toContain("37,99,235")
    expect(html).not.toContain("#1d4ed8")
    expect(html).not.toContain("#4338ca")
    expect(html).toContain("id=\"editTab\"")
    expect(html).toContain("id=\"inspectTab\"")
    expect(html).not.toContain("id=\"assetsTab\"")
    expect(html).not.toContain("id=\"assetsPanel\"")
    expect(html).toContain("Search Assets")
    expect(html).toContain("aria-label=\"Edit assets\"")
    expect(html).toContain("<div class=\"label\">Local Assets</div>")
    expect(html).toContain("id=\"editSavedAssets\"")
    expect(html).not.toContain("id=\"librarySavedAssets\"")
    expect(html).toContain("id=\"assetSearchToggle\"")
    expect(html).toContain("aria-controls=\"assetSearchView\"")
    expect(html).toContain("id=\"assetSearchView\"")
    expect(html).toContain("class=\"asset-search-view\"")
    expect(html).toContain("id=\"assetSearchBack\"")
    expect(html).toContain("← Back")
    expect(html).toContain("Save images to Local Assets, then use them from Edit.")
    expect(html).toContain("toggleAssetSearchPanel")
    expect(html).toContain("closeAssetSearchPanel")
    expect(html).toContain("setAssetSearchOpen")
    expect(html).toContain("<option value=\"logo\" selected>logo</option>")
    expect(html).toContain("<option value=\"illustration\">photo</option>")
    expect(html).toContain("Search image candidates, then save one to the workspace.")
    expect(html).toContain("No local assets yet. Click + to search assets.")
    expect(html).toContain("id=\"assetShuffleButton\"")
    expect(html).toContain("Refresh")
    expect(html).toContain("searchAssets(true)")
    expect(html).toContain("assetSearchPage")
    expect(html).toContain("No displayable images found. Try Refresh or another purpose.")
    expect(html).toContain("No assets found. Try another query or purpose.")
    expect(html).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))")
    expect(html).toContain(".asset-card.saved { width: 64px; height: 64px")
    expect(html).toContain(".edit-assets .asset-grid { grid-template-columns: repeat(auto-fill, 64px)")
    expect(html).toContain(".edit-assets .asset-thumb { width: 64px; height: 64px; }")
    expect(html).toContain("card.className = saved ? 'asset-card saved' : 'asset-card'")
    expect(html).toContain("Save to workspace")
    expect(html).toContain("asset-save")
    expect(html).not.toContain("asset-add")
    expect(html).not.toContain("Add to comment")
    expect(html).toContain("addAssetToComment")
    expect(html).toContain("selectedAsset")
    expect(html).toContain("asset-ref-chip")
    expect(html).toContain("assetDropOutline")
    expect(html).toContain("renderAssetDropTarget")
    expect(html).toContain("insert-into")
    expect(html).toContain("Insert into this element")
    expect(html).toContain("limit: '24'")
    expect(html).toContain("page: String(state.assetSearchPage)")
    expect(html).toContain("/api/assets/search")
    expect(html).toContain("/api/assets/save")
    expect(html).toContain("/api/assets/list")
    expect(html).toContain("sendAssetPlacement")
    expect(html).toContain("Apply Fix")
    expect(html).toContain("class=\"primary-action\"")
    expect(html).toContain("class=\"send-icon\"")
    expect(html).toContain("M14.7 6.3a1 1 0 0 0 0 1.4")
    expect(html).toContain("Activity")
    expect(html).toContain("id=\"selectionSummary\" class=\"selection-summary sr-only\"")
    expect(html.indexOf("id=\"send\"")).toBeLessThan(html.indexOf("id=\"commentThread\""))
    expect(html).toContain("Inspect Reference")
    expect(html).not.toContain("id=\"inspectRefSummary\"")
    expect(html).not.toContain("id=\"inspectQuestion\"")
    expect(html).toContain("id=\"inspectComment\"")
    expect(html).toContain("class=\"comment-editor\" contenteditable=\"true\"")
    expect(html).toContain("Inspect comment")
    expect(html).toContain("Cmd/Ctrl-click slide elements to add @refs, then ask about purpose or source.")
    expect(html).toContain("Select a deck element to create an @ref, optionally ask a question, then Inspect.")
    expect(html).toContain("state.sendingEdit")
    expect(html).toContain("assetSavingIndex")
    expect(html).toContain("Saving to workspace")
    expect(html).toContain("setButtonLoading")
    expect(html).toContain("renderInspectLoading")
    expect(html).toContain("const comment = getInspectComment()")
    expect(html).toContain("syncReferencesFromComment(false, els.inspectComment)")
    expect(html).toContain("getCommentText(els.inspectComment)")
    expect(html).toContain("language: state.inspectLanguage, comment")
    expect(html).toContain("Inspecting...")
    expect(html).toContain("Searching...")
    expect(html).toContain("Sending...")
    expect(html).toContain("class=\"spinner\"")
    expect(html).toContain("skeleton-card")
    expect(html).toContain("/api/comment")
    expect(html).toContain("/api/inspect")
    expect(html).toContain("/api/inspect-result")
    expect(html).toContain("Generated")
    expect(html).toContain("Reading selection...")
    expect(html).toContain("Deterministic fallback")
    expect(html).toContain("id=\"inspectLanguage\"")
    expect(html).toContain("id=\"deckPrev\"")
    expect(html).toContain("id=\"deckNext\"")
    expect(html).toContain("id=\"deckCounter\"")
    expect(html).toContain("aria-label=\"Deck navigation\"")
    expect(html).toContain("goToDeckSlide")
    expect(html).toContain("applyFallbackDeckNavigation")
    expect(html).toContain("win.RevelaDeckNav")
    expect(html).toContain("ArrowRight")
    expect(html).toContain("PageDown")
    expect(html).toContain("简体中文")
    expect(html).toContain("Português")
    expect(html).toContain("language: state.inspectLanguage")
    expect(html).toContain("collectReferenceSnapshot")
    expect(html).toContain("Purpose")
    expect(html).toContain("Source")
    expect(html).toContain("renderPurpose")
    expect(html).toContain("renderSource")
    expect(html).toContain("Cmd/Ctrl-click slide elements to add @refs")
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
  it("does not open UI from removed /revela edit", async () => {
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

    expect(messages[0]).toContain("`/revela edit` has been removed")
    expect(messages[0]).toContain("/revela refine --deck")
    expect(messages[0]).not.toContain("/refine?token=")
  })

  it("does not open UI from removed /revela inspect", async () => {
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

    expect(messages[0]).toContain("`/revela inspect` is no longer a public command")
    expect(messages[0]).toContain("/revela refine --deck")
    expect(messages[0]).not.toContain("/refine?token=")
  })
})

describe("ensureRefineDeckOpenForChange", () => {
  it("opens Refine after a deck change but skips reopening a live session", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const opened: string[] = []
    const client = { session: { prompt: async () => undefined } }

    const first = ensureRefineDeckOpenForChange("", {
      client,
      sessionID: "session-1",
      workspaceRoot: root,
      openUrl: (url) => opened.push(url),
    })

    const second = ensureRefineDeckOpenForChange("", {
      client,
      sessionID: "session-1",
      workspaceRoot: root,
      openUrl: (url) => opened.push(url),
    })

    expect(first.url).toContain("/refine?token=")
    expect(first.openedBrowser).toBe(true)
    expect(second.url).toBe(first.url)
    expect(second.reusedSession).toBe(true)
    expect(second.liveSession).toBe(true)
    expect(second.openedBrowser).toBe(false)
    expect(second.skippedReason).toBe("live-session")
    expect(opened).toHaveLength(1)
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
      body: JSON.stringify({ snapshot: { slideIndex: 1, text: "Conversion improved 18%", tagName: "H2", classList: [] }, language: "简体中文" }),
    }), 100)
    const data = await response.json() as any

    expect(promptCalled).toBe(true)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("pending")
    expect(data.language).toBe("简体中文")
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
    expect(data.preprocess.cards.exploratory).toMatchObject({
      status: "available",
      official: false,
      audience: "Executive team",
      claimFocus: "Conversion improved 18%",
    })
    expect(getInspectRequest(data.requestId)?.status).toBe("pending")
  })
})

describe("refine asset APIs", () => {
  it("rejects failed remote asset downloads instead of reporting saved", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><h1>Launch</h1></section>', "utf-8")
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo, init?: RequestInit) => {
        const value = String(url)
        if (value.includes("/api/assets/save")) return originalFetch(url, init)
        return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    try {
      const opened = openRefineDeck("", {
        client: { session: { prompt: async () => undefined } },
        sessionID: "session-asset-save-failure",
        workspaceRoot: root,
        openBrowser: false,
      })
      const url = new URL(opened.url)
      url.pathname = "/api/assets/save"
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate: {
            candidateId: "simple-icons-claude",
            provider: "simple-icons",
            title: "claude logo",
            thumbnailUrl: "https://cdn.simpleicons.org/claude",
            imageUrl: "https://cdn.simpleicons.org/claude",
            purpose: "logo",
          },
          purpose: "logo",
        }),
      })
      const data = await response.json() as any

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("Failed to save asset: cannot-download")
      expect(existsSync(join(root, "assets", workspaceDeckSlug(root), "media", "simple-icons-claude.svg"))).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("lists saved workspace assets with preview and deck-relative paths", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><h1>Launch</h1></section>', "utf-8")
    mkdirSync(join(root, "assets", workspaceDeckSlug(root), "media"), { recursive: true })
    writeFileSync(join(root, "assets", workspaceDeckSlug(root), "media", "acme-logo.png"), new Uint8Array([1, 2, 3]))
    writeFileSync(join(root, "assets", workspaceDeckSlug(root), "media-manifest.json"), JSON.stringify({
      topic: workspaceDeckSlug(root),
      updatedAt: "2026-01-01T00:00:00.000Z",
      assets: [{
        id: "acme-logo",
        type: "image",
        purpose: "logo",
        brief: "Logo",
        status: "success",
        path: `assets/${workspaceDeckSlug(root)}/media/acme-logo.png`,
        provider: "clearbit-logo",
        sourcePageUrl: "https://acme.com",
        alt: "Acme logo",
        savedAt: "2026-01-01T00:00:00.000Z",
      }],
    }), "utf-8")

    const opened = openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })
    const url = new URL(opened.url)
    url.pathname = "/api/assets/list"
    const response = await fetch(url)
    const data = await response.json() as any

    expect(data.ok).toBe(true)
    expect(data.assets).toHaveLength(1)
    expect(data.assets[0]).toMatchObject({
      id: "acme-logo",
      purpose: "logo",
      provider: "clearbit-logo",
      deckPath: `../assets/${workspaceDeckSlug(root)}/media/acme-logo.png`,
    })
    expect(data.assets[0].previewUrl).toContain("/__revela_asset?token=")
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
