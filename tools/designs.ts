import { tool } from "@opencode-ai/plugin"
import {
  listDesigns,
  activeDesign,
  activateDesign,
  installDesign,
  removeDesign,
} from "../lib/designs"
import { buildPrompt } from "../lib/prompt-builder"

export default tool({
  description:
    "Manage revela visual design templates. " +
    "Use action 'list' to show all installed designs with names and descriptions. " +
    "Use action 'activate' to switch to a different design (requires name). " +
    "Use action 'install' to add a new design from a URL, local path, or github:user/repo shorthand (requires source). " +
    "Use action 'remove' to uninstall a design (requires name). " +
    "After activating a new design, the system prompt is automatically rebuilt.",
  args: {
    action: tool.schema
      .enum(["list", "activate", "install", "remove"])
      .describe("Operation to perform"),
    name: tool.schema
      .string()
      .optional()
      .describe("Design name — required for activate and remove"),
    source: tool.schema
      .string()
      .optional()
      .describe(
        "Install source — URL, local path, github:user/repo. Required for install."
      ),
  },
  async execute(args) {
    try {
      switch (args.action) {
        case "list": {
          const designs = listDesigns()
          const current = activeDesign()
          return JSON.stringify(
            designs.map((d) => ({
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
          activateDesign(args.name)
          buildPrompt()
          return JSON.stringify({ ok: true })
        }
        case "install": {
          if (!args.source) return JSON.stringify({ error: "source is required for install" })
          const installed = await installDesign(args.source, args.name)
          return JSON.stringify({ ok: true, name: installed })
        }
        case "remove": {
          if (!args.name) return JSON.stringify({ error: "name is required for remove" })
          removeDesign(args.name)
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
