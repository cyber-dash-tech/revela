/**
 * lib/commands/enable.ts
 *
 * Handler for `/revela enable` — activates slide generation mode.
 */

import { existsSync } from "fs"
import { activeDesign } from "../design/designs"
import { activeDomain } from "../domain/domains"
import { ctx } from "../ctx"
import { ACTIVE_PROMPT_FILE } from "../config"
import { buildPrompt } from "../prompt-builder"
import { log } from "../log"

export async function handleEnable(
  send: (text: string) => Promise<void>,
): Promise<void> {
  ctx.enabled = true
  const design = activeDesign()
  const domain = activeDomain()

  // Health check: ensure the active prompt file exists.
  // If startup failed (e.g. SKILL.md missing), rebuild now so the user gets a working session.
  if (!existsSync(ACTIVE_PROMPT_FILE)) {
    log.warn("active prompt file missing on enable — rebuilding", { promptFile: ACTIVE_PROMPT_FILE })
    try {
      buildPrompt()
      log.info("prompt rebuilt on enable", { design, domain, promptFile: ACTIVE_PROMPT_FILE })
    } catch (e) {
      log.error("prompt rebuild failed on enable", { error: e instanceof Error ? e.message : String(e) })
      await send(
        `**Revela enabled (with warnings).** Slide generation mode is active, ` +
        `but the prompt file could not be built. ` +
        `Try \`/revela disable\` then \`/revela enable\` again, or check that the package is correctly installed.\n\n` +
        `Design: \`${design}\` · Domain: \`${domain}\``
      )
      return
    }
  }

  log.info("revela enabled", { design, domain })
  await send(
    `**Revela enabled.** Slide generation mode is now active.\n` +
    `Design: \`${design}\` · Domain: \`${domain}\`\n\n` +
    `The three-layer slide generation prompt will be injected into every message. ` +
    `Describe your presentation to get started.`
  )
}
