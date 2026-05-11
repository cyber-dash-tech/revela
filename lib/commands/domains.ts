/**
 * lib/commands/domains.ts
 *
 * Handlers for domain-related sub-commands:
 *   /revela domain              — list installed domains
 *   /revela domain --use <name> — activate a domain
 *   /revela domain --add <url>  — install a domain from URL / github:user/repo / local path
 *   /revela domain --rm <name>  — remove an installed domain
 */

import { listDomains, activeDomain, activateDomain, installDomain, removeDomain } from "../domain/domains"
import { buildPrompt } from "../prompt-builder"

export async function handleDomainsList(
  send: (text: string) => Promise<void>,
): Promise<void> {
  const domains = listDomains()
  const current = activeDomain()
  if (!domains.length) {
    await send(`No domains installed. Use \`/revela domain --add <url>\` to install one.`)
    return
  }
  const lines = domains.map((d) => {
    if (d.name === current) {
      return `🟠 **${d.name}**  —  ${d.description || "(no description)"}`
    }
    return `　 ${d.name}  —  ${d.description || "(no description)"}`
  })
  await send(`**Installed domains:**\n\n${lines.join("\n")}`)
}

export async function handleDomainsActivate(
  name: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    activateDomain(name)
    buildPrompt({ mode: "narrative" })
    await send(`**Domain activated:** \`${name}\`\nNarrative prompt rebuilt. Domain reasoning applies now; deck-specific render guidance applies during \`/revela make --deck\`.`)
  } catch (e: any) {
    await send(`**Error:** ${e.message}`)
  }
}

export async function handleDomainsAdd(
  source: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  if (!source) {
    await send(`**Usage:** \`/revela domain --add <url|github:user/repo|local-path>\``)
    return
  }
  try {
    await send(`Installing domain from \`${source}\`…`)
    const name = await installDomain(source)
    await send(`**Domain installed:** \`${name}\`\nUse \`/revela domain --use ${name}\` to activate it.`)
  } catch (e: any) {
    await send(`**Install failed:** ${e.message}`)
  }
}

export async function handleDomainsRemove(
  name: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  if (!name) {
    await send(`**Usage:** \`/revela domain --rm <name>\``)
    return
  }
  try {
    removeDomain(name)
    await send(`**Domain removed:** \`${name}\``)
  } catch (e: any) {
    await send(`**Error:** ${e.message}`)
  }
}
