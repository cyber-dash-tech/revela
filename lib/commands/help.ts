/**
 * lib/commands/help.ts
 *
 * Handler for `/revela` (no sub-command) — shows status and command reference.
 */

import { activeDesign } from "../design/designs"
import { activeDomain } from "../domain/domains"
import { ctx } from "../ctx"
import pkg from "../../package.json"

export async function handleHelp(
  send: (text: string) => Promise<void>,
): Promise<void> {
  const design = activeDesign()
  const domain = activeDomain()
  const status = ctx.enabled ? "enabled - Revela prompt is loaded" : "disabled - run `/revela enable` or any workflow command"
  await send(
    `\`\`\`\n` +
    `             R E V E L A   H e l p   v${pkg.version}\n` +
    `\`\`\`\n` +
    `Turn source materials, research, and deck plans into trusted, traceable decision artifacts.\n\n` +
    `**Current**\n\n` +
    `Status: ${status}\n` +
    `Design: \`${design}\`\n` +
    `Domain: \`${domain}\`\n` +
    `Run \`/revela enable\` to load Revela context without starting a workflow, or run \`/revela disable\` to pause it. Workflow commands still auto-enable Revela.\n\n` +
    `---\n\n` +
    `**Workflow**\n\n` +
    `1. \`init\` — discover and review local source materials\n` +
    `2. \`research\` — save source-linked findings for the deck objective\n` +
    `3. \`plan --deck\` — create deck-plan/ from materials, research, and user intent\n` +
    `4. \`make --deck\` — generate HTML deck from deck-plan/\n` +
    `5. \`review --deck\` — QA and comment on rendered deck artifacts\n` +
    `6. \`export\` — export deck artifacts to PDF, PPTX, or PNG\n\n` +
    `---\n\n` +
    `**Commands**\n\n` +
    `\`/revela\`                                      — show REVELA help\n` +
    `\`/revela enable\`                               — enable Revela prompt/context without starting a workflow\n` +
    `\`/revela disable\`                              — disable Revela prompt/context for this session\n` +
    `\`/revela init\`                                 — discover local sources, extract materials, and capture deck intent\n` +
    `\`/revela research\`                             — research and save source-linked deck findings\n` +
    `\`/revela plan --deck\`                          — create or update deck-plan/ from materials and research\n` +
    `\`/revela make --deck\`                          — make a deck from deck-plan/\n` +
    `\`/revela review --deck\`                        — open deck QA and comment workspace\n` +
    `\`/revela export --deck pdf [file.html]\`         — export HTML deck to PDF\n` +
    `\`/revela export --deck pptx [file.html] [--notes]\` — export HTML deck to PPTX\n` +
    `\`/revela export --deck png [file.html]\`         — export HTML deck to per-slide PNG files\n` +
    `\`/revela design\`                               — list installed designs\n` +
    `\`/revela design --use <name>\`                  — activate a design\n` +
    `\`/revela design --preview [name]\`              — open a design preview in browser\n` +
    `\`/revela design --new <name>\`                  — create a custom design with AI\n` +
    `\`/revela design --edit <name>\`                 — refine an existing custom design with AI\n` +
    `\`/revela design --add <source>\`                — install a design from URL / github:user/repo / local path\n` +
    `\`/revela design --rm <name>\`                   — remove an installed design\n` +
    `\`/revela domain\`                               — list installed domains\n` +
    `\`/revela domain --use <name>\`                  — activate a domain\n` +
    `\`/revela domain --add <source>\`                — install a domain from URL / github:user/repo / local path\n` +
    `\`/revela domain --rm <name>\`                   — remove an installed domain`
  )
}
