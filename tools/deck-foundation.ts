import { tool } from "@opencode-ai/plugin"
import { createDeckFoundation } from "../lib/deck-html/foundation"

export default tool({
  description:
    "Create or repair a file-native Revela deck HTML foundation shell from the active design. " +
    "Writes a deterministic empty deck shell with doctype, html/head/body, active design foundation CSS, complete SlidePresentation JavaScript, and stable slide insertion markers. " +
    "It does not create narrative slide content, choose layouts/components, or read/write DECKS.json.",
  args: {
    outputPath: tool.schema
      .string()
      .describe("Workspace-relative HTML output path, usually decks/{name}.html."),
    title: tool.schema
      .string()
      .describe("Presentation title for the HTML <title> tag only; this does not create a cover slide."),
    language: tool.schema
      .string()
      .describe("HTML language tag, e.g. en or zh-CN."),
    designName: tool.schema
      .string()
      .optional()
      .describe("Optional design name. Defaults to the active design."),
    mode: tool.schema
      .enum(["create", "repair"])
      .optional()
      .describe("create protects existing files unless overwrite=true; repair may replace an existing foundation shell."),
    overwrite: tool.schema
      .boolean()
      .optional()
      .describe("Whether create mode may overwrite an existing HTML file. Defaults to false."),
  },
  async execute(args, { directory }) {
    try {
      const result = createDeckFoundation({
        workspaceRoot: directory || process.cwd(),
        outputPath: args.outputPath,
        title: args.title,
        language: args.language,
        designName: args.designName,
        mode: args.mode,
        overwrite: args.overwrite ?? false,
      })
      return JSON.stringify(result, null, 2)
    } catch (e: any) {
      return JSON.stringify({ error: e?.message || String(e) })
    }
  },
})
