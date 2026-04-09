import { tool } from "@opencode-ai/plugin"
import {
  listDomains,
  activeDomain,
  activateDomain,
  installDomain,
  removeDomain,
} from "../lib/domains"
import { buildPrompt } from "../lib/prompt-builder"

export default tool({
  description:
    "Manage revela domain definitions (industry/topic specializations). " +
    "Use action 'list' to show all installed domains with names and descriptions. " +
    "Use action 'activate' to switch to a different domain (requires name). " +
    "Use action 'install' to add a new domain from a URL, local path, or github:user/repo shorthand (requires source). " +
    "Use action 'remove' to uninstall a domain — 'general' cannot be removed (requires name). " +
    "After activating a new domain, the system prompt is automatically rebuilt.",
  args: {
    action: tool.schema
      .enum(["list", "activate", "install", "remove"])
      .describe("Operation to perform"),
    name: tool.schema
      .string()
      .optional()
      .describe("Domain name — required for activate and remove"),
    source: tool.schema
      .string()
      .optional()
      .describe("Install source — URL, local path, github:user/repo. Required for install."),
  },
  async execute(args) {
    try {
      switch (args.action) {
        case "list": {
          const domains = listDomains()
          const current = activeDomain()
          return JSON.stringify(
            domains.map((d) => ({
              name: d.name,
              description: d.description,
              author: d.author,
              version: d.version,
              active: d.name === current,
            })),
            null,
            2,
          )
        }
        case "activate": {
          if (!args.name) return JSON.stringify({ error: "name is required for activate" })
          activateDomain(args.name)
          buildPrompt()
          return JSON.stringify({ ok: true })
        }
        case "install": {
          if (!args.source) return JSON.stringify({ error: "source is required for install" })
          const installed = await installDomain(args.source, args.name)
          return JSON.stringify({ ok: true, name: installed })
        }
        case "remove": {
          if (!args.name) return JSON.stringify({ error: "name is required for remove" })
          removeDomain(args.name)
          return JSON.stringify({ ok: true })
        }
        default:
          return JSON.stringify({ error: `Unknown action: ${args.action}` })
      }
    } catch (e: any) {
      return JSON.stringify({ error: e.message || String(e) })
    }
  },
})
