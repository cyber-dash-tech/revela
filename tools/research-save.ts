import { tool } from "@opencode-ai/plugin"
import { researchSave } from "../lib/runtime/research"

export default tool({
  description:
    "Save a research findings file to the workspace researches/ directory. " +
    "Creates researches/{topic}/{filename}.md with YAML frontmatter. " +
    "Each research axis gets its own file (e.g. 'market-data', 'catl-profile'). " +
    "Content should use structured blocks such as ## Finding: <stable-id>, ## Analysis: <stable-id>, " +
    "## Implementation Note: <stable-id>, ## Asset Lead: <stable-id>, and ## Gaps.",
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
        "Structured markdown findings. Prefer stable cards:\n" +
        "## Finding: <stable-id> — evidence with Source, URL/path, Quote/Snippet, Supports, Evidence boundary, Strength, Deck use, and optional Display note\n" +
        "## Analysis: <stable-id> — LLM/user analytical frameworks; not external factual proof\n" +
        "## Implementation Note: <stable-id> — render/data/API contracts; not market evidence\n" +
        "## Asset Lead: <stable-id> — image/logo/media leads with source, license/attribution status, alt text, and deck use\n" +
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
