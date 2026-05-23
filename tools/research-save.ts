import { tool } from "@opencode-ai/plugin"
import { researchSave } from "../lib/runtime/research"

export default tool({
  description:
    "Save a research findings file to the workspace researches/ directory. " +
    "Creates researches/{topic}/{filename}.md with YAML frontmatter. " +
    "Each research axis gets its own file (e.g. 'market-data', 'catl-profile'). " +
    "Content should use ## Data / ## Cases / ## Images / ## Gaps sections.",
  args: {
    topic: tool.schema
      .string()
      .describe(
        "Topic key in kebab-case, e.g. 'ev-battery-market' or 'saas-competitive-analysis'. " +
        "All files for the same presentation share the same topic key.",
      ),
    filename: tool.schema
      .string()
      .describe(
        "Axis name without extension, e.g. 'market-data', 'catl-profile', 'tech-trends'. " +
        "Each parallel research agent uses a unique axis name.",
      ),
    content: tool.schema
      .string()
      .describe(
        "Structured markdown findings. Use these sections (omit empty ones):\n" +
        "## Data — key stats and data points, each with [Source: url]\n" +
        "## Cases — company/entity profiles, 1-2 sentences each with [Source: url]\n" +
        "## Images — image URLs: '{description}: {url} | Alt: {text} | Use: logo|screenshot|portrait'\n" +
        "## Gaps — topics not found or insufficiently covered",
      ),
    sources: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Source URLs or filenames for YAML frontmatter, e.g. ['https://example.com/report', 'data.xlsx']"),
  },
  async execute(args, context) {
    try {
      return JSON.stringify(researchSave({
        topic: args.topic,
        filename: args.filename,
        content: args.content,
        sources: args.sources,
        workspaceRoot: context.directory ?? process.cwd(),
      }))
    } catch (e: any) {
      return JSON.stringify({ error: e.message || String(e) })
    }
  },
})
