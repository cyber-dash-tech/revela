import { tool } from "@opencode-ai/plugin"
import {
  listDesigns,
  activeDesign,
  activateDesign,
  installDesign,
  removeDesign,
  parseDesignSections,
  generateComponentIndex,
  generateLayoutIndex,
  getDesignSection,
  getDesignComponent,
  getDesignLayout,
} from "../lib/design/designs"
import { buildPrompt } from "../lib/prompt-builder"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { DESIGNS_DIR } from "../lib/config"
import { parseFrontmatter } from "../lib/frontmatter"

export default tool({
  description:
    "Manage revela visual design templates. " +
    "Use action 'list' to show all installed designs with names and descriptions. " +
    "Use action 'activate' to switch to a different design (requires name). " +
    "Use action 'install' to add a new design from a URL, local path, or github:user/repo shorthand (requires source). " +
    "Use action 'remove' to uninstall a design (requires name). " +
    "Use action 'read' to fetch on-demand design content: pass layout (comma-separated names) to get full HTML/CSS for specific layouts, pass component (comma-separated names) to get full CSS/HTML for specific components, or section ('chart-rules' | 'foundation' | 'layouts' | 'components') to get an entire section. Pass neither to get the Component Index table. " +
    "After activating a new design, the system prompt is automatically rebuilt.",
  args: {
    action: tool.schema
      .enum(["list", "activate", "install", "remove", "read"])
      .describe("Operation to perform"),
    name: tool.schema
      .string()
      .optional()
      .describe("Design name — required for activate and remove; optional for read (defaults to active design)"),
    source: tool.schema
      .string()
      .optional()
      .describe(
        "Install source — URL, local path, github:user/repo. Required for install."
      ),
    layout: tool.schema
      .string()
      .optional()
      .describe(
        "For action 'read': comma-separated layout name(s) to fetch (e.g. 'cover', 'two-col,card-grid')"
      ),
    component: tool.schema
      .string()
      .optional()
      .describe(
        "For action 'read': comma-separated component name(s) to fetch (e.g. 'card', 'card,stat-card')"
      ),
    section: tool.schema
      .string()
      .optional()
      .describe(
        "For action 'read': section name to fetch — 'chart-rules', 'foundation', 'rules', 'layouts', or 'components'"
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
        case "read": {
          const designName = args.name || activeDesign()

          // Read raw body to check for markers
          const mdPath = join(DESIGNS_DIR, designName, "DESIGN.md")
          if (!existsSync(mdPath)) {
            return JSON.stringify({ error: `Design '${designName}' is not installed` })
          }
          const raw = readFileSync(mdPath, "utf-8")
          const { body } = parseFrontmatter(raw)
          const { layouts, components, hasMarkers } = parseDesignSections(body)

          if (!hasMarkers) {
            // No markers — return full body
            return body
          }

          // Specific layout(s) requested
          if (args.layout) {
            return getDesignLayout(args.layout, designName)
          }

          // Specific component(s) requested
          if (args.component) {
            return getDesignComponent(args.component, designName)
          }

          // Specific section requested
          if (args.section) {
            return getDesignSection(args.section, designName)
          }

          // Default: return Layout Index + Component Index
          const li = generateLayoutIndex(layouts)
          const ci = generateComponentIndex(components)
          const parts = [li, ci].filter(Boolean)
          return parts.join("\n\n---\n\n") || "(no layouts or components found)"
        }
        default:
          return JSON.stringify({ error: `Unknown action: ${args.action}` })
      }
    } catch (e: any) {
      return JSON.stringify({ error: e.message || String(e) })
    }
  },
})
