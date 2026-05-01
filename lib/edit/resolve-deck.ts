import { existsSync } from "fs"
import { basename, relative, resolve, sep } from "path"
import { DECKS_STATE_FILE, hasDecksState, isDeckHtmlPath, readDecksState } from "../decks-state"

export interface EditableDeck {
  slug: string
  file: string
  absoluteFile: string
  source: "decks-state" | "fallback" | "file-path"
}

export function resolveEditableDeck(workspaceRoot: string, input: string): EditableDeck {
  const requested = input.trim()
  if (!requested) return resolveDefaultDeck(workspaceRoot)

  const slug = normalizeSlug(requested)

  if (hasDecksState(workspaceRoot)) {
    const state = readDecksState(workspaceRoot)
    const deck = state.decks[requested] ?? (slug ? state.decks[slug] : undefined)
    if (deck) {
      return resolveDeckFile(workspaceRoot, deck.slug, deck.outputPath, "decks-state")
    }
  }

  if (looksLikePath(requested)) {
    return resolvePathTarget(workspaceRoot, requested)
  }

  if (!slug) throw new Error("Deck target must be a deck slug or decks/*.html path.")

  return resolveDeckFile(workspaceRoot, slug, `decks/${slug}.html`, "fallback")
}

function resolveDefaultDeck(workspaceRoot: string): EditableDeck {
  if (!hasDecksState(workspaceRoot)) {
    throw new Error(`No ${DECKS_STATE_FILE} found. Use /revela edit <deck-slug|decks/file.html>.`)
  }

  const state = readDecksState(workspaceRoot)
  const activeSlug = normalizeSlug(state.activeDeck || "")
  if (activeSlug) {
    const deck = state.decks[activeSlug]
    if (!deck) throw new Error(`Active deck ${activeSlug} does not exist in ${DECKS_STATE_FILE}. Use /revela edit <target>.`)
    return resolveDeckFile(workspaceRoot, deck.slug, deck.outputPath, "decks-state")
  }

  const decks = Object.values(state.decks)
  if (decks.length === 1) {
    const deck = decks[0]
    return resolveDeckFile(workspaceRoot, deck.slug, deck.outputPath, "decks-state")
  }

  if (decks.length === 0) {
    throw new Error(`${DECKS_STATE_FILE} has no decks. Use /revela edit <deck-slug|decks/file.html>.`)
  }

  throw new Error(`${DECKS_STATE_FILE} has multiple decks and no activeDeck. Use /revela edit <target>.`)
}

function resolvePathTarget(workspaceRoot: string, requested: string): EditableDeck {
  if (isAbsoluteLike(requested)) {
    throw new Error("/revela edit only accepts workspace-relative decks/*.html paths.")
  }

  const normalized = normalizePath(requested).replace(/^\.\//, "")
  if (!isDeckHtmlPath(normalized)) {
    throw new Error("/revela edit file paths must point to decks/*.html.")
  }

  const slug = normalizeSlug(basename(normalized, ".html"))
  if (!slug) throw new Error("Deck target must be a deck slug or decks/*.html path.")
  return resolveDeckFile(workspaceRoot, slug, normalized, "file-path")
}

function resolveDeckFile(
  workspaceRoot: string,
  slug: string,
  file: string,
  source: EditableDeck["source"],
): EditableDeck {
  if (!isDeckHtmlPath(file)) {
    throw new Error(`${DECKS_STATE_FILE} deck outputPath must be decks/*.html, got ${file || "missing"}.`)
  }

  const root = resolve(workspaceRoot)
  const absoluteFile = resolve(root, file)
  if (!isInside(root, absoluteFile)) {
    throw new Error(`Resolved deck file is outside the workspace: ${file}`)
  }
  if (!existsSync(absoluteFile)) {
    throw new Error(`Deck HTML not found: ${workspaceRelative(root, absoluteFile)}`)
  }

  return {
    slug: normalizeSlug(slug),
    file: workspaceRelative(root, absoluteFile),
    absoluteFile,
    source,
  }
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep)
}

function workspaceRelative(root: string, target: string): string {
  return relative(root, target).split(sep).join("/")
}

function looksLikePath(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.endsWith(".html")
}

function isAbsoluteLike(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value)
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/")
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}
