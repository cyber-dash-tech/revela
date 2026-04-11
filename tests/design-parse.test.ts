import { describe, it, expect } from "bun:test"
import {
  parseDesignSections,
  generateComponentIndex,
} from "../lib/design/designs"

// ── Helpers ────────────────────────────────────────────────────────────────

function wrap(name: string, content: string, type: "section" | "component" = "section"): string {
  return `<!-- @${type}:${name}:start -->\n${content}\n<!-- @${type}:${name}:end -->`
}

// ── parseDesignSections ────────────────────────────────────────────────────

describe("parseDesignSections", () => {
  it("returns empty maps and hasMarkers=false for body with no markers", () => {
    const result = parseDesignSections("## Some heading\n\nJust regular text.")
    expect(result.hasMarkers).toBe(false)
    expect(result.sections).toEqual({})
    expect(result.components).toEqual({})
  })

  it("returns hasMarkers=false for empty body", () => {
    const result = parseDesignSections("")
    expect(result.hasMarkers).toBe(false)
  })

  it("parses a single section block correctly", () => {
    const body = wrap("global", "Color: #fff\nFont: Inter")
    const { sections, hasMarkers } = parseDesignSections(body)
    expect(hasMarkers).toBe(true)
    expect(sections.global).toBe("Color: #fff\nFont: Inter")
  })

  it("trims leading/trailing whitespace from section content", () => {
    const body = `<!-- @section:global:start -->\n\n   Content here   \n\n<!-- @section:global:end -->`
    const { sections } = parseDesignSections(body)
    expect(sections.global).toBe("Content here")
  })

  it("parses multiple sections without cross-contamination", () => {
    const body = [
      wrap("global", "global content"),
      wrap("layouts", "layouts content"),
      wrap("charts", "charts content"),
    ].join("\n\n")
    const { sections } = parseDesignSections(body)
    expect(sections.global).toBe("global content")
    expect(sections.layouts).toBe("layouts content")
    expect(sections.charts).toBe("charts content")
    expect(Object.keys(sections)).toHaveLength(3)
  })

  it("parses a single component block correctly", () => {
    const body = wrap("card", "#### Card (.card)\n```html\n<div class='card'></div>\n```", "component")
    const { components, hasMarkers } = parseDesignSections(body)
    expect(hasMarkers).toBe(true)
    expect(components.card).toContain("Card (.card)")
  })

  it("parses multiple components independently", () => {
    const body = [
      wrap("card", "card content", "component"),
      wrap("stat-card", "stat-card content", "component"),
      wrap("quote-block", "quote-block content", "component"),
    ].join("\n\n")
    const { components } = parseDesignSections(body)
    expect(components.card).toBe("card content")
    expect(components["stat-card"]).toBe("stat-card content")
    expect(components["quote-block"]).toBe("quote-block content")
    expect(Object.keys(components)).toHaveLength(3)
  })

  it("handles sections and components in the same body independently", () => {
    const body = [
      wrap("global", "global body"),
      wrap("card", "card body", "component"),
    ].join("\n\n")
    const { sections, components } = parseDesignSections(body)
    expect(sections.global).toBe("global body")
    expect(components.card).toBe("card body")
  })

  it("accepts hyphenated section names (e.g. slide-types)", () => {
    const body = wrap("slide-types", "type list")
    const { sections } = parseDesignSections(body)
    expect(sections["slide-types"]).toBe("type list")
  })

  it("does not match a malformed marker missing the :end fence", () => {
    const body = `<!-- @section:global:start -->\ncontent with no end`
    const { sections, hasMarkers } = parseDesignSections(body)
    expect(hasMarkers).toBe(false)
    expect(sections.global).toBeUndefined()
  })

  it("does not cross-match a start marker with a different section's end marker", () => {
    const body = `<!-- @section:alpha:start -->\nalpha\n<!-- @section:beta:end -->`
    const { sections } = parseDesignSections(body)
    // The regex requires matching name: alpha:start must pair with alpha:end
    expect(sections.alpha).toBeUndefined()
  })

  it("hasMarkers is true when only components exist (no sections)", () => {
    const body = wrap("card", "card stuff", "component")
    const { hasMarkers, sections, components } = parseDesignSections(body)
    expect(hasMarkers).toBe(true)
    expect(Object.keys(sections)).toHaveLength(0)
    expect(Object.keys(components)).toHaveLength(1)
  })

  it("handles extra whitespace inside the marker tags", () => {
    const body = `<!--  @section:global:start  -->\ncontent\n<!--  @section:global:end  -->`
    const { sections } = parseDesignSections(body)
    expect(sections.global).toBe("content")
  })
})

// ── generateComponentIndex ─────────────────────────────────────────────────

describe("generateComponentIndex", () => {
  it("returns empty string for empty components map", () => {
    expect(generateComponentIndex({})).toBe("")
  })

  it("generates a table with Component Index heading", () => {
    const result = generateComponentIndex({ card: "#### Card (.card)\nSome description" })
    expect(result).toContain("### Component Index")
    expect(result).toContain("| Component | Description |")
  })

  it("strips markdown heading markers from first line description", () => {
    const result = generateComponentIndex({ card: "#### Card (.card)\nDetail" })
    // '####' should be stripped, leaving just 'Card'
    expect(result).toContain("Card")
    expect(result).not.toContain("####")
  })

  it("strips parenthesized CSS class from description", () => {
    const result = generateComponentIndex({ card: "#### Card (.card)\nDetail" })
    // '(.card)' should be stripped
    expect(result).not.toContain("(.card)")
  })

  it("uses component name in backtick code span in the table row", () => {
    const result = generateComponentIndex({ "stat-card": "#### Stat Card (.stat-card)" })
    expect(result).toContain("`stat-card`")
  })

  it("skips HTML comment lines when finding the first description line", () => {
    const body = "<!-- @component:card:start -->\n#### Card\nDescription"
    const result = generateComponentIndex({ card: body })
    // Should skip the HTML comment and use '#### Card' or 'Card'
    expect(result).toContain("Card")
    expect(result).not.toContain("@component")
  })

  it("skips code fence opening lines (``` lines) when finding the first description line", () => {
    // The implementation skips lines starting with ``` but uses the next non-empty, non-comment line.
    // So if body starts with ```html, the next line (the actual code) is used as description.
    const body = "```html\n#### My Widget\n```"
    const result = generateComponentIndex({ widget: body })
    expect(result).toContain("My Widget")
    expect(result).not.toContain("```")
  })

  it("generates one row per component", () => {
    const components = {
      a: "#### Alpha\ncontent",
      b: "#### Beta\ncontent",
      c: "#### Gamma\ncontent",
    }
    const result = generateComponentIndex(components)
    expect(result).toContain("`a`")
    expect(result).toContain("`b`")
    expect(result).toContain("`c`")
    // Count table data rows (lines starting with '| `')
    const rows = result.split("\n").filter((l) => l.startsWith("| `"))
    expect(rows).toHaveLength(3)
  })

  it("handles component with completely empty body (no first line)", () => {
    const result = generateComponentIndex({ empty: "" })
    // Should still produce a row, with empty description
    expect(result).toContain("`empty`")
  })

  it("includes on-demand usage hint", () => {
    const result = generateComponentIndex({ x: "#### X" })
    expect(result).toContain("revela-designs")
    expect(result).toContain("action")
  })
})
