/**
 * lib/commands/disable.ts
 *
 * Handler for `/revela disable` — deactivates slide generation mode.
 */

import { ctx } from "../ctx"

export async function handleDisable(
  send: (text: string) => Promise<void>,
): Promise<void> {
  ctx.enabled = false
  await send(`**Revela disabled.** Slide generation mode is off.`)
}
