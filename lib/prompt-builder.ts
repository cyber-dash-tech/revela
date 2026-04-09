/**
 * Prompt builder — assembles the three-layer system prompt.
 *
 * Layer 1: SKILL.md     — core protocol (conversation flow, HTML rules, quality)
 * Layer 2: DOMAIN.md    — domain knowledge (report structure, terminology)
 * Layer 3: DESIGN.md    — visual style (colors, fonts, animations, layout)
 *
 * The combined prompt is written to ~/.config/slides-it/_active-prompt.md
 * and referenced by agents via `{file:~/.config/revela/_active-prompt.md}`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, resolve } from "path"
import {
  CONFIG_DIR,
  DESIGNS_DIR,
  ACTIVE_PROMPT_FILE,
} from "./config"
import { activeDesign, getDesignSkillMd } from "./designs"
import { activeDomain, getDomainSkillMd } from "./domains"

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

  // Layer 3 — DESIGN.md skill text
  const designSkill = getDesignSkillMd(design)

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
  } catch {
    // Domain not installed or empty — that's fine
  }

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

  return ACTIVE_PROMPT_FILE
}
