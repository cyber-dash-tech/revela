import { tool } from "@opencode-ai/plugin"
import { batchSaveMediaAssets } from "../lib/media/batch-save"

export default tool({
  description:
    "Save a selected batch of research-found image leads into workspace assets and update the media manifest. " +
    "Use this after the primary agent has chosen multiple images from researches/{topic}/*.md.",
  args: {
    topic: tool.schema.string().describe("Topic slug shared by one presentation, e.g. 'ev-market'."),
    items: tool.schema.array(tool.schema.object({
      candidateId: tool.schema.string().describe("Stable candidate id returned by revela-research-images-list."),
      description: tool.schema.string().describe("Candidate description from research findings."),
      url: tool.schema.string().describe("Remote image URL to save."),
      alt: tool.schema.string().optional().describe("Optional alt text."),
      use: tool.schema.enum(["logo", "portrait", "screenshot"]).describe("Structured image use from research findings."),
      sourceFile: tool.schema.string().optional().describe("Optional source research file path."),
      intendedSection: tool.schema.string().optional().describe("Optional section override for this one item."),
    })).describe("Explicitly selected image leads to save. This tool does not auto-select candidates."),
    intendedSection: tool.schema.string().optional().describe("Optional default narrative section for all items in this batch."),
  },
  async execute(args, context) {
    const workspaceDir = context.directory ?? process.cwd()
    return JSON.stringify(await batchSaveMediaAssets(args, workspaceDir), null, 2)
  },
})
