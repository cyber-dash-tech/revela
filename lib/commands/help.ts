/**
 * lib/commands/help.ts
 *
 * Handler for `/revela` (no sub-command) — shows status and command reference.
 */

import { activeDesign } from "../design/designs"
import { activeDomain } from "../domain/domains"
import { ctx } from "../ctx"

export async function handleHelp(
  send: (text: string) => Promise<void>,
): Promise<void> {
  const design = activeDesign()
  const domain = activeDomain()
  const status = ctx.enabled ? "enabled ✓" : "disabled"
  await send(
    `\`\`\`\n` +
    `             R E V E L A\n` +
    `\`\`\`\n` +
    `**Status:** ${status}\n` +
    `🟠 **Design:** \`${design}\`\n` +
    `🟠 **Domain:** \`${domain}\`\n\n` +
    `---\n\n` +
    `**Commands**\n\n` +
    `\`/revela enable\`              — enable slide generation mode\n` +
    `\`/revela disable\`             — disable slide generation mode\n` +
    `\`/revela designs\`             — list installed designs\n` +
    `\`/revela designs <name>\`      — activate a design\n` +
    `\`/revela domains\`             — list installed domains\n` +
    `\`/revela domains <name>\`      — activate a domain\n` +
    `\`/revela designs-add <url>\`   — install a design from URL / github:user/repo\n` +
    `\`/revela domains-add <url>\`   — install a domain from URL / github:user/repo`
  )
}
