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
import type { ReviewPromptBridge } from "./prompt-bridge"
import { startRefineServer, type RefineMode, type ReviewShellSurface } from "./server"

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

export interface EnsureRefineDeckOpenResult extends OpenRefineDeckResult {
  skippedReason?: "live-session"
}

export interface OpenRefineDeckOptions {
  client?: any
  sessionID?: string
  workspaceRoot: string
  mode?: RefineMode
  openBrowser?: boolean
  openUrl?: (url: string) => void
  promptBridge?: ReviewPromptBridge
  surface?: ReviewShellSurface
}

export function openRefineDeck(target: string, options: OpenRefineDeckOptions): OpenRefineDeckResult {
  return openRefineDeckInternal(target, options, { skipLiveSession: false })
}

export function ensureRefineDeckOpenForChange(
  target: string,
  options: OpenRefineDeckOptions,
): EnsureRefineDeckOpenResult {
  return openRefineDeckInternal(target, options, { skipLiveSession: true })
}

function openRefineDeckInternal(
  target: string,
  options: OpenRefineDeckOptions,
  behavior: { skipLiveSession: boolean },
): EnsureRefineDeckOpenResult {
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
    promptBridge: options.promptBridge,
  })
  const route = options.surface === "codex" ? "/codex-review" : "/refine"
  const url = `${refineServer.baseUrl}${route}?token=${encodeURIComponent(session.token)}`
  const shouldOpen = options.openBrowser !== false && !(behavior.skipLiveSession && session.live)
  if (shouldOpen) (options.openUrl ?? openUrl)(url)

  return {
    deck,
    url,
    source: deck.source === "file-path" ? "file path" : "discovered deck file",
    stateNote: preflight.changed ? "Deck file preflight updated runtime state." : "Deck review uses the selected HTML artifact directly.",
    preflightChanged: preflight.changed,
    reusedSession: session.reused,
    liveSession: session.live,
    openedBrowser: shouldOpen,
    mode,
    skippedReason: behavior.skipLiveSession && session.live ? "live-session" : undefined,
  }
}
