/**
 * tools/edit.ts
 *
 * revela-edit — Compatibility tool that opens Revela Refine in Edit mode.
 */

import { tool } from "@opencode-ai/plugin"
import { openRefineDeck } from "../lib/refine/open"

export function createEditTool(options: { client: any; workspaceRoot: string; openBrowser?: boolean }) {
  return tool({
    description:
      "Open Revela Refine in Edit mode for an existing slide deck. " +
      "Use this when the user asks to edit, revise, annotate, or visually comment on a deck, " +
      "including when they reference the current deck. " +
      "This is a compatibility tool for the older edit-only workflow; the user-facing entry is /revela refine. " +
      "It opens a local browser workspace where the user can Ctrl/Cmd-click deck elements, use the Edit tab, " +
      "and send precise edit requests back to the current OpenCode session.",
    args: {},
    async execute(_args, context: any) {
      const sessionID = context?.sessionID ?? context?.session?.id ?? ""
      if (!sessionID) {
        return JSON.stringify({
          ok: false,
          error: "Cannot open visual editor because the current OpenCode session id is unavailable.",
        })
      }

      try {
        const result = openRefineDeck("", {
          client: options.client,
          sessionID,
          workspaceRoot: options.workspaceRoot,
          mode: "edit",
          openBrowser: options.openBrowser,
        })

        return JSON.stringify({
          ok: true,
          deckKey: result.deck.slug,
          file: result.deck.file,
          source: result.source,
          url: result.url,
          mode: result.mode,
          message:
            `${result.stateNote} Opened Revela Refine in Edit mode. ` +
            "Ask the user to use Ctrl/Cmd-click in the browser to reference elements, then use the Edit tab to send comments.",
        }, null, 2)
      } catch (error) {
        return JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })
}

export default createEditTool
