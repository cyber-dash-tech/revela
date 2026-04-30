import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { createEmptyDecksState, readDecksState, upsertDeck, writeDecksState } from "../lib/decks-state"
import { ensureEditableDeckState } from "../lib/edit/deck-state"
import { resolveEditableDeck } from "../lib/edit/resolve-deck"
import { buildEditPrompt } from "../lib/edit/prompt"
import { openEditableDeck } from "../lib/edit/open"
import createEditTool from "../tools/edit"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "revela-edit-test-"))
  roots.push(root)
  mkdirSync(join(root, "decks"), { recursive: true })
  return root
}

describe("resolveEditableDeck", () => {
  it("resolves a deck from DECKS.json outputPath", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "custom-output.html"), "<html></html>", "utf-8")
    const state = upsertDeck(createEmptyDecksState(), {
      slug: "sales-kickoff",
      goal: "Edit an existing deck",
      outputPath: "decks/custom-output.html",
    })
    writeDecksState(root, state)

    const deck = resolveEditableDeck(root, "sales-kickoff")

    expect(deck).toMatchObject({
      slug: "sales-kickoff",
      file: "decks/custom-output.html",
      source: "decks-state",
    })
    expect(deck.absoluteFile).toBe(join(root, "decks", "custom-output.html"))
  })

  it("falls back to decks/<slug>.html when no state entry exists", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html></html>", "utf-8")

    const deck = resolveEditableDeck(root, "market-map")

    expect(deck).toMatchObject({
      slug: "market-map",
      file: "decks/market-map.html",
      source: "fallback",
    })
  })

  it("resolves a decks/*.html path", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html></html>", "utf-8")

    const deck = resolveEditableDeck(root, "decks/market-map.html")

    expect(deck).toMatchObject({
      slug: "market-map",
      file: "decks/market-map.html",
      source: "file-path",
    })
  })

  it("resolves a ./decks/*.html path", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html></html>", "utf-8")

    const deck = resolveEditableDeck(root, "./decks/market-map.html")

    expect(deck).toMatchObject({
      slug: "market-map",
      file: "decks/market-map.html",
      source: "file-path",
    })
  })

  it("rejects paths outside decks/*.html", () => {
    const root = workspace()

    expect(() => resolveEditableDeck(root, "../decks/secret.html")).toThrow("outside the workspace")
    expect(() => resolveEditableDeck(root, "market-map.html")).toThrow("decks/*.html")
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
    expect(prompt).toContain("revela-qa")
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
  it("creates ready deck state for a fallback HTML deck", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), `
      <html><body>
        <section class="slide" slide-qa="true"><h2>Market Map</h2><p>Existing content.</p></section>
      </body></html>
    `, "utf-8")
    const deck = resolveEditableDeck(root, "market-map")

    const result = ensureEditableDeckState(root, deck)
    const state = readDecksState(root)

    expect(result.readiness.ready).toBe(true)
    expect(state.decks["market-map"].outputPath).toBe("decks/market-map.html")
    expect(state.decks["market-map"].slides).toHaveLength(1)
    expect(state.decks["market-map"].slides[0].title).toBe("Market Map")
    expect(state.decks["market-map"].writeReadiness.status).toBe("ready")
  })
})

describe("openEditableDeck", () => {
  it("opens an edit session without launching a browser when disabled", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\"><h2>Market Map</h2></section></body></html>", "utf-8")

    const result = openEditableDeck("market-map", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })

    expect(result.deck.slug).toBe("market-map")
    expect(result.deck.file).toBe("decks/market-map.html")
    expect(result.url).toStartWith("http://127.0.0.1:")
    expect(readDecksState(root).decks["market-map"].writeReadiness.status).toBe("ready")
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

    const result = JSON.parse(await editTool.execute({ target: "decks/market-map.html" }, { sessionID: "session-1" }))

    expect(result.ok).toBe(true)
    expect(result.deck).toBe("market-map")
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
