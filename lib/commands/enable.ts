/**
 * lib/commands/enable.ts
 *
 * Handler for `/revela enable` — activates Revela narrative/artifact mode.
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

  // Always rebuild narrative mode on enable. A prior `/revela deck` handoff may
  // have intentionally switched the active prompt to deck-render mode.
  if (!existsSync(ACTIVE_PROMPT_FILE)) {
    log.warn("active prompt file missing on enable — rebuilding", { promptFile: ACTIVE_PROMPT_FILE })
  }
  try {
    buildPrompt({ mode: "narrative" })
    log.info("narrative prompt rebuilt on enable", { design, domain, promptFile: ACTIVE_PROMPT_FILE })
  } catch (e) {
    log.error("prompt rebuild failed on enable", { error: e instanceof Error ? e.message : String(e) })
    await send(
      `**Revela enabled (with warnings).** Narrative/artifact mode is active, ` +
      `but the prompt file could not be built. ` +
      `Try \`/revela disable\` then \`/revela enable\` again, or check that the package is correctly installed.\n\n` +
      `Design: \`${design}\` · Domain: \`${domain}\``
    )
    return
  }

  log.info("revela enabled", { design, domain })
  await send(
    `**Revela enabled.** Narrative/artifact mode is now active.\n` +
    `Design: \`${design}\` · Domain: \`${domain}\`\n\n` +
    `The narrative-first prompt will be injected into every message. ` +
    `Use \`/revela deck\` when you are ready to enter deck-render mode.`
  )
}
