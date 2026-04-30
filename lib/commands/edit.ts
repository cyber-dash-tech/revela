import { existsSync } from "fs"
import { ctx } from "../ctx"
import { ACTIVE_PROMPT_FILE } from "../config"
import { buildPrompt } from "../prompt-builder"
import { resolveEditableDeck } from "../edit/resolve-deck"
import { ensureEditableDeckState } from "../edit/deck-state"
import { startEditServer } from "../edit/server"

function openUrl(url: string): void {
  if (process.platform === "darwin") {
    const proc = Bun.spawnSync(["open", url])
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open edit page")
    return
  }

  if (process.platform === "win32") {
    const proc = Bun.spawnSync(["cmd", "/c", "start", "", url])
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open edit page")
    return
  }

  const proc = Bun.spawnSync(["xdg-open", url])
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open edit page")
}

export async function handleEdit(
  input: string,
  options: { client: any; sessionID: string; workspaceRoot: string },
  send: (text: string) => Promise<void>,
): Promise<void> {
  const target = input.trim()
  if (!target) {
    await send("**Usage:** `/revela edit <deck-slug|decks/file.html>`\n\nExamples: `/revela edit investor-update`, `/revela edit decks/investor-update.html`")
    return
  }

  try {
    const deck = resolveEditableDeck(options.workspaceRoot, target)
    const preflight = ensureEditableDeckState(options.workspaceRoot, deck)
    if (!preflight.readiness.ready) {
      await send(`**Edit blocked:** ${preflight.readiness.blocker || "Deck is not ready for HTML edits."}`)
      return
    }

    ctx.enabled = true
    if (!existsSync(ACTIVE_PROMPT_FILE)) buildPrompt()

    const editServer = startEditServer()
    const token = editServer.createSession({
      client: options.client,
      sessionID: options.sessionID,
      deck,
    })
    const url = `${editServer.baseUrl}/edit?token=${encodeURIComponent(token)}`
    openUrl(url)

    const source = deck.source === "decks-state" ? "DECKS.json" : deck.source === "file-path" ? "file path" : "fallback path"
    const stateNote = preflight.changed ? "Deck state was prepared in DECKS.json before opening the editor.\n" : "Deck state is ready in DECKS.json.\n"
    await send(
      `Opened visual editor for deck \`${deck.slug}\`.\n` +
      `File: \`${deck.file}\` (${source})\n` +
      stateNote +
      `URL: ${url}\n\n` +
      `Use Ctrl/Cmd + click in the browser to reference elements, write a comment, then send comments. Revela mode has been enabled for the edit prompt.`
    )
  } catch (e: any) {
    await send(`**Edit failed:** ${e.message || String(e)}`)
  }
}
