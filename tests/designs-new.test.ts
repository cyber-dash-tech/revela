import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { parseFrontmatter } from "../lib/frontmatter"
import { DESIGNS_DIR } from "../lib/config"
import {
  createDesignPackage,
  listDesigns,
  materializeDesignPreview,
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
<!-- @component:test-card:end -->

<!-- @component:test-badge:start -->
#### Test Badge
\`\`\`html
<span class="test-badge">Badge</span>
\`\`\`
<!-- @component:test-badge:end -->`
}

function designMdWithOneComponent(name: string): string {
  return `---
name: ${name}
description: Test design
author: test
version: 1.0.0
---

<!-- @design:foundation:start -->
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
<html><head><style>
.slide { min-height: 100dvh; display: flex; }
.slide-canvas { width: 1920px; height: 1080px; }
</style></head><body>
<section class="slide" slide-qa="false" data-slide-role="cover"><div class="slide-canvas"></div></section>
<section class="slide" slide-qa="true"><div class="slide-canvas"><div data-preview-component="test-card" class="test-card">Card</div><span data-preview-component="test-badge" class="test-badge">Badge</span></div></section>
<section class="slide" slide-qa="false" data-slide-role="closing"><div class="slide-canvas"></div></section>
</body></html>`
}

function validDesignCss(): string {
  return `
.slide { min-height: 100dvh; display: flex; }
.slide-canvas { width: 1920px; height: 1080px; }
.template-slide { color: #101a2b; }
.template-frame { display: flex; }
.template-title { font-size: 64px; }
.template-card { padding: 24px; }
.template-visual-slot-panel { display: grid; }
`
}

function validPreviewHtmlWithDesignCss(): string {
  return validPreviewHtml().replace("<html><head>", "<html><head><link rel=\"stylesheet\" href=\"./design.css\">")
}

function validPreviewHtmlForOneComponent(): string {
  return `<!doctype html>
<html><head><style>
.slide { min-height: 100dvh; display: flex; }
.slide-canvas { width: 1920px; height: 1080px; }
</style></head><body>
<section class="slide" slide-qa="false" data-slide-role="cover"><div class="slide-canvas"></div></section>
<section class="slide" slide-qa="true"><div class="slide-canvas"><div data-preview-component="test-card">Card</div></div></section>
<section class="slide" slide-qa="false" data-slide-role="closing"><div class="slide-canvas"></div></section>
</body></html>`
}

function previewHtmlWithoutCanvasSize(): string {
  return validPreviewHtml().replace(".slide-canvas { width: 1920px; height: 1080px; }\n", "")
}

function previewHtmlWithoutFixedSizes(): string {
  return validPreviewHtml().replace(`<style>
.slide { min-height: 100dvh; display: flex; }
.slide-canvas { width: 1920px; height: 1080px; }
</style>`, "<style>.slide, .slide-canvas { position: relative; }</style>")
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
    expect(prompt).toContain("/revela design --use neon-finance")
    expect(prompt).toContain(".slide-canvas { width: 1920px; height: 1080px; }")
    expect(prompt).toContain("The preview is generated from Revela's built-in page-template fixture plus the package `design.css`")
  })

  it("requires visual schema extraction and scoped CSS generation", () => {
    const prompt = buildDesignsNewPrompt({ name: "playful-education", base: "summit" })
    expect(prompt).toContain("extract a visual schema")
    expect(prompt).toContain("Preserve composition, not just colors and shapes")
    expect(prompt).toContain("self-contained SVG component with a fixed viewBox")
    expect(prompt).toContain("Do not rewrite the entire base layout system from scratch")
    expect(prompt).toContain("data-template-slot")
    expect(prompt).toContain("cover, closing, agenda, cards, metric")
    expect(prompt).toContain("image/chart slots")
  })
})

describe("buildDesignsEditPrompt", () => {
  it("instructs the agent to confirm an edit brief before overwriting", () => {
    const prompt = buildDesignsEditPrompt({ name: "neon-finance" })
    expect(prompt).toContain("Do not save files immediately")
    expect(prompt).toContain("overwrite=true")
    expect(prompt).toContain("Ask the user to confirm the edit brief")
    expect(prompt).toContain("/revela design --use neon-finance")
    expect(prompt).toContain("built-in preview from `design.css`")
    expect(prompt).toContain("data-template-slot")
    expect(prompt).toContain(".slide-canvas { width: 1920px; height: 1080px; }")
  })
})

describe("starter built-in design", () => {
  it("has the minimum neutral base coverage for designs-new", () => {
    const designPath = join(import.meta.dir, "..", "designs", "starter", "DESIGN.md")
    expect(existsSync(designPath)).toBe(true)

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
      "toc",
    ]))
    expect(Object.keys(parsed.layouts)).toHaveLength(7)
    expect(Object.keys(parsed.components)).toEqual(expect.arrayContaining([
      "box",
      "text-panel",
      "media",
      "steps",
      "hero",
      "roadmap-horizontal",
      "roadmap-vertical",
    ]))
    expect(Object.keys(parsed.components)).not.toContain("svg-motif")
    expect(Object.keys(parsed.components)).not.toContain("timeline-journey-horizontal")
    expect(Object.keys(parsed.components)).not.toContain("timeline-journey-vertical")
    expect(Object.keys(parsed.components)).toHaveLength(14)
    expect(body).toContain("Visual Schema Rules")
    expect(body).toContain("Visual Motif Rules")
    expect(body).toContain("Content pages need a stable title block")
    expect(body).toContain("Text panels are not decorative rule panels")
    expect(body).toContain("Do not add a default left border, vertical accent bar, yellow/gold rule")
    expect(body).toContain("Source and citation text should use `.source` or `.source-note`, not `.caption`")
    expect(body).toContain('font-family: "Times New Roman", Times, serif')
    expect(body).toContain("font-size: 11px")
    expect(body).toContain("text-transform: none")
    expect(body).toContain("chart-caption source-note")
    expect(body).toContain("table-caption source-note")
    expect(body).toContain(".tjh-axis")
    expect(body).toContain(".tjv-axis")
    expect(body).toContain("tjh-item--up")
    expect(body).toContain("tjv-item--left")

    const textPanel = parsed.components["text-panel"] ?? ""
    expect(textPanel).toContain('class="source"')

    const mediaComponent = parsed.components["media"] ?? ""
    expect(mediaComponent).toContain("media-caption source-note")
    expect(mediaComponent).toContain('font-family: "Times New Roman", Times, serif')

    const chartComponent = parsed.components["echart-panel"] ?? ""
    expect(chartComponent).toContain("chart-caption source-note")

    const tableComponent = parsed.components["data-table"] ?? ""
    expect(tableComponent).toContain("table-caption source-note")

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

describe("summit built-in design", () => {
  it("keeps normal content titles stable and text panels neutral", () => {
    const designPath = join(import.meta.dir, "..", "designs", "summit", "DESIGN.md")
    expect(existsSync(designPath)).toBe(true)

    const raw = readFileSync(designPath, "utf-8")
    const { body } = parseFrontmatter(raw)
    const parsed = parseDesignSections(body)

    expect(Object.keys(parsed.layouts)).toEqual(expect.arrayContaining([
      "narrative",
      "narrative-reverse",
      "highlight-cols",
      "halves",
      "stacked",
      "toc",
    ]))
    expect(Object.keys(parsed.components)).toEqual(expect.arrayContaining([
      "box",
      "text-panel",
      "media",
      "steps",
      "hero",
      "roadmap-horizontal",
      "roadmap-vertical",
    ]))
    expect(Object.keys(parsed.components)).not.toContain("image-title")
    expect(Object.keys(parsed.components)).not.toContain("flow-horizontal")
    expect(Object.keys(parsed.components)).not.toContain("timeline-journey-horizontal")
    expect(Object.keys(parsed.components)).toHaveLength(14)
    expect(body).toContain("Content pages need a stable title block")
    expect(body).toContain("Normal `qa=true` content layouts should start with a slide-level title block")
    expect(body).toContain("Text panels are not decorative rule panels")
    expect(body).toContain("Do not add a default left border, vertical accent bar, yellow/gold rule")
    expect(body).toContain("Summit may use thin rules at the layout level or in `toc`")
    expect(body).toContain("Titles use Title Case, not all caps")
    expect(body).toContain("Titles are Title Case")
    expect(body).toContain("cover h1: `108px` to `124px`, weight `600` to `700`, line-height `0.88` to `0.94`, Title Case")
    expect(body).toContain("Components are transparent by default")
    expect(body).toContain("Component defaults are transparent")
    expect(body).toContain("avoid default container outlines")
    expect(body).toContain("Source and citation text should use `.source` or `.source-note`, not `.caption`")
    expect(body).toContain('font-family: "Times New Roman", Times, serif')
    expect(body).toContain("font-size: 11px")
    expect(body).toContain("text-transform: none")
    expect(body).toContain("chart-caption source-note")
    expect(body).toContain("table-caption source-note")
    expect(body).toContain(".slide-canvas")
    expect(body).toContain("padding: 0;")

    const box = parsed.components["box"] ?? ""
    expect(box).toContain(".box { height: 100%; min-height: 0; padding: 28px; background: transparent;")
    expect(box).not.toContain("border: 1px solid var(--line); background: transparent;")
    expect(box).toContain(".box--paper { background: rgba(247,244,238,0.72); }")

    const media = parsed.components["media"] ?? ""
    expect(media).toContain(".media-frame { position: relative; overflow: hidden; background: transparent;")
    expect(media).toContain("media-caption source-note")
    expect(media).toContain('font-family: "Times New Roman", Times, serif')

    const chart = parsed.components["echart-panel"] ?? ""
    expect(chart).toContain("chart-caption source-note")

    const table = parsed.components["data-table"] ?? ""
    expect(table).toContain("table-caption source-note")

    const toc = parsed.components["toc"] ?? ""
    expect(toc).toContain("font-size: 46px")
    expect(toc).toContain("font-size: 14px")
    expect(toc).toContain("Use generous empty space")
    expect(toc).toContain("background: var(--bg-page)")
    expect(toc).toContain("text-transform: uppercase")
    expect(toc).toContain("justify-content: center")
    expect(toc).toContain("gap: 42px")

    const hero = parsed.components["hero"] ?? ""
    expect(hero).toContain(".image-title h1")
    expect(hero).not.toContain(".image-title h1 {\n    color: #f7f4ee;\n    font-size: 96px;\n    line-height: 0.92;\n    letter-spacing: -0.03em;\n    text-transform: uppercase;")
  })
})

describe("design package authoring", () => {
  it("creates and validates a design package", () => {
    const name = track("test-designs-new-create")
    const result = createDesignPackage({
      name,
      base: "summit",
      designMd: validDesignMd(name),
    })

    expect(result.ok).toBe(true)
    expect(result.name).toBe(name)
    expect(existsSync(join(DESIGNS_DIR, name, "DESIGN.md"))).toBe(true)
    expect(existsSync(join(DESIGNS_DIR, name, "preview.html"))).toBe(false)

    const validation = validateDesignPackage(name)
    expect(validation.ok).toBe(true)
    expect(validation.sections).toContain("foundation")
    expect(validation.layouts).toContain("test-layout")
    expect(validation.components).toContain("test-card")
    expect(validation.components).toContain("test-badge")
  })

  it("creates and validates a CSS-native design package", () => {
    const name = track("test-designs-new-css-package")
    const result = createDesignPackage({
      name,
      base: "summit",
      designMd: validDesignMd(name),
      designCss: validDesignCss(),
    })

    expect(result.ok).toBe(true)
    expect(result.files).toContain("design.css")
    expect(existsSync(join(DESIGNS_DIR, name, "design.css"))).toBe(true)

    const validation = validateDesignPackage(name)
    expect(validation).toMatchObject({ ok: true, hasDesignCss: true })
  })

  it("does not overwrite existing designs by default", () => {
    const name = track("test-designs-new-existing")
    createDesignPackage({ name, designMd: validDesignMd(name) })

    expect(() => createDesignPackage({
      name,
      designMd: validDesignMd(name),
    })).toThrow("already exists")
  })

  it("reports missing required marker sections", () => {
    const name = track("test-designs-new-invalid")
    const dir = join(DESIGNS_DIR, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "DESIGN.md"), `---\nname: ${name}\n---\n\nNo markers`, "utf-8")

    const validation = validateDesignPackage(name)
    expect(validation.ok).toBe(false)
    expect(validation.errors).toContain("DESIGN.md must include marker sections")
  })

  it("rejects CSS-native packages that do not style core template classes", () => {
    const name = track("test-preview-create-size")

    expect(() => createDesignPackage({
      name,
      designMd: validDesignMd(name),
      designCss: ".slide-canvas { width: 1920px; height: 1080px; }",
    })).toThrow("Created design package is invalid")
  })

  it("warns when design contract token families are missing", () => {
    const name = track("test-preview-token-warnings")
    const dir = join(DESIGNS_DIR, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "DESIGN.md"), designMdWithOneComponent(name), "utf-8")

    const validation = validateDesignPackage(name)

    expect(validation.ok).toBe(true)
    expect(validation.warnings.join("\n")).toContain("DESIGN.md/design.css should document grid design tokens or an equivalent contract")
    expect(validation.warnings.join("\n")).toContain("DESIGN.md/design.css should document spacing design tokens or an equivalent contract")
  })

  it("materializes a generated design preview from built-in template fixture and design.css", () => {
    const name = track("test-generated-preview")
    const workspaceRoot = join(import.meta.dir, "..", ".tmp-generated-preview")
    rmSync(workspaceRoot, { recursive: true, force: true })
    createDesignPackage({
      name,
      designMd: validDesignMd(name),
      designCss: validDesignCss(),
    })

    try {
      const preview = materializeDesignPreview({ workspaceRoot, name })
      const html = readFileSync(preview.previewPath, "utf-8")

      expect(preview.ok).toBe(true)
      expect(preview.files).toContain("preview.html")
      expect(preview.files).toContain("design.css")
      expect(preview.previewUrl).toStartWith("file://")
      expect(preview.browserHandoff).toEqual({
        serveRoot: preview.previewDir,
        path: "preview.html",
        urlTemplate: "http://127.0.0.1:<port>/preview.html",
        instructions: expect.stringContaining("Do not open the file:// preview directly."),
      })
      expect(html).toContain('<link rel="stylesheet" href="./design.css">')
      expect(html.match(/class="slide template-slide"/g)).toHaveLength(16)
      expect(html.match(/data-template="milestone"/g)).toHaveLength(1)
      expect(html.match(/data-template="timeline"/g)).toHaveLength(1)
      expect(html).toContain(">milestone<")
      expect(html).toContain(">timeline<")
      expect(html).not.toContain("timeline-roadmap-vertical")
      expect(html).toContain('data-slide-role="cover"')
      expect(html).toContain('data-slide-role="closing"')
      expect(existsSync(join(preview.previewDir, "assets", "report-visual.jpg"))).toBe(true)
      expect(existsSync(join(preview.previewDir, "assets", "card-lens.jpg"))).toBe(true)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
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
