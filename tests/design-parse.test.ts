import { describe, it, expect } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  parseDesignSections,
  generateComponentIndex,
  generateLayoutIndex,
  extractDesignClasses,
  DEFAULT_PREFIX_EXEMPTIONS,
} from "../lib/design/designs"

// ── Helpers ────────────────────────────────────────────────────────────────

/** Wrap content in a @design: section marker pair. */
function wrapSection(name: string, content: string): string {
  return `<!-- @design:${name}:start -->\n${content}\n<!-- @design:${name}:end -->`
}

/** Wrap content in a @layout: marker pair, optionally with qa=true|false attribute. */
function wrapLayout(name: string, content: string, qa?: boolean): string {
  const qaAttr = qa === undefined ? "" : ` qa=${qa}`
  return `<!-- @layout:${name}:start${qaAttr} -->\n${content}\n<!-- @layout:${name}:end -->`
}

/** Wrap content in a @component: marker pair. */
function wrapComponent(name: string, content: string): string {
  return `<!-- @component:${name}:start -->\n${content}\n<!-- @component:${name}:end -->`
}

// ── parseDesignSections ────────────────────────────────────────────────────

describe("parseDesignSections", () => {
  it("returns empty maps and hasMarkers=false for body with no markers", () => {
    const result = parseDesignSections("## Some heading\n\nJust regular text.")
    expect(result.hasMarkers).toBe(false)
    expect(result.sections).toEqual({})
    expect(result.layouts).toEqual({})
    expect(result.components).toEqual({})
  })

  it("returns hasMarkers=false for empty body", () => {
    const result = parseDesignSections("")
    expect(result.hasMarkers).toBe(false)
  })

  // ── @design: sections ──────────────────────────────────────────────────

  it("parses a single @design: section correctly", () => {
    const body = wrapSection("foundation", "Color: #fff\nFont: Inter")
    const { sections, hasMarkers } = parseDesignSections(body)
    expect(hasMarkers).toBe(true)
    expect(sections.foundation).toBe("Color: #fff\nFont: Inter")
  })

  it("trims leading/trailing whitespace from section content", () => {
    const body = `<!-- @design:foundation:start -->\n\n   Content here   \n\n<!-- @design:foundation:end -->`
    const { sections } = parseDesignSections(body)
    expect(sections.foundation).toBe("Content here")
  })

  it("parses multiple @design: sections without cross-contamination", () => {
    const body = [
      wrapSection("foundation", "foundation content"),
      wrapSection("rules", "rules content"),
      wrapSection("chart-rules", "chart content"),
    ].join("\n\n")
    const { sections } = parseDesignSections(body)
    expect(sections.foundation).toBe("foundation content")
    expect(sections.rules).toBe("rules content")
    expect(sections["chart-rules"]).toBe("chart content")
    expect(Object.keys(sections)).toHaveLength(3)
  })

  it("accepts hyphenated section names (e.g. chart-rules)", () => {
    const body = wrapSection("chart-rules", "ECharts config")
    const { sections } = parseDesignSections(body)
    expect(sections["chart-rules"]).toBe("ECharts config")
  })

  it("does not match a malformed @design: marker missing the :end fence", () => {
    const body = `<!-- @design:foundation:start -->\ncontent with no end`
    const { sections, hasMarkers } = parseDesignSections(body)
    expect(hasMarkers).toBe(false)
    expect(sections.foundation).toBeUndefined()
  })

  it("does not cross-match a start marker with a different section's end marker", () => {
    const body = `<!-- @design:alpha:start -->\nalpha\n<!-- @design:beta:end -->`
    const { sections } = parseDesignSections(body)
    expect(sections.alpha).toBeUndefined()
  })

  it("handles extra whitespace inside @design: marker tags", () => {
    const body = `<!--  @design:foundation:start  -->\ncontent\n<!--  @design:foundation:end  -->`
    const { sections } = parseDesignSections(body)
    expect(sections.foundation).toBe("content")
  })

  // ── @layout: markers ───────────────────────────────────────────────────

  it("parses a single @layout: marker with qa=false", () => {
    const body = wrapLayout("cover", "centered stack content", false)
    const { layouts, hasMarkers } = parseDesignSections(body)
    expect(hasMarkers).toBe(true)
    expect(layouts.cover).toBeDefined()
    expect(layouts.cover.content).toBe("centered stack content")
    expect(layouts.cover.qa).toBe(false)
  })

  it("parses a single @layout: marker with qa=true", () => {
    const body = wrapLayout("two-col", "two column layout", true)
    const { layouts } = parseDesignSections(body)
    expect(layouts["two-col"].qa).toBe(true)
    expect(layouts["two-col"].content).toBe("two column layout")
  })

  it("defaults qa to true when qa attribute is omitted", () => {
    const body = `<!-- @layout:card-grid:start -->\ncard grid content\n<!-- @layout:card-grid:end -->`
    const { layouts } = parseDesignSections(body)
    expect(layouts["card-grid"].qa).toBe(true)
    expect(layouts["card-grid"].content).toBe("card grid content")
  })

  it("parses multiple layouts independently with correct qa values", () => {
    const body = [
      wrapLayout("cover", "cover content", false),
      wrapLayout("toc", "toc content", false),
      wrapLayout("two-col", "two-col content", true),
      wrapLayout("card-grid", "card-grid content", true),
    ].join("\n\n")
    const { layouts } = parseDesignSections(body)
    expect(Object.keys(layouts)).toHaveLength(4)
    expect(layouts.cover.qa).toBe(false)
    expect(layouts.toc.qa).toBe(false)
    expect(layouts["two-col"].qa).toBe(true)
    expect(layouts["card-grid"].qa).toBe(true)
  })

  it("trims whitespace from layout content", () => {
    const body = `<!-- @layout:cover:start qa=false -->\n\n   cover inner   \n\n<!-- @layout:cover:end -->`
    const { layouts } = parseDesignSections(body)
    expect(layouts.cover.content).toBe("cover inner")
  })

  it("accepts hyphenated layout names", () => {
    const body = wrapLayout("step-flow", "step flow layout", true)
    const { layouts } = parseDesignSections(body)
    expect(layouts["step-flow"]).toBeDefined()
    expect(layouts["step-flow"].content).toBe("step flow layout")
  })

  it("hasMarkers is true when only layouts exist (no sections or components)", () => {
    const body = wrapLayout("cover", "cover content", false)
    const { hasMarkers, sections, components } = parseDesignSections(body)
    expect(hasMarkers).toBe(true)
    expect(Object.keys(sections)).toHaveLength(0)
    expect(Object.keys(components)).toHaveLength(0)
  })

  // ── @component: markers ────────────────────────────────────────────────

  it("parses a single @component: block correctly", () => {
    const body = wrapComponent("card", "#### Card (.card)\n```html\n<div class='card'></div>\n```")
    const { components, hasMarkers } = parseDesignSections(body)
    expect(hasMarkers).toBe(true)
    expect(components.card).toContain("Card (.card)")
  })

  it("parses multiple components independently", () => {
    const body = [
      wrapComponent("card", "card content"),
      wrapComponent("stat-card", "stat-card content"),
      wrapComponent("quote-block", "quote-block content"),
    ].join("\n\n")
    const { components } = parseDesignSections(body)
    expect(components.card).toBe("card content")
    expect(components["stat-card"]).toBe("stat-card content")
    expect(components["quote-block"]).toBe("quote-block content")
    expect(Object.keys(components)).toHaveLength(3)
  })

  it("hasMarkers is true when only components exist (no sections or layouts)", () => {
    const body = wrapComponent("card", "card stuff")
    const { hasMarkers, sections, layouts } = parseDesignSections(body)
    expect(hasMarkers).toBe(true)
    expect(Object.keys(sections)).toHaveLength(0)
    expect(Object.keys(layouts)).toHaveLength(0)
  })

  // ── Mixed bodies ───────────────────────────────────────────────────────

  it("handles all three marker types in the same body independently", () => {
    const body = [
      wrapSection("foundation", "foundation body"),
      wrapLayout("cover", "cover body", false),
      wrapComponent("card", "card body"),
    ].join("\n\n")
    const { sections, layouts, components } = parseDesignSections(body)
    expect(sections.foundation).toBe("foundation body")
    expect(layouts.cover.content).toBe("cover body")
    expect(layouts.cover.qa).toBe(false)
    expect(components.card).toBe("card body")
  })

  it("layout markers nested inside a @design:layouts section are captured by both", () => {
    // The section regex captures the entire layouts section including the @layout: sub-markers.
    // The layout regex independently extracts the sub-markers.
    const inner = wrapLayout("cover", "cover inner", false)
    const body = wrapSection("layouts", inner)
    const { sections, layouts } = parseDesignSections(body)
    // Section captures the full layouts block (includes the @layout: marker text)
    expect(sections.layouts).toContain("cover inner")
    // Layout regex also independently extracts the sub-marker
    expect(layouts.cover).toBeDefined()
    expect(layouts.cover.content).toBe("cover inner")
    expect(layouts.cover.qa).toBe(false)
  })
})

// ── generateLayoutIndex ────────────────────────────────────────────────────

describe("generateLayoutIndex", () => {
  it("returns empty string for empty layouts map", () => {
    expect(generateLayoutIndex({})).toBe("")
  })

  it("generates a table with Layout Index heading", () => {
    const layouts = { cover: { content: "## Cover\nCentered title slide", qa: false } }
    const result = generateLayoutIndex(layouts)
    expect(result).toContain("### Layout Index")
    expect(result).toContain("| Layout | QA | Description |")
  })

  it("shows — for qa=false layouts", () => {
    const layouts = { cover: { content: "## Cover", qa: false } }
    const result = generateLayoutIndex(layouts)
    expect(result).toContain("| `cover` | — |")
  })

  it("shows ✓ for qa=true layouts", () => {
    const layouts = { "two-col": { content: "## Two Column", qa: true } }
    const result = generateLayoutIndex(layouts)
    expect(result).toContain("| `two-col` | ✓ |")
  })

  it("uses layout name in backtick code span in the table row", () => {
    const layouts = { "card-grid": { content: "## Card Grid", qa: true } }
    const result = generateLayoutIndex(layouts)
    expect(result).toContain("`card-grid`")
  })

  it("strips markdown heading markers from first line description", () => {
    const layouts = { cover: { content: "## Cover Layout\nsome detail", qa: false } }
    const result = generateLayoutIndex(layouts)
    expect(result).toContain("Cover Layout")
    // The table row should not contain the ## prefix in the description column
    const row = result.split("\n").find((l) => l.startsWith("| `cover`"))
    expect(row).toBeDefined()
    expect(row).not.toContain("##")
  })

  it("generates one row per layout", () => {
    const layouts = {
      cover:    { content: "## Cover", qa: false },
      toc:      { content: "## Table of Contents", qa: false },
      "two-col": { content: "## Two Column", qa: true },
    }
    const result = generateLayoutIndex(layouts)
    const rows = result.split("\n").filter((l) => l.startsWith("| `"))
    expect(rows).toHaveLength(3)
  })

  it("includes on-demand usage hint", () => {
    const layouts = { cover: { content: "## Cover", qa: false } }
    const result = generateLayoutIndex(layouts)
    expect(result).toContain("revela-designs")
    expect(result).toContain("layout")
  })

  it("handles layout with empty body (no first line)", () => {
    const layouts = { empty: { content: "", qa: true } }
    const result = generateLayoutIndex(layouts)
    expect(result).toContain("`empty`")
  })

  it("skips HTML comment lines when finding description", () => {
    const layouts = { cover: { content: "<!-- @layout:cover:start -->\n## Cover Title", qa: false } }
    const result = generateLayoutIndex(layouts)
    expect(result).toContain("Cover Title")
    expect(result).not.toContain("@layout")
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
    expect(result).toContain("Card")
    expect(result).not.toContain("####")
  })

  it("strips parenthesized CSS class from description", () => {
    const result = generateComponentIndex({ card: "#### Card (.card)\nDetail" })
    expect(result).not.toContain("(.card)")
  })

  it("uses component name in backtick code span in the table row", () => {
    const result = generateComponentIndex({ "stat-card": "#### Stat Card (.stat-card)" })
    expect(result).toContain("`stat-card`")
  })

  it("skips HTML comment lines when finding the first description line", () => {
    const body = "<!-- @component:card:start -->\n#### Card\nDescription"
    const result = generateComponentIndex({ card: body })
    expect(result).toContain("Card")
    expect(result).not.toContain("@component")
  })

  it("skips code fence opening lines (``` lines) when finding the first description line", () => {
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
    const rows = result.split("\n").filter((l) => l.startsWith("| `"))
    expect(rows).toHaveLength(3)
  })

  it("handles component with completely empty body (no first line)", () => {
    const result = generateComponentIndex({ empty: "" })
    expect(result).toContain("`empty`")
  })

  it("includes on-demand usage hint", () => {
    const result = generateComponentIndex({ x: "#### X" })
    expect(result).toContain("revela-designs")
    expect(result).toContain("action")
  })
})

// ── extractDesignClasses (active design integration) ─────────────────────

describe("extractDesignClasses", () => {
  it("returns a DesignClassVocabulary with classes Set and prefixExemptions", () => {
    // Uses the active installed design (aurora or summit)
    const vocab = extractDesignClasses()
    expect(vocab.classes).toBeInstanceOf(Set)
    expect(Array.isArray(vocab.prefixExemptions)).toBe(true)
  })

  it("always includes universal classes regardless of design", () => {
    const vocab = extractDesignClasses()
    const universals = ["slide", "slide-canvas", "visible", "reveal", "editable", "page"]
    for (const cls of universals) {
      expect(vocab.classes.has(cls)).toBe(true)
    }
  })

  it("returns default prefix exemptions including lucide- and echarts-", () => {
    const vocab = extractDesignClasses()
    expect(vocab.prefixExemptions).toContain("lucide-")
    expect(vocab.prefixExemptions).toContain("echarts-")
  })

  it("DEFAULT_PREFIX_EXEMPTIONS includes at least lucide-, echarts-, editable-", () => {
    expect(DEFAULT_PREFIX_EXEMPTIONS).toContain("lucide-")
    expect(DEFAULT_PREFIX_EXEMPTIONS).toContain("echarts-")
    expect(DEFAULT_PREFIX_EXEMPTIONS).toContain("editable-")
  })

  it("throws or returns universal-only for a non-existent design name", () => {
    // Should either throw or return the universal set gracefully
    try {
      const vocab = extractDesignClasses("non-existent-design-xyz")
      // If it returns (design file not found → graceful fallback), check universals present
      expect(vocab.classes.has("slide")).toBe(true)
    } catch (e) {
      // Acceptable — design not installed
      expect(e).toBeDefined()
    }
  })
})

// ── extractDesignClasses — fixture-based unit tests ───────────────────────

/**
 * Write a temporary design to a temp directory and call extractDesignClasses()
 * on it by temporarily pointing DESIGNS_DIR at the temp dir.
 *
 * Since extractDesignClasses() reads from DESIGNS_DIR, we use a helper that
 * writes a real DESIGN.md file to a temp dir and reads it back using the
 * public parseDesignSections + internal logic. Instead we test the observable
 * contract: given a DESIGN.md with known content, the returned Set must
 * contain expected classes and must NOT contain known false positives.
 *
 * We do this by installing a tiny mock design in OS tmpdir.
 */
function withTempDesign(body: string, fn: (designName: string) => void): void {
  const tmpBase = join(tmpdir(), `revela-test-design-${Date.now()}`)
  const designName = "test-fixture"
  const designDir = join(tmpBase, designName)
  mkdirSync(designDir, { recursive: true })
  writeFileSync(
    join(designDir, "DESIGN.md"),
    `---\nname: ${designName}\ndescription: test\nauthor: test\nversion: 0.0.1\n---\n\n${body}`
  )

  // Temporarily override DESIGNS_DIR by shimming extractDesignClasses to point
  // at our tmpBase. Since we can't easily monkey-patch the module constant,
  // we use parseDesignSections directly and validate the subset of behaviour
  // we care about.
  //
  // Instead: call the real extractDesignClasses with the tmp dir design.
  // The function reads from DESIGNS_DIR — so we need to install the mock there.
  // Simplest approach: use the package's own DESIGNS_DIR path (it's seeded to
  // ~/.config/revela/designs/). We install a temp design there, test, then remove.
  const { DESIGNS_DIR } = require("../lib/config")
  const targetDir = join(DESIGNS_DIR, designName)
  mkdirSync(targetDir, { recursive: true })
  writeFileSync(
    join(targetDir, "DESIGN.md"),
    `---\nname: ${designName}\ndescription: test\nauthor: test\nversion: 0.0.1\n---\n\n${body}`
  )
  try {
    fn(designName)
  } finally {
    rmSync(targetDir, { recursive: true, force: true })
    rmSync(tmpBase, { recursive: true, force: true })
  }
}

describe("extractDesignClasses — CSS context isolation", () => {
  it("extracts classes from ```css code blocks", () => {
    withTempDesign(
      wrapSection("foundation", `
\`\`\`css
.my-card { color: red; }
.my-title { font-size: 24px; }
\`\`\`
`),
      (name) => {
        const vocab = extractDesignClasses(name)
        expect(vocab.classes.has("my-card")).toBe(true)
        expect(vocab.classes.has("my-title")).toBe(true)
      }
    )
  })

  it("extracts classes from ```html class= attributes", () => {
    withTempDesign(
      wrapSection("foundation", `
\`\`\`html
<div class="hero-block main-col">
  <span class="eyebrow">text</span>
</div>
\`\`\`
`),
      (name) => {
        const vocab = extractDesignClasses(name)
        expect(vocab.classes.has("hero-block")).toBe(true)
        expect(vocab.classes.has("main-col")).toBe(true)
        expect(vocab.classes.has("eyebrow")).toBe(true)
      }
    )
  })

  it("does NOT extract JS method names from ```javascript blocks", () => {
    withTempDesign(
      wrapSection("foundation", `
\`\`\`javascript
class Foo {
  constructor() {
    this.el.addEventListener('click', () => {})
    this.el.classList.add('active')
    const delta = event.deltaY
    this.slides.forEach(s => s.scrollIntoView())
    document.querySelectorAll('.slide').length
  }
}
\`\`\`
`),
      (name) => {
        const vocab = extractDesignClasses(name)
        // JS method names must NOT be in the vocabulary
        const jsFalsePositives = [
          "addEventListener", "classList", "forEach", "querySelectorAll",
          "scrollIntoView", "deltaY", "currentSlide", "innerHeight",
          "preventDefault", "stopPropagation",
        ]
        for (const cls of jsFalsePositives) {
          expect(vocab.classes.has(cls)).toBe(false)
        }
      }
    )
  })

  it("does NOT extract URL fragments from CSS url() values", () => {
    withTempDesign(
      wrapSection("foundation", `
\`\`\`css
.noise-bg {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E");
}
.cdn-icon {
  background: url(https://cdn.jsdelivr.net/icons/foo.svg);
}
\`\`\`
`),
      (name) => {
        const vocab = extractDesignClasses(name)
        // URL fragments must NOT appear as classes
        expect(vocab.classes.has("w3")).toBe(false)
        expect(vocab.classes.has("org")).toBe(false)
        expect(vocab.classes.has("net")).toBe(false)
        expect(vocab.classes.has("jsdelivr")).toBe(false)
        // The actual class should still be extracted
        expect(vocab.classes.has("noise-bg")).toBe(true)
        expect(vocab.classes.has("cdn-icon")).toBe(true)
      }
    )
  })

  it("extracts classes from layout and component markers", () => {
    const body = `
<!-- @layout:two-col:start qa=true -->
\`\`\`html
<div class="two-col-wrap">
  <div class="col-primary"></div>
  <div class="col-secondary"></div>
</div>
\`\`\`
<!-- @layout:two-col:end -->

<!-- @component:stat-card:start -->
\`\`\`css
.stat-card { padding: 24px; }
.stat-number { font-size: 72px; }
\`\`\`
<!-- @component:stat-card:end -->
`
    withTempDesign(body, (name) => {
      const vocab = extractDesignClasses(name)
      expect(vocab.classes.has("two-col-wrap")).toBe(true)
      expect(vocab.classes.has("col-primary")).toBe(true)
      expect(vocab.classes.has("col-secondary")).toBe(true)
      expect(vocab.classes.has("stat-card")).toBe(true)
      expect(vocab.classes.has("stat-number")).toBe(true)
    })
  })

  it("skips ```js and ```typescript blocks just like ```javascript", () => {
    withTempDesign(
      wrapSection("foundation", `
\`\`\`js
const el = document.getElementById('foo')
el.classList.toggle('active')
el.appendChild(child)
\`\`\`

\`\`\`typescript
function goTo(index: number) {
  this.slides.forEach((s: HTMLElement) => s.scrollIntoView())
}
\`\`\`
`),
      (name) => {
        const vocab = extractDesignClasses(name)
        expect(vocab.classes.has("getElementById")).toBe(false)
        expect(vocab.classes.has("classList")).toBe(false)
        expect(vocab.classes.has("appendChild")).toBe(false)
        expect(vocab.classes.has("forEach")).toBe(false)
        expect(vocab.classes.has("scrollIntoView")).toBe(false)
      }
    )
  })
})
