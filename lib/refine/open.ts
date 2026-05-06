import { existsSync } from "fs"
import { ACTIVE_PROMPT_FILE } from "../config"
import { ctx } from "../ctx"
import { seedBuiltinDesigns } from "../design/designs"
import { assertDeckHtmlContractValid } from "../deck-html/contract"
import { seedBuiltinDomains } from "../domain/domains"
import { ensureEditableDeckState } from "../edit/deck-state"
import { openUrl } from "../edit/open"
import { resolveEditableDeck, type EditableDeck } from "../edit/resolve-deck"
import { buildPrompt } from "../prompt-builder"
import { startRefineServer, type RefineMode } from "./server"

export interface OpenRefineDeckResult {
  deck: EditableDeck
  url: string
  source: string
  stateNote: string
  preflightChanged: boolean
  reusedSession: boolean
  liveSession: boolean
  openedBrowser: boolean
  mode: RefineMode
}

export interface OpenRefineDeckOptions {
  client: any
  sessionID: string
  workspaceRoot: string
  mode?: RefineMode
  openBrowser?: boolean
  openUrl?: (url: string) => void
}

export function openRefineDeck(target: string, options: OpenRefineDeckOptions): OpenRefineDeckResult {
  const deck = resolveEditableDeck(options.workspaceRoot, target)
  const preflight = ensureEditableDeckState(options.workspaceRoot, deck)
  assertDeckHtmlContractValid(options.workspaceRoot, deck.absoluteFile)
  const mode = options.mode ?? "edit"

  ctx.enabled = true
  if (!existsSync(ACTIVE_PROMPT_FILE)) {
    seedBuiltinDesigns()
    seedBuiltinDomains()
    buildPrompt()
  }

  const refineServer = startRefineServer()
  const session = refineServer.getOrCreateSession({
    client: options.client,
    sessionID: options.sessionID,
    workspaceRoot: options.workspaceRoot,
    deck,
    mode,
  })
  const url = `${refineServer.baseUrl}/refine?token=${encodeURIComponent(session.token)}`
  const shouldOpen = options.openBrowser !== false
  if (shouldOpen) (options.openUrl ?? openUrl)(url)

  return {
    deck,
    url,
    source: deck.source === "render-target" ? "render target" : deck.source === "decks-state" ? "DECKS.json" : deck.source === "file-path" ? "file path" : "fallback path",
    stateNote: preflight.changed ? "Deck state was prepared in DECKS.json for refinement." : "Deck state already points to this refinement target.",
    preflightChanged: preflight.changed,
    reusedSession: session.reused,
    liveSession: session.live,
    openedBrowser: shouldOpen,
    mode,
  }
}
