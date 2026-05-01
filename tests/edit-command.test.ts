import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { readDecksState, workspaceDeckSlug } from "../lib/decks-state"
import { ensureEditableDeckState } from "../lib/edit/deck-state"
import { resolveEditableDeck } from "../lib/edit/resolve-deck"
import { buildEditPrompt } from "../lib/edit/prompt"
import { ensureEditableDeckOpenForChange, openEditableDeck } from "../lib/edit/open"
import { LIVE_EDITOR_IDLE_MS, renderEditorShell, stopEditServer } from "../lib/edit/server"
import createEditTool from "../tools/edit"

const roots: string[] = []

afterEach(() => {
  stopEditServer()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "revela-edit-test-"))
  roots.push(root)
  mkdirSync(join(root, "decks"), { recursive: true })
  return root
}

describe("resolveEditableDeck", () => {
  it("resolves the only HTML deck in decks/", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "only-deck.html"), "<html></html>", "utf-8")

    const deck = resolveEditableDeck(root, "   ")

    expect(deck).toMatchObject({
      slug: workspaceDeckSlug(root),
      file: "decks/only-deck.html",
      source: "file-path",
    })
  })

  it("rejects targets", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "only-deck.html"), "<html></html>", "utf-8")

    expect(() => resolveEditableDeck(root, "only-deck")).toThrow("no longer accepts a target")
  })

  it("rejects when decks/ has no HTML files", () => {
    const root = workspace()

    expect(() => resolveEditableDeck(root, "")).toThrow("No deck HTML found in decks/")
  })

  it("rejects when decks/ has multiple HTML files", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "first.html"), "<html></html>", "utf-8")
    writeFileSync(join(root, "decks", "second.html"), "<html></html>", "utf-8")

    expect(() => resolveEditableDeck(root, "")).toThrow("multiple deck HTML files")
  })
})

describe("buildEditPrompt", () => {
  it("includes edit target details and safety workflow", () => {
    const prompt = buildEditPrompt({
      deck: "sales-kickoff",
      file: "decks/sales-kickoff.html",
      slideIndex: 2,
      slideTitle: "Growth Model",
      selector: "section.slide:nth-of-type(2) > .card",
      text: "Current text",
      outerHTMLExcerpt: "<div class=\"card\">Current text</div>",
      comment: "Make this card less empty and align it with the right card.",
    })

    expect(prompt).toContain("sales-kickoff")
    expect(prompt).toContain("decks/sales-kickoff.html")
    expect(prompt).toContain("slideIndex")
    expect(prompt).toContain("section.slide:nth-of-type(2) > .card")
    expect(prompt).toContain("Make this card less empty")
    expect(prompt).toContain("revela-decks")
    expect(prompt).toContain("review")
    expect(prompt).toContain("initialize/upsert")
    expect(prompt).toContain("Static design compliance is checked automatically")
    expect(prompt).toContain("Do not run QA after the edit")
    expect(prompt).toContain("PDF/PPTX export commands run hard-error pre-export QA automatically")
  })

  it("supports multiple comments with multiple selected elements", () => {
    const prompt = buildEditPrompt({
      deck: "sales-kickoff",
      file: "decks/sales-kickoff.html",
      comment: "",
      comments: [
        {
          comment: "Align these two cards.",
          elements: [
            { slideIndex: 1, tagName: "div", text: "Card A", selector: ".card-a" },
            { slideIndex: 1, tagName: "div", text: "Card B", selector: ".card-b" },
          ],
        },
        {
          comment: "Shorten this heading.",
          elements: [{ slideIndex: 2, tagName: "h2", text: "Long heading" }],
        },
      ],
    })

    expect(prompt).toContain("Align these two cards")
    expect(prompt).toContain("Shorten this heading")
    expect(prompt).toContain("Card A")
    expect(prompt).toContain("Card B")
    expect(prompt).toContain("multiple comments")
    expect(prompt).toContain("one or more selected elements")
  })

  it("supports one comment with referenced elements", () => {
    const prompt = buildEditPrompt({
      deck: "sales-kickoff",
      file: "decks/sales-kickoff.html",
      comment: "Align @Metric 1 with @Metric 2.",
      elements: [
        { slideIndex: 1, tagName: "div", text: "27% EBIT Margin", selector: ".metric-a" },
        { slideIndex: 1, tagName: "div", text: "14% Revenue Growth", selector: ".metric-b" },
      ],
    })

    expect(prompt).toContain("Align @Metric 1 with @Metric 2")
    expect(prompt).toContain("27% EBIT Margin")
    expect(prompt).toContain("14% Revenue Growth")
    expect(prompt).toContain(".metric-a")
    expect(prompt).toContain(".metric-b")
  })
})

describe("ensureEditableDeckState", () => {
  it("creates ready deck state for the only HTML deck", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), `
      <html><body>
        <section class="slide" slide-qa="true"><h2>Market Map</h2><p>Existing content.</p></section>
      </body></html>
    `, "utf-8")
    const deck = resolveEditableDeck(root, "")

    const result = ensureEditableDeckState(root, deck)
    const state = readDecksState(root)

    expect(result.readiness.ready).toBe(true)
    const slug = workspaceDeckSlug(root)
    expect(state.activeDeck).toBe(slug)
    expect(state.decks[slug].outputPath).toBe("decks/market-map.html")
    expect(state.decks[slug].slides).toHaveLength(1)
    expect(state.decks[slug].slides[0].title).toBe("Market Map")
    expect(state.decks[slug].writeReadiness.status).toBe("ready")
  })
})

describe("openEditableDeck", () => {
  it("opens an edit session without launching a browser when disabled", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\"><h2>Market Map</h2></section></body></html>", "utf-8")

    const result = openEditableDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })

    expect(result.deck.slug).toBe(workspaceDeckSlug(root))
    expect(result.deck.file).toBe("decks/market-map.html")
    expect(result.url).toStartWith("http://127.0.0.1:")
    expect(readDecksState(root).decks[workspaceDeckSlug(root)].writeReadiness.status).toBe("ready")
  })

  it("reuses one editor session for repeated active opens of the same deck", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const opened: string[] = []
    const options = {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openUrl: (url: string) => opened.push(url),
    }

    const first = openEditableDeck("", options)
    const second = openEditableDeck("", options)

    expect(first.url).toBe(second.url)
    expect(first.reusedSession).toBe(false)
    expect(second.reusedSession).toBe(true)
    expect(opened).toEqual([first.url, first.url])
  })

  it("does not open another browser tab when an automatic ensure sees a live deck session", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const opened: string[] = []
    const options = {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openUrl: (url: string) => opened.push(url),
    }

    const first = ensureEditableDeckOpenForChange("", options)
    const second = ensureEditableDeckOpenForChange("", options)

    expect(first.openedBrowser).toBe(true)
    expect(second.openedBrowser).toBe(false)
    expect(second.skippedReason).toBe("live-session")
    expect(second.url).toBe(first.url)
    expect(opened).toEqual([first.url])
  })

  it("reopens the same editor URL when the deck session heartbeat is stale", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const opened: string[] = []
    const originalNow = Date.now
    let now = 1_000_000
    Date.now = () => now

    try {
      const options = {
        client: { session: { prompt: async () => undefined } },
        sessionID: "session-1",
        workspaceRoot: root,
        openUrl: (url: string) => opened.push(url),
      }

      const first = ensureEditableDeckOpenForChange("", options)
      now += LIVE_EDITOR_IDLE_MS + 1
      const second = ensureEditableDeckOpenForChange("", options)

      expect(second.url).toBe(first.url)
      expect(second.reusedSession).toBe(true)
      expect(second.liveSession).toBe(false)
      expect(second.openedBrowser).toBe(true)
      expect(opened).toEqual([first.url, first.url])
    } finally {
      Date.now = originalNow
    }
  })
})

describe("renderEditorShell", () => {
  it("uses non-final edit status wording and automatic refresh guidance", () => {
    const html = renderEditorShell("test-token")

    expect(html).toContain("color-scheme: light")
    expect(html).toContain("REVELA")
    expect(html).toContain("Garamond")
    expect(html).toContain("Refine your deck with precise visual comments")
    expect(html).toContain("Cmd/Ctrl-click to ref")
    expect(html).toContain("REFERENCE_COLORS")
    expect(html).toContain("--ref-bg")
    expect(html).toContain("setOutlineColor")
    expect(html).toContain("resize-handle")
    expect(html).toContain("--editor-width")
    expect(html).toContain("right: calc(var(--editor-width) - 7px)")
    expect(html).not.toContain("minmax(0, 1fr) 14px var(--editor-width)")
    expect(html).toContain("revela-edit-editor-width")
    expect(html).toContain("MIN_EDITOR_WIDTH = 320")
    expect(html).toContain("MAX_EDITOR_WIDTH = 620")
    expect(html).toContain("cursor: col-resize")
    expect(html).toContain("Double-click to reset")
    expect(html).toContain("Deck file updated")
    expect(html).toContain("preview will refresh automatically")
    expect(html).toContain("state.deckVersion = nextVersion;\n            markCommentsUpdatedForVersion(nextVersion);\n            markStaleComments();")
    expect(html).toContain("pendingCommentStatus(commentId) !== 'updated'")
    expect(html).toContain("setStatus('Deck file updated. Preview will refresh automatically.');")
    expect(html).not.toContain("else if (hasWaiting)")
    expect(html).not.toContain("Applied")
    expect(html).not.toContain("Revela Visual Edit")
    expect(html).not.toContain("Write one comment")
    expect(html).not.toContain("refresh the editor")
  })
})

describe("revela-edit tool", () => {
  it("returns editor details for an existing deck", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const editTool = createEditTool({
      client: { session: { prompt: async () => undefined } },
      workspaceRoot: root,
      openBrowser: false,
    }) as any

    const result = JSON.parse(await editTool.execute({}, { sessionID: "session-1" }))

    expect(result.ok).toBe(true)
    expect(result.deckKey).toBe(workspaceDeckSlug(root))
    expect(result.file).toBe("decks/market-map.html")
    expect(result.url).toStartWith("http://127.0.0.1:")
    expect(result.message).toContain("Ctrl/Cmd")
  })

  it("returns an error when session id is unavailable", async () => {
    const root = workspace()
    const editTool = createEditTool({
      client: { session: { prompt: async () => undefined } },
      workspaceRoot: root,
      openBrowser: false,
    }) as any

    const result = JSON.parse(await editTool.execute({ target: "missing" }, {}))

    expect(result.ok).toBe(false)
    expect(result.error).toContain("session id")
  })

})
