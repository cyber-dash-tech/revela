/**
 * Prompt builder — assembles the three-layer system prompt.
 *
 * Layer 1: SKILL.md     — core protocol (conversation flow, HTML rules, quality)
 * Layer 2: DOMAIN.md    — domain knowledge (report structure, terminology)
 * Layer 3: DESIGN.md    — visual style (colors, fonts, animations, layout)
 *
 * When the active DESIGN.md has @section markers, only the global section,
 * layouts section, and a generated component index are injected into the
 * system prompt. Components, charts, and guide sections are available on
 * demand via the revela-designs tool read action.
 *
 * When no markers are present (third-party designs), the full DESIGN.md body
 * is injected unchanged (backward-compatible fallback).
 *
 * The combined prompt is written to ~/.config/revela/_active-prompt.md
 * and referenced by agents via `{file:~/.config/revela/_active-prompt.md}`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, resolve } from "path"
import {
  CONFIG_DIR,
  DESIGNS_DIR,
  ACTIVE_PROMPT_FILE,
} from "./config"
import {
  activeDesign,
  getDesignSkillMd,
  parseDesignSections,
  generateComponentIndex,
  generateLayoutIndex,
} from "./design/designs"
import { activeDomain, getDomainSkillMd } from "./domain/domains"
import { parseFrontmatter } from "./frontmatter"
import { childLog } from "./log"

const promptLog = childLog("prompt-builder")

/** Path to SKILL.md shipped with this package. */
const SKILL_MD_PATH = resolve(__dirname, "..", "skill", "SKILL.md")

/**
 * Build the combined system prompt and write it to _active-prompt.md.
 *
 * @param designName - Override design (defaults to active)
 * @param domainName - Override domain (defaults to active)
 * @returns The path to the written file.
 */
export function buildPrompt(designName?: string, domainName?: string): string {
  const design = designName || activeDesign()
  const domain = domainName || activeDomain()

  // Layer 1 — SKILL.md
  const coreSkill = readFileSync(SKILL_MD_PATH, "utf-8")

  // Check for preview.html
  const designDir = join(DESIGNS_DIR, design)
  const hasPreview = existsSync(join(designDir, "preview.html"))
  const previewLine = hasPreview
    ? "<!--   - preview.html — canonical visual reference (read this before generating slides) -->"
    : "<!--   - (no preview.html for this design) -->"

  // Layer 2 — DOMAIN.md skill text (may be empty for "general")
  let domainSkill = ""
  try {
    domainSkill = getDomainSkillMd(domain)
  } catch (e) {
    // Domain not installed or empty — proceed without domain layer
    promptLog.warn("domain skill not found — building without domain layer", {
      domain,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // Layer 3 — DESIGN.md: marker-aware or full-text fallback
  const designSkill = buildDesignLayer(design)

  // Assemble header
  const header =
    `<!-- Active design: ${design} -->\n` +
    `<!-- Active domain: ${domain} -->\n` +
    `<!-- Design files: ${designDir}/ -->\n` +
    `<!--   - DESIGN.md — metadata + style instructions (injected below) -->\n` +
    `${previewLine}\n\n`

  // Three-layer concatenation: Header → SKILL → Domain → Design
  const parts = [header, coreSkill]
  if (domainSkill) {
    parts.push(`\n\n---\n\n${domainSkill}`)
  }
  parts.push(`\n\n---\n\n${designSkill}`)

  const prompt = parts.join("")

  // Write to _active-prompt.md
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(ACTIVE_PROMPT_FILE, prompt, "utf-8")
  promptLog.info("prompt rebuilt", { design, domain, bytes: prompt.length })

  return ACTIVE_PROMPT_FILE
}

/**
 * Build the design layer text.
 *
 * If the DESIGN.md has markers:
 *   - Always include @design:foundation (colors, fonts, CSS, JS, HTML skeleton)
 *   - Always include @design:rules (composition rules, do/don't — always resident)
 *   - Always include generated Layout Index (with QA column)
 *   - Always include generated Component Index
 *   - Omit individual layout details, component details, @design:chart-rules
 *     (available on demand via revela-designs tool)
 *
 * If no markers: return the full DESIGN.md body unchanged (backward compat).
 */
function buildDesignLayer(designName: string): string {
  const mdPath = join(DESIGNS_DIR, designName, "DESIGN.md")
  if (!existsSync(mdPath)) {
    throw new Error(`Design '${designName}' is not installed`)
  }

  const raw = readFileSync(mdPath, "utf-8")
  const { body } = parseFrontmatter(raw)
  const { sections, layouts, components, hasMarkers } = parseDesignSections(body)

  if (!hasMarkers) {
    // Backward-compatible: full text injection
    return body
  }

  const layerParts: string[] = []

  // 1. Foundation section (colors, typography, CSS vars, JS, HTML skeleton)
  if (sections["foundation"]) {
    layerParts.push(sections["foundation"])
  }

  // 2. Rules section (composition rules, do/don't — always resident)
  if (sections["rules"]) {
    layerParts.push(sections["rules"])
  }

  // 3. Layout Index — compact catalog with QA column
  const layoutIndex = generateLayoutIndex(layouts)
  if (layoutIndex) {
    layerParts.push(layoutIndex)
  }

  // 4. Component Index — compact catalog
  const componentIndex = generateComponentIndex(components)
  if (componentIndex) {
    layerParts.push(componentIndex)
  }

  // 5. On-demand note
  layerParts.push(
    [
      "### On-Demand Design Sections",
      "",
      "The following design sections are available on demand. Fetch them with",
      "the `revela-designs` tool (`action: \"read\"`) before using them:",
      "",
      "| Section | Fetch with |",
      "|---|---|",
      "| Layout HTML/CSS details | `layout: \"<name>\"` (see Layout Index above) |",
      "| Component CSS/HTML details | `component: \"<name>\"` (see Component Index above) |",
      "| Data Visualization (ECharts) | `section: \"chart-rules\"` |",
    ].join("\n"),
  )

  return layerParts.join("\n\n---\n\n")
}
