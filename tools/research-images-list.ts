import { tool } from "@opencode-ai/plugin"
import { listResearchImageLeads } from "../lib/research/image-leads"

export default tool({
  description:
    "List structured image leads from researches/{topic}/*.md. " +
    "Parses ## Images sections and returns candidate image records for the primary agent to review.",
  args: {
    topic: tool.schema.string().describe("Topic slug shared by one presentation, e.g. 'ev-market'."),
    uses: tool.schema
      .array(tool.schema.enum(["logo", "portrait", "screenshot", "unknown"]))
      .optional()
      .describe("Optional use filter, e.g. ['logo', 'portrait', 'screenshot']"),
    axis: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Optional axis filter, e.g. ['tesla-profile', 'market-data']"),
  },
  async execute(args, context) {
    const workspaceDir = context.directory ?? process.cwd()
    const result = listResearchImageLeads(args.topic, workspaceDir, {
      uses: args.uses,
      axis: args.axis,
    })

    return JSON.stringify({
      ok: true,
      topic: result.topic,
      count: result.items.length,
      items: result.items,
      warnings: result.warnings,
    }, null, 2)
  },
})
