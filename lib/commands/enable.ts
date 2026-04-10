/**
 * lib/commands/enable.ts
 *
 * Handler for `/revela enable` — activates slide generation mode.
 */

import { activeDesign } from "../design/designs"
import { activeDomain } from "../domain/domains"
import { ctx } from "../ctx"

export async function handleEnable(
  send: (text: string) => Promise<void>,
): Promise<void> {
  ctx.enabled = true
  const design = activeDesign()
  const domain = activeDomain()
  await send(
    `**Revela enabled.** Slide generation mode is now active.\n` +
    `Design: \`${design}\` · Domain: \`${domain}\`\n\n` +
    `The three-layer slide generation prompt will be injected into every message. ` +
    `Describe your presentation to get started.`
  )
}
