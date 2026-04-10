/**
 * lib/commands/designs.ts
 *
 * Handlers for design-related sub-commands:
 *   /revela designs             — list installed designs
 *   /revela designs <name>      — activate a design
 *   /revela designs-add <url>   — install a design from URL / github:user/repo / local path
 */

import { listDesigns, activeDesign, activateDesign, installDesign } from "../design/designs"
import { buildPrompt } from "../prompt-builder"

export async function handleDesignsList(
  send: (text: string) => Promise<void>,
): Promise<void> {
  const designs = listDesigns()
  const current = activeDesign()
  if (!designs.length) {
    await send(`No designs installed. Use \`/revela designs-add <url>\` to install one.`)
    return
  }
  const lines = designs.map((d) => {
    if (d.name === current) {
      return `🟠 **${d.name}**  —  ${d.description || "(no description)"}`
    }
    return `　 ${d.name}  —  ${d.description || "(no description)"}`
  })
  await send(`**Installed designs:**\n\n${lines.join("\n")}`)
}

export async function handleDesignsActivate(
  name: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    activateDesign(name)
    buildPrompt()
    await send(`**Design activated:** \`${name}\`\nPrompt rebuilt. The new visual style will apply to the next message.`)
  } catch (e: any) {
    await send(`**Error:** ${e.message}`)
  }
}

export async function handleDesignsAdd(
  source: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  if (!source) {
    await send(`**Usage:** \`/revela designs-add <url|github:user/repo|local-path>\``)
    return
  }
  try {
    await send(`Installing design from \`${source}\`…`)
    const name = await installDesign(source)
    await send(`**Design installed:** \`${name}\`\nUse \`/revela designs ${name}\` to activate it.`)
  } catch (e: any) {
    await send(`**Install failed:** ${e.message}`)
  }
}
