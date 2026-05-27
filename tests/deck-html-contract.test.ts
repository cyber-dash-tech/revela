import { describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { assertDeckHtmlContractValid, validateDeckHtmlContract } from "../lib/deck-html/contract"
import { createEmptyDecksState, upsertDeck, upsertSlides, writeDecksState } from "../lib/decks-state"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("deck HTML contract", () => {
  it("accepts active deck HTML with matching 1-based data-slide-index values", () => {
    const root = workspace()
    try {
      writeDeck(root, `
        <section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>One</h1></div></section>
        <section class="slide" data-slide-index="2"><div class="slide-canvas"><h1>Two</h1></div></section>
      `)
      writeState(root, [1, 2])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("valid")
      expect(report.expectedIndexes).toEqual([1, 2])
      expect(report.actualIndexes).toEqual([1, 2])
      expect(report.issues).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects slides missing canonical data-slide-index", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide"><div class="slide-canvas"><h1>One</h1></div></section>`)
      writeState(root, [1])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("missing_data_slide_index")
      expect(() => assertDeckHtmlContractValid(root, "decks/demo.html")).toThrow("Deck HTML contract validation failed")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects slides missing a direct slide-canvas child", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-slide-index="1"><h1>One</h1></section>`)
      writeState(root, [1])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("missing_slide_canvas")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects nested non-direct slide-canvas wrappers", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-slide-index="1"><div><div class="slide-canvas"><h1>One</h1></div></div></section>`)
      writeState(root, [1])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("slide_canvas_not_direct_child")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects multiple direct slide-canvas children", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>One</h1></div><div class="slide-canvas"><h1>Duplicate</h1></div></section>`)
      writeState(root, [1])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("multiple_slide_canvas")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("treats legacy data-index as non-canonical slide identity", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-index="0"><div class="slide-canvas"><h1>One</h1></div></section>`)
      writeState(root, [1])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.warnings.map((issue) => issue.type)).toContain("legacy_data_index_noncanonical")
      expect(report.issues.map((issue) => issue.type)).toContain("missing_data_slide_index")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects duplicate and descending canonical indexes", () => {
    const root = workspace()
    try {
      writeDeck(root, `
        <section class="slide" data-slide-index="2"><div class="slide-canvas"><h1>Two</h1></div></section>
        <section class="slide" data-slide-index="2"><div class="slide-canvas"><h1>Two again</h1></div></section>
      `)
      writeState(root, [1, 2])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("duplicate_data_slide_index")
      expect(report.issues.map((issue) => issue.type)).toContain("slide_index_order")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("warns on slide count mismatches without failing contract", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>One</h1></div></section>`)
      writeState(root, [1, 2])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("valid")
      expect(report.ok).toBe(true)
      expect(report.issues).toEqual([])
      expect(report.warnings.map((issue) => issue.type)).toContain("partial_deck")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("accepts partial prefix decks during chapter-by-chapter authoring", () => {
    const root = workspace()
    try {
      writeDeck(root, `
        <section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>One</h1></div></section>
        <section class="slide" data-slide-index="2"><div class="slide-canvas"><h1>Two</h1></div></section>
        <section class="slide" data-slide-index="3"><div class="slide-canvas"><h1>Three</h1></div></section>
        <section class="slide" data-slide-index="4"><div class="slide-canvas"><h1>Four</h1></div></section>
        <section class="slide" data-slide-index="5"><div class="slide-canvas"><h1>Five</h1></div></section>
      `)
      writeState(root, Array.from({ length: 35 }, (_, index) => index + 1))

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("valid")
      expect(report.actualIndexes).toEqual([1, 2, 3, 4, 5])
      expect(report.expectedIndexes).toHaveLength(35)
      expect(report.warnings).toContainEqual(expect.objectContaining({ type: "partial_deck", severity: "warning" }))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects out-of-order slide indexes even when counts differ", () => {
    const root = workspace()
    try {
      writeDeck(root, `
        <section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>One</h1></div></section>
        <section class="slide" data-slide-index="3"><div class="slide-canvas"><h1>Three</h1></div></section>
        <section class="slide" data-slide-index="2"><div class="slide-canvas"><h1>Two</h1></div></section>
      `)
      writeState(root, [1, 2, 3, 4])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("slide_index_order")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("skips standalone HTML files that do not match the active deck target", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>One</h1></div></section>`)
      writeFileSync(join(root, "decks", "standalone.html"), `<section class="slide"><h1>Standalone</h1></section>`, "utf-8")
      writeState(root, [1])

      const report = validateDeckHtmlContract(root, "decks/standalone.html")

      expect(report.status).toBe("skipped")
      expect(report.ok).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

function workspace(): string {
  const root = tempWorkspace("revela-contract-test-")
  mkdirSync(join(root, "decks"), { recursive: true })
  return root
}

function writeDeck(root: string, body: string): void {
  writeFileSync(join(root, "decks", "demo.html"), `<html><body>${body}</body></html>`, "utf-8")
}

function writeState(root: string, indexes: number[]): void {
  let state = createEmptyDecksState()
  state = upsertDeck(state, { slug: "demo", goal: "Demo", outputPath: "decks/demo.html" })
  state = upsertSlides(state, "demo", indexes.map((index) => ({
    index,
    title: `Slide ${index}`,
    purpose: "Validate contract",
    layout: "cover",
    components: ["hero-title"],
    content: { headline: `Slide ${index}` },
    evidence: [],
    status: "ready",
  })))
  writeDecksState(root, state)
}
