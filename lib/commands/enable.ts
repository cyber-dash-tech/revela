/**
 * lib/commands/enable.ts
 *
 * Handler for `/revela enable` — activates Revela ambient narrative mode.
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

  // Always rebuild narrative mode on enable. A prior `/revela make deck` handoff may
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
      `**Revela ambient mode enabled (with warnings).** Narrative mode is active for normal chat, ` +
      `but the prompt file could not be built. ` +
      `Try \`/revela disable\` then \`/revela enable\` again, or check that the package is correctly installed.\n\n` +
      `Design: \`${design}\` · Domain: \`${domain}\``
    )
    return
  }

  log.info("revela enabled", { design, domain })
  await send(
    `**Revela ambient mode enabled.** Normal chat will stay in Revela narrative mode.\n` +
    `Design: \`${design}\` · Domain: \`${domain}\`\n\n` +
    `Explicit workflow commands like \`/revela init\`, \`/revela story\`, and \`/revela make deck\` work without enabling first. ` +
    `Use \`/revela disable\` to return normal chat to plain OpenCode mode.`
  )
}
