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
    `             R E V E L A   v${pkg.version}\n` +
    `\`\`\`\n` +
    `**Status:** ${status}\n` +
    `🟠 **Design:** \`${design}\`\n` +
    `🟠 **Domain:** \`${domain}\`\n\n` +
    `---\n\n` +
    `**Commands**\n\n` +
    `\`/revela enable\`              — enable Revela narrative/artifact mode\n` +
    `\`/revela disable\`             — disable Revela mode\n` +
    `\`/revela init\`                — initialize or refresh workspace DECKS.json\n` +
    `\`/revela review\`              — review narrative readiness and approval state\n` +
    `\`/revela deck --review\`       — review deck/artifact readiness before writing HTML\n` +
    `\`/revela refine\`              — open unified Edit/Inspect refinement workspace\n` +
    `\`/revela edit\`                — open visual editor for the only deck in decks/\n` +
    `\`/revela inspect\`             — open Evidence Inspector for click-to-inspect review\n` +
    `\`/revela remember <text>\`     — save an explicit preference to DECKS.json\n` +
    `\`/revela designs\`             — list installed designs\n` +
    `\`/revela designs <name>\`      — activate a design\n` +
    `\`/revela designs-new <name>\`  — create a new custom design with AI\n` +
    `\`/revela designs-edit <name>\` — refine an existing custom design with AI\n` +
    `\`/revela designs-preview [name]\` — open a design preview in browser\n` +
    `\`/revela domains\`             — list installed domains\n` +
    `\`/revela domains <name>\`      — activate a domain\n` +
    `\`/revela designs-add <url>\`   — install a design from URL / github:user/repo\n` +
    `\`/revela domains-add <url>\`   — install a domain from URL / github:user/repo\n` +
    `\`/revela designs-rm <name>\`   — remove an installed design\n` +
    `\`/revela domains-rm <name>\`   — remove an installed domain\n` +
    `\`/revela pdf <file>\`          — export HTML slide deck to PDF\n` +
    `\`/revela pptx [file] [--notes]\` — export HTML slide deck to PPTX`
  )
}
