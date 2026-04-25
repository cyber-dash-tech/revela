import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { parseFrontmatter } from "../lib/frontmatter"
import { DESIGNS_DIR } from "../lib/config"
import {
  createDesignPackage,
  listDesigns,
  parseDesignFile,
  parseDesignSections,
  resolveDesignPreview,
  validateDesignPackage,
} from "../lib/design/designs"
import {
  buildDesignsEditPrompt,
  buildDesignsNewPrompt,
  parseDesignsEditArgs,
  parseDesignsNewArgs,
} from "../lib/commands/designs-new"
import designsAuthorTool from "../tools/designs-author"

const createdDesigns: string[] = []

function track(name: string): string {
  createdDesigns.push(name)
  return name
}

function validDesignMd(name: string): string {
  return `---
name: ${name}
description: Test design
author: test
version: 1.0.0
---

<!-- @design:foundation:start -->
### Foundation
\`\`\`css
.test-card { color: red; }
\`\`\`
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
### Rules
- Keep hierarchy clear.
<!-- @design:rules:end -->

<!-- @layout:test-layout:start qa=true -->
#### Test Layout
\`\`\`html
<section class="slide" slide-qa="true"><div class="slide-canvas"></div></section>
\`\`\`
<!-- @layout:test-layout:end -->

<!-- @component:test-card:start -->
#### Test Card
\`\`\`html
<div class="test-card">Card</div>
\`\`\`
<!-- @component:test-card:end -->`
}

function wrapMinimalDesignBody(): string {
  return `<!-- @design:foundation:start -->
Foundation
<!-- @design:foundation:end -->

<!-- @design:rules:start -->
Rules
<!-- @design:rules:end -->

<!-- @layout:test-layout:start qa=true -->
Layout
<!-- @layout:test-layout:end -->

<!-- @component:test-card:start -->
Component
<!-- @component:test-card:end -->`
}

function validPreviewHtml(): string {
  return `<!doctype html>
<html><body>
<section class="slide" slide-qa="true"><div class="slide-canvas"></div></section>
</body></html>`
}

afterEach(() => {
  for (const name of createdDesigns.splice(0)) {
    rmSync(join(DESIGNS_DIR, name), { recursive: true, force: true })
  }
})

describe("parseDesignsNewArgs", () => {
  it("requires a design name", () => {
    const result = parseDesignsNewArgs("")
    expect(result.ok).toBe(false)
  })

  it("parses a valid name with default base", () => {
    const result = parseDesignsNewArgs("neon-finance")
    expect(result).toEqual({ ok: true, name: "neon-finance", base: "starter" })
  })

  it("parses an explicit base", () => {
    const result = parseDesignsNewArgs("neon-finance --base summit")
    expect(result).toEqual({ ok: true, name: "neon-finance", base: "summit" })
  })

  it("rejects non-kebab-case names", () => {
    const result = parseDesignsNewArgs("Neon Finance")
    expect(result.ok).toBe(false)
  })

  it("rejects unknown options", () => {
    const result = parseDesignsNewArgs("neon-finance --overwrite")
    expect(result.ok).toBe(false)
  })
})

describe("parseDesignsEditArgs", () => {
  it("requires exactly one design name", () => {
    expect(parseDesignsEditArgs("").ok).toBe(false)
    expect(parseDesignsEditArgs("one two").ok).toBe(false)
  })

  it("parses a valid design name", () => {
    expect(parseDesignsEditArgs("neon-finance")).toEqual({ ok: true, name: "neon-finance" })
  })

  it("rejects non-kebab-case names", () => {
    expect(parseDesignsEditArgs("NeonFinance").ok).toBe(false)
  })
})

describe("buildDesignsNewPrompt", () => {
  it("instructs the agent to interview before saving", () => {
    const prompt = buildDesignsNewPrompt({ name: "neon-finance", base: "summit" })
    expect(prompt).toContain("Do not generate or save files immediately")
    expect(prompt).toContain("revela-designs-author")
    expect(prompt).toContain("/revela designs neon-finance")
  })

  it("requires visual schema extraction and scoped CSS generation", () => {
    const prompt = buildDesignsNewPrompt({ name: "playful-education", base: "summit" })
    expect(prompt).toContain("extract a visual schema")
    expect(prompt).toContain("Preserve composition, not just colors and shapes")
    expect(prompt).toContain("self-contained SVG component with a fixed viewBox")
    expect(prompt).toContain("Do not rewrite the entire base layout system from scratch")
  })
})

describe("buildDesignsEditPrompt", () => {
  it("instructs the agent to confirm an edit brief before overwriting", () => {
    const prompt = buildDesignsEditPrompt({ name: "neon-finance" })
    expect(prompt).toContain("Do not save files immediately")
    expect(prompt).toContain("overwrite=true")
    expect(prompt).toContain("Ask the user to confirm the edit brief")
    expect(prompt).toContain("/revela designs neon-finance")
  })
})

describe("starter built-in design", () => {
  it("has the minimum neutral base coverage for designs-new", () => {
    const designPath = join(import.meta.dir, "..", "designs", "starter", "DESIGN.md")
    const previewPath = join(import.meta.dir, "..", "designs", "starter", "preview.html")
    expect(existsSync(designPath)).toBe(true)
    expect(existsSync(previewPath)).toBe(true)

    const raw = readFileSync(designPath, "utf-8")
    const { body } = parseFrontmatter(raw)
    const parsed = parseDesignSections(body)

    expect(parsed.hasMarkers).toBe(true)
    expect(Object.keys(parsed.sections)).toContain("foundation")
    expect(Object.keys(parsed.sections)).toContain("rules")
    expect(Object.keys(parsed.sections)).toContain("chart-rules")
    expect(Object.keys(parsed.layouts)).toEqual(expect.arrayContaining([
      "fullbleed",
      "narrative",
      "narrative-reverse",
      "highlight-cols",
      "halves",
      "stacked",
    ]))
    expect(Object.keys(parsed.layouts)).toHaveLength(6)
    expect(Object.keys(parsed.components)).toContain("svg-motif")
    expect(Object.keys(parsed.components).length).toBeGreaterThanOrEqual(16)
    expect(body).toContain("Visual Schema Rules")
    expect(body).toContain("SVG Motif Rules")

    const preview = readFileSync(previewPath, "utf-8")
    expect(preview).toContain("Starter Design System")
    expect(preview).toContain("slide-qa=")
    expect(preview).toContain("svg-motif")
  })

  it("is marked internal and hidden from normal design listings", () => {
    const designPath = join(import.meta.dir, "..", "designs", "starter", "DESIGN.md")
    const info = parseDesignFile(designPath)
    expect(info?.internal).toBe(true)

    const name = track("test-internal-design")
    const dir = join(DESIGNS_DIR, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "DESIGN.md"), `---
name: ${name}
description: Internal test design
author: test
version: 1.0.0
internal: true
---

${wrapMinimalDesignBody()}`, "utf-8")

    const installedNames = listDesigns().map((d) => d.name)
    expect(installedNames).not.toContain(name)

    const allNames = listDesigns({ includeInternal: true }).map((d) => d.name)
    expect(allNames).toContain(name)
  })
})

describe("design package authoring", () => {
  it("creates and validates a design package", () => {
    const name = track("test-designs-new-create")
    const result = createDesignPackage({
      name,
      base: "summit",
      designMd: validDesignMd(name),
      previewHtml: validPreviewHtml(),
    })

    expect(result.ok).toBe(true)
    expect(result.name).toBe(name)
    expect(existsSync(join(DESIGNS_DIR, name, "DESIGN.md"))).toBe(true)
    expect(existsSync(join(DESIGNS_DIR, name, "preview.html"))).toBe(true)

    const validation = validateDesignPackage(name)
    expect(validation.ok).toBe(true)
    expect(validation.sections).toContain("foundation")
    expect(validation.layouts).toContain("test-layout")
    expect(validation.components).toContain("test-card")
  })

  it("does not overwrite existing designs by default", () => {
    const name = track("test-designs-new-existing")
    createDesignPackage({ name, designMd: validDesignMd(name), previewHtml: validPreviewHtml() })

    expect(() => createDesignPackage({
      name,
      designMd: validDesignMd(name),
      previewHtml: validPreviewHtml(),
    })).toThrow("already exists")
  })

  it("reports missing required marker sections", () => {
    const name = track("test-designs-new-invalid")
    const dir = join(DESIGNS_DIR, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "DESIGN.md"), `---\nname: ${name}\n---\n\nNo markers`, "utf-8")
    writeFileSync(join(dir, "preview.html"), validPreviewHtml(), "utf-8")

    const validation = validateDesignPackage(name)
    expect(validation.ok).toBe(false)
    expect(validation.errors).toContain("DESIGN.md must include marker sections")
  })

  it("resolves preview path and missing-preview state", () => {
    const withPreview = track("test-preview-present")
    createDesignPackage({
      name: withPreview,
      designMd: validDesignMd(withPreview),
      previewHtml: validPreviewHtml(),
    })

    const present = resolveDesignPreview(withPreview)
    expect(present.name).toBe(withPreview)
    expect(present.hasPreview).toBe(true)
    expect(present.previewPath.endsWith("preview.html")).toBe(true)

    const missingPreview = track("test-preview-missing")
    const dir = join(DESIGNS_DIR, missingPreview)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "DESIGN.md"), validDesignMd(missingPreview), "utf-8")

    const missing = resolveDesignPreview(missingPreview)
    expect(missing.name).toBe(missingPreview)
    expect(missing.hasPreview).toBe(false)
  })

  it("throws when resolving preview for an uninstalled design", () => {
    expect(() => resolveDesignPreview("not-installed-design")).toThrow("not installed")
  })
})

describe("revela-designs-author tool", () => {
  it("creates and validates through the tool", async () => {
    const name = track("test-designs-author-tool")
    const toolImpl = designsAuthorTool as any
    const createResult = JSON.parse(await toolImpl.execute({
      action: "create",
      name,
      base: "summit",
      designMd: validDesignMd(name),
      previewHtml: validPreviewHtml(),
    }))

    expect(createResult.ok).toBe(true)

    const validateResult = JSON.parse(await toolImpl.execute({ action: "validate", name }))
    expect(validateResult.ok).toBe(true)
  })
})
