/**
 * lib/commands/domains.ts
 *
 * Handlers for domain-related sub-commands:
 *   /revela domains             — list installed domains
 *   /revela domains <name>      — activate a domain
 *   /revela domains-add <url>   — install a domain from URL / github:user/repo / local path
 *   /revela domains-rm <name>   — remove an installed domain
 */

import { listDomains, activeDomain, activateDomain, installDomain, removeDomain } from "../domain/domains"
import { buildPrompt } from "../prompt-builder"

export async function handleDomainsList(
  send: (text: string) => Promise<void>,
): Promise<void> {
  const domains = listDomains()
  const current = activeDomain()
  if (!domains.length) {
    await send(`No domains installed. Use \`/revela domains-add <url>\` to install one.`)
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
    buildPrompt()
    await send(`**Domain activated:** \`${name}\`\nPrompt rebuilt. The new domain context will apply to the next message.`)
  } catch (e: any) {
    await send(`**Error:** ${e.message}`)
  }
}

export async function handleDomainsAdd(
  source: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  if (!source) {
    await send(`**Usage:** \`/revela domains-add <url|github:user/repo|local-path>\``)
    return
  }
  try {
    await send(`Installing domain from \`${source}\`…`)
    const name = await installDomain(source)
    await send(`**Domain installed:** \`${name}\`\nUse \`/revela domains ${name}\` to activate it.`)
  } catch (e: any) {
    await send(`**Install failed:** ${e.message}`)
  }
}

export async function handleDomainsRemove(
  name: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  if (!name) {
    await send(`**Usage:** \`/revela domains-rm <name>\``)
    return
  }
  try {
    removeDomain(name)
    await send(`**Domain removed:** \`${name}\``)
  } catch (e: any) {
    await send(`**Error:** ${e.message}`)
  }
}
