/**
 * tools/edit.ts
 *
 * revela-edit — Open Revela's visual comment editor for an existing deck.
 */

import { tool } from "@opencode-ai/plugin"
import { openEditableDeck } from "../lib/edit/open"

export function createEditTool(options: { client: any; workspaceRoot: string; openBrowser?: boolean }) {
  return tool({
    description:
      "Open Revela's visual comment editor for an existing slide deck. " +
      "Use this when the user asks to edit, revise, annotate, or visually comment on a deck, " +
      "including when they reference the current deck. " +
      "Revela 0.8 opens the only HTML deck in decks/. " +
      "This opens a local browser editor where the user can Ctrl/Cmd-click deck elements, write comments, " +
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
        const result = openEditableDeck("", {
          client: options.client,
          sessionID,
          workspaceRoot: options.workspaceRoot,
          openBrowser: options.openBrowser,
        })

        return JSON.stringify({
          ok: true,
          deckKey: result.deck.slug,
          file: result.deck.file,
          source: result.source,
          url: result.url,
          message:
            `${result.stateNote} Opened visual editor. ` +
            "Ask the user to use Ctrl/Cmd + click in the browser to reference elements, write a comment, then send comments.",
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
