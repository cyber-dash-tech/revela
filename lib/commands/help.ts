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
  const status = ctx.enabled ? "enabled ✓" : "disabled"
  await send(
    `\`\`\`\n` +
    `             R E V E L A   H e l p   v${pkg.version}\n` +
    `\`\`\`\n` +
    `Turn source materials, research, and narrative state into trusted, traceable decision artifacts.\n\n` +
    `**Current**\n\n` +
    `Status: ${status}\n` +
    `Design: \`${design}\`\n` +
    `Domain: \`${domain}\`\n\n` +
    `---\n\n` +
    `**Workflow**\n\n` +
    `1. \`init\` — discover workspace sources and capture intent\n` +
    `2. \`research\` — close evidence gaps and bind support\n` +
    `3. \`story\` — inspect audience, thesis, claims, evidence, risks, and approval\n` +
    `4. \`make\` — generate deck or brief from approved story state\n` +
    `5. \`review\` — comment on and inspect rendered deck artifacts\n` +
    `6. \`export\` — export deck artifacts to PDF or PPTX\n\n` +
    `---\n\n` +
    `**Commands**\n\n` +
    `\`/revela\`                                      — show REVELA help\n` +
    `\`/revela init\`                                 — initialize or refresh workspace story state\n` +
    `\`/revela research\`                             — research, bind evidence, and reduce story gaps\n` +
    `\`/revela story [-l language]\`                   — open the read-only story workspace UI\n` +
    `\`/revela make --deck\`                          — make a deck from approved story state\n` +
    `\`/revela make --brief [file.md]\`                — render executive brief from approved story\n` +
    `\`/revela review --deck\`                        — open deck reading, insight, and comment workspace\n` +
    `\`/revela export --deck pdf [file.html]\`         — export HTML deck to PDF\n` +
    `\`/revela export --deck pptx [file.html] [--notes]\` — export HTML deck to PPTX\n` +
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
