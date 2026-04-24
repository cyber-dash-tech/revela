import { tool } from "@opencode-ai/plugin"
import { extractDocumentMaterials } from "../lib/document-materials/extract"

export default tool({
  description:
    "Extract reusable materials from a workspace document into a workspace-local cache. " +
    "Supports pdf, pptx, docx, and xlsx. Produces a manifest plus extracted text, embedded images, and available page/slide/sheet mappings. " +
    "Unsupported file types are skipped instead of failing.",
  args: {
    file: tool.schema
      .string()
      .describe("Document path relative to workspace root. Supports pdf, pptx, docx, and xlsx; other file types are skipped."),
  },
  async execute(args, context) {
    const workspaceDir = context.directory ?? process.cwd()
    return JSON.stringify(await extractDocumentMaterials(args.file, workspaceDir), null, 2)
  },
})
