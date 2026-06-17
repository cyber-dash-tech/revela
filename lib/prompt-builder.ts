/**
 * Prompt builder — assembles Revela system prompts.
 *
 * Narrative mode:
 *   Layer 1: NARRATIVE_SKILL.md — audience/decision/claim/evidence readiness
 *   Layer 2: DOMAIN.md          — domain reasoning guidance when present
 *
 * Deck-render mode:
 *   Layer 1: SKILL.md           — legacy deck render protocol (HTML rules, quality)
 *   Layer 2: DESIGN.md          — visual style (colors, fonts, animations, layout)
 *
 * Domain guidance is intentionally narrative-only. Deck-render mode must render
 * the approved canonical narrative instead of re-interpreting domain semantics.
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

export type PromptMode = "narrative" | "deck-render"

export interface BuildPromptOptions {
  mode?: PromptMode
  designName?: string
  domainName?: string
}

/** Path to deck-render SKILL.md shipped with this package. */
const SKILL_MD_PATH = resolve(__dirname, "..", "skill", "SKILL.md")
const NARRATIVE_SKILL_MD_PATH = resolve(__dirname, "..", "skill", "NARRATIVE_SKILL.md")

/**
 * Build the active system prompt and write it to _active-prompt.md.
 *
 * Backward-compatible call form:
 * - buildPrompt() builds the default narrative prompt.
 * - buildPrompt("aurora", "general") builds the default narrative prompt with active metadata overrides.
 *
 * New call form:
 * - buildPrompt({ mode: "narrative" }) avoids design/HTML instructions.
 * - buildPrompt({ mode: "deck-render" }) preserves the legacy deck render prompt.
 *
 * @returns The path to the written file.
 */
export function buildPrompt(options?: BuildPromptOptions): string
export function buildPrompt(designName?: string, domainName?: string): string
export function buildPrompt(optionsOrDesignName?: BuildPromptOptions | string, legacyDomainName?: string): string {
  const options = typeof optionsOrDesignName === "object" && optionsOrDesignName !== null
    ? optionsOrDesignName
    : { designName: optionsOrDesignName, domainName: legacyDomainName }
  const mode: PromptMode = options.mode || "narrative"
  const design = options.designName || activeDesign()
  const domain = options.domainName || activeDomain()

  // Layer 1 — core skill for the selected prompt mode.
  const coreSkill = readFileSync(mode === "deck-render" ? SKILL_MD_PATH : NARRATIVE_SKILL_MD_PATH, "utf-8")

  // Check for CSS-native design styling.
  const designDir = join(DESIGNS_DIR, design)
  const hasDesignCss = existsSync(join(designDir, "design.css"))
  const previewLine = hasDesignCss
    ? "<!--   - design.css — executable design styling; generated previews use the built-in page template fixture -->"
    : "<!--   - (no design.css for this design; compatibility CSS may be generated from DESIGN.md) -->"

  // Layer 2 — DOMAIN.md skill text (narrative mode only). Deck-render mode
  // renders the approved canonical narrative and must not re-interpret domain
  // semantics from the full domain prompt.
  let domainSkill = ""
  if (mode === "narrative") {
    try {
      domainSkill = getDomainSkillMd(domain)
    } catch (e) {
      // Domain not installed or empty — proceed without domain layer
      promptLog.warn("domain skill not found — building without domain layer", {
        domain,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // DESIGN.md: deck-render only. Narrative mode must not inject
  // visual CSS, layout catalogs, component indexes, or HTML skeleton rules.
  const designSkill = mode === "deck-render" ? buildDesignLayer(design) : ""

  // Assemble header
  const header = mode === "deck-render"
    ? `<!-- Revela prompt mode: deck-render -->\n` +
      `<!-- Active design: ${design} -->\n` +
      `<!-- Active domain: ${domain} (not injected in deck-render mode) -->\n` +
      `<!-- Design files: ${designDir}/ -->\n` +
      `<!--   - DESIGN.md — metadata + style instructions (injected below) -->\n` +
      `${previewLine}\n\n`
    : `<!-- Revela prompt mode: narrative -->\n` +
      `<!-- Active domain: ${domain} -->\n` +
      `<!-- Design layer intentionally omitted in narrative mode. Use deck-render mode before writing deck artifacts. -->\n\n`

  // Concatenation: Header → Skill → Domain (narrative only) → Design (deck-render only)
  const parts = [header, coreSkill]
  if (domainSkill) {
    parts.push(`\n\n---\n\n${domainSkill}`)
  }
  if (designSkill) {
    parts.push(`\n\n---\n\n${designSkill}`)
  }

  const prompt = parts.join("")

  // Write to _active-prompt.md
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(ACTIVE_PROMPT_FILE, prompt, "utf-8")
  promptLog.info("prompt rebuilt", { mode, design, domain, bytes: prompt.length })

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
    layerParts.push([
      "Components marked `✓` in the Contract column have required internal structure.",
      "Fetch the component details before using them and preserve the required DOM/classes instead of hand-rolling a simpler lookalike.",
    ].join(" "))
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
      "| Design composition and usage rules | `section: \"rules\"` |",
      "| Layout HTML/CSS details | `layout: \"<name>\"` (see Layout Index above) |",
      "| Component CSS/HTML details | `component: \"<name>\"` (see Component Index above) |",
      "| Data Visualization (ECharts) | `section: \"chart-rules\"` |",
    ].join("\n"),
  )

  return layerParts.join("\n\n---\n\n")
}
