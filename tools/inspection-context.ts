import { tool } from "@opencode-ai/plugin"
import { compileInspectionContext } from "../lib/inspection-context/compile"
import { normalizeWorkspaceDeckState, readOrCreateDecksState } from "../lib/decks-state"

export default tool({
  description:
    "Compile Revela's current DECKS.json into structured inspection context for debugging and future Evidence Inspector flows. " +
    "This is read-only: it does not write artifacts, mutate DECKS.json, or generate user-facing files.",
  args: {
    slug: tool.schema.string().optional().describe("Optional deck slug to compile. Defaults to the active workspace deck."),
  },
  async execute(args, context) {
    try {
      const workspaceRoot = context.directory ?? process.cwd()
      const state = normalizeWorkspaceDeckState(readOrCreateDecksState(workspaceRoot), workspaceRoot)
      const inspectionContext = compileInspectionContext(state, args.slug)
      return JSON.stringify({ ok: true, inspectionContext }, null, 2)
    } catch (e: any) {
      return JSON.stringify({ ok: false, error: e.message || String(e) })
    }
  },
})
