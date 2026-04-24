import { tool } from "@opencode-ai/plugin"
import { saveMediaAsset } from "../lib/media/save"

export default tool({
  description:
    "Save one image asset into the workspace assets/ directory and update a media manifest. " +
    "Supports either a sourceUrl or a sourcePath. Records both success and failure states. " +
    "Use this when a research-found image or an existing local image should become a formal project asset.",
  args: {
    topic: tool.schema.string().describe("Topic slug shared by one presentation, e.g. 'ev-market'."),
    id: tool.schema.string().describe("Stable asset id within the topic, e.g. 'tesla-logo-01'."),
    type: tool.schema.enum(["image"]).describe("Asset type. Stage 1 only supports 'image'."),
    purpose: tool.schema
      .enum(["hero", "illustration", "portrait", "logo", "screenshot"])
      .describe("Image purpose in the deck."),
    brief: tool.schema.string().describe("One-sentence reason this image is needed."),
    status: tool.schema
      .enum(["success", "cannot-download", "invalid-url", "cannot-generate"])
      .describe("'success' saves an image asset; other statuses record a failed attempt in the manifest."),
    intendedSection: tool.schema.string().optional().describe("Optional narrative section such as 'market-overview'."),
    sourcePath: tool.schema
      .string()
      .optional()
      .describe("Optional local image path, relative to the workspace root. Preferred when both sourcePath and sourceUrl are present."),
    sourceUrl: tool.schema
      .string()
      .optional()
      .describe("Optional remote image URL to download when sourcePath is not provided."),
    alt: tool.schema.string().optional().describe("Optional alt text for the image."),
    notes: tool.schema.string().optional().describe("Optional usage notes for future slide generation."),
    failureReason: tool.schema
      .string()
      .optional()
      .describe("Required when status is not 'success'. Briefly explain why the image is unavailable."),
  },
  async execute(args, context) {
    const workspaceDir = context.directory ?? process.cwd()
    return JSON.stringify(await saveMediaAsset(args, workspaceDir), null, 2)
  },
})
