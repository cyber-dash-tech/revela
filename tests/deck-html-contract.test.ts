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
        <section class="slide" data-slide-index="1"><h1>One</h1></section>
        <section class="slide" data-slide-index="2"><h1>Two</h1></section>
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
      writeDeck(root, `<section class="slide"><h1>One</h1></section>`)
      writeState(root, [1])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("missing_data_slide_index")
      expect(() => assertDeckHtmlContractValid(root, "decks/demo.html")).toThrow("Deck HTML contract validation failed")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("treats legacy data-index as non-canonical slide identity", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-index="0"><h1>One</h1></section>`)
      writeState(root, [1])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.warnings.map((issue) => issue.type)).toContain("legacy_data_index_noncanonical")
      expect(report.issues.map((issue) => issue.type)).toContain("missing_data_slide_index")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects duplicate and out-of-sequence canonical indexes", () => {
    const root = workspace()
    try {
      writeDeck(root, `
        <section class="slide" data-slide-index="2"><h1>Two</h1></section>
        <section class="slide" data-slide-index="2"><h1>Two again</h1></section>
      `)
      writeState(root, [1, 2])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("slide_index_mismatch")
      expect(report.issues.map((issue) => issue.type)).toContain("duplicate_data_slide_index")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects slide count mismatches", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-slide-index="1"><h1>One</h1></section>`)
      writeState(root, [1, 2])

      const report = validateDeckHtmlContract(root, "decks/demo.html")

      expect(report.status).toBe("invalid")
      expect(report.issues.map((issue) => issue.type)).toContain("slide_count_mismatch")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("skips standalone HTML files that do not match the active deck target", () => {
    const root = workspace()
    try {
      writeDeck(root, `<section class="slide" data-slide-index="1"><h1>One</h1></section>`)
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
