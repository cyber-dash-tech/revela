export interface DesignsNewArgs {
  name: string
  base: string
}

export type DesignsNewParseResult =
  | { ok: true; name: string; base: string }
  | { ok: false; error: string }

export type DesignsEditParseResult =
  | { ok: true; name: string }
  | { ok: false; error: string }

const USAGE =
  "**Usage:** `/revela design --new <kebab-case-name> [--base starter]`\n" +
  "Example: `/revela design --new neon-finance --base starter`"

const EDIT_USAGE =
  "**Usage:** `/revela design --edit <kebab-case-name>`\n" +
  "Example: `/revela design --edit neon-finance`"

function isValidDesignName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)
}

export function parseDesignsNewArgs(input: string): DesignsNewParseResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { ok: false, error: USAGE }

  const name = tokens[0]
  if (!isValidDesignName(name)) {
    return {
      ok: false,
      error: `${USAGE}\n\nDesign name must be kebab-case using lowercase letters, numbers, and hyphens.`,
    }
  }

  let base = "starter"
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === "--base") {
      const value = tokens[i + 1]
      if (!value) return { ok: false, error: `${USAGE}\n\nMissing value for --base.` }
      if (!isValidDesignName(value)) {
        return { ok: false, error: `${USAGE}\n\nBase design must be a valid kebab-case design name.` }
      }
      base = value
      i++
      continue
    }
    return { ok: false, error: `${USAGE}\n\nUnknown option: \`${token}\`` }
  }

  return { ok: true, name, base }
}

export function parseDesignsEditArgs(input: string): DesignsEditParseResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (tokens.length !== 1) return { ok: false, error: EDIT_USAGE }

  const name = tokens[0]
  if (!isValidDesignName(name)) {
    return {
      ok: false,
      error: `${EDIT_USAGE}\n\nDesign name must be kebab-case using lowercase letters, numbers, and hyphens.`,
    }
  }

  return { ok: true, name }
}

const VISUAL_QUALITY_RULES = `Visual extraction and CSS quality rules:
- Before writing CSS, extract a visual schema from the user's references. Include reference type, composition, scale, anchoring, typography relationship, decorative language, must-preserve, and must-avoid.
- Preserve composition, not just colors and shapes. If the reference is a bottom strip, compact badge, side rail, or sparse header mark, keep that scale and anchoring; do not enlarge it into a full-slide mascot or background unless requested.
- Do not rewrite the entire base layout system from scratch. Preserve base layout/container CSS where possible; mainly change tokens, typography, component skins, and small decorative components.
- Keep CSS scoped and boring. Prefer CSS variables and reusable classes over many one-off absolute-positioned selectors.
- Treat the design as an executable visual system, not a mood board. Document grid, safe-area, spacing, type scale, surface, and chart tokens in \`@design:foundation\`.
- Layouts must use declared slots and stable grid/flex containers. Do not fake alignment with scattered one-off absolute positioning when a layout grid should own placement.
- Components must declare normal, dense, and long-copy behavior when relevant. Chart, table, media, and source-note components need stable container dimensions.
- If a reference is flat vector, doodle, mascot, blob, line-art, or geometric illustration, prefer a self-contained SVG component with a fixed viewBox. CSS should place the SVG; the SVG should draw the motif.
- If a reference is photography, UI screenshot, webpage, or product surface, do not convert it to SVG. Extract palette, type scale, spacing, layout rhythm, borders, and image treatment instead.
- For SVG motifs: set a viewBox, keep all eyes/mouths/decorations inside that coordinate system, and document intended placement/scale in the component notes.
- Before saving, generate the built-in template preview with the new design CSS and review it for text overlap, scale drift, lost anchoring, overflow, and whether the preview preserves the reference composition.`

const PREVIEW_REQUIREMENTS = `Preview requirements:
- Do not hand-write package \`preview.html\` for ordinary CSS-native designs.
- The preview is generated from Revela's built-in page-template fixture plus the package \`design.css\`.
- \`design.css\` must style the stable template DOM classes while preserving structural classes and \`data-template-slot\` semantics.
- Preview review should check cover, closing, agenda, cards, metric, chart takeaways, table, timeline, process steps, recommendation, risk, and image/chart slots.
- If the design uses package assets, keep them under \`assets/**\` and reference them from \`design.css\` with package-relative paths.`

export function buildDesignsNewPrompt({ name, base }: DesignsNewArgs): string {
  return `You are creating a new Revela visual design package.

Target design:
- name: ${name}
- base design: ${base}

Use the base design only as a structural scaffold. Preserve its structure, not its visual identity.

You must preserve from the base design:
- marker structure: @design, @layout, and @component blocks
- layout taxonomy and component coverage
- HTML skeleton and SlidePresentation JavaScript architecture
- 1920x1080 fixed canvas behavior
- slide-qa usage on every slide
- QA-friendly class vocabulary discipline

You must replace unless the user explicitly requests otherwise:
- palette
- typography
- imagery direction
- decorative language
- tone
- composition rules
- design.css content

${VISUAL_QUALITY_RULES}

${PREVIEW_REQUIREMENTS}

Workflow:
1. Do not generate or save files immediately.
2. Interview the user first. Ask for visual references such as screenshots/images, webpage URLs, text descriptions, brands, or decks they like.
3. Extract a visual schema from the references before proposing CSS or components.
4. Collect a concise design brief covering intent, tone, density, content mode, industry fit, references, visual schema, must-have, and must-avoid.
5. Summarize the brief and visual schema, then ask the user to confirm them.
6. After confirmation, inspect the base design using the \`revela-designs\` tool.
7. Generate a complete \`DESIGN.md\` and matching \`design.css\`.
8. Save a draft package, generate the built-in preview from \`design.css\`, and self-review the preview against the visual schema.
9. Save the package with \`revela-designs-author\` using action \`create\`.
10. Validate it with \`revela-designs-author\` using action \`validate\`.
11. Report the saved path and activation command: \`/revela design --use ${name}\`.

Hard requirements:
- \`DESIGN.md\` must include frontmatter with name, description, author, and version.
- \`DESIGN.md\` must include valid \`@design\`, \`@layout\`, and \`@component\` markers.
- \`DESIGN.md\` must include at least \`@design:foundation\`, \`@design:rules\`, one layout, and one component.
- \`DESIGN.md\` should document the design contract: grid/safe-area, spacing scale, typography scale, surfaces, and chart tokens when charts are supported.
- \`design.css\` must include fixed \`.slide-canvas { width: 1920px; height: 1080px; }\` behavior and style the core template classes.
- Do not save anything until the user confirms the brief.

Start now by interviewing the user. Keep the first question concise.`
}

export function buildDesignsEditPrompt({ name }: { name: string }): string {
  return `You are editing an existing Revela visual design package.

Target design:
- name: ${name}

Goal:
- Refine the existing design without losing its useful layout/component coverage.
- Preserve the design's established structure unless the user explicitly asks to change it.
- Save the edited design only after the user confirms the edit brief.

${VISUAL_QUALITY_RULES}

${PREVIEW_REQUIREMENTS}

Workflow:
1. Do not save files immediately.
2. Ask the user what they want to change. Accept text descriptions, screenshots/images, webpage URLs, or specific complaints about the current preview.
3. Inspect the existing design using \`revela-designs\` with action \`read\` and name \`${name}\`. Fetch relevant layouts/components as needed.
4. Summarize an edit brief covering current issue, desired direction, visual schema, must-preserve, and must-avoid.
5. Ask the user to confirm the edit brief.
6. After confirmation, generate the updated complete \`DESIGN.md\` and updated complete \`design.css\`.
7. Save a draft package, generate the built-in preview from \`design.css\`, and self-review it for text overlap, scale drift, lost anchoring, overflow, and whether the requested change is visible.
8. Save with \`revela-designs-author\` using action \`create\`, name \`${name}\`, and overwrite=true.
9. Validate with \`revela-designs-author\` using action \`validate\`.
10. Report the saved path and activation command: \`/revela design --use ${name}\`.

Hard requirements:
- Preserve valid frontmatter and marker structure.
- Preserve at least \`@design:foundation\`, \`@design:rules\`, one layout, and one component.
- Preserve or add the design contract: grid/safe-area, spacing scale, typography scale, surfaces, and chart tokens when charts are supported.
- \`design.css\` must include fixed \`.slide-canvas { width: 1920px; height: 1080px; }\` behavior and style the core template classes.
- Do not save anything until the user confirms the edit brief.

Start now by asking what the user wants to change in \`${name}\`.`
}
