import { existsSync, readdirSync } from "fs"
import { relative, resolve, sep } from "path"
import { DECKS_STATE_FILE, isDeckHtmlPath, workspaceDeckSlug } from "../decks-state"

export interface EditableDeck {
  slug: string
  file: string
  absoluteFile: string
  source: "decks-state" | "fallback" | "file-path"
}

export function resolveEditableDeck(workspaceRoot: string, input = ""): EditableDeck {
  if (input.trim()) {
    throw new Error("/revela edit no longer accepts a target. It opens the only HTML deck in decks/.")
  }

  const htmlFiles = listDeckHtmlFiles(workspaceRoot)
  if (htmlFiles.length === 0) {
    throw new Error("No deck HTML found in decks/. Generate a deck first.")
  }
  if (htmlFiles.length > 1) {
    throw new Error("This workspace contains multiple deck HTML files. Revela 0.8 expects one deck per workspace. Move extra decks to separate workspaces.")
  }

  return resolveDeckFile(workspaceRoot, workspaceDeckSlug(workspaceRoot), htmlFiles[0], "file-path")
}

function listDeckHtmlFiles(workspaceRoot: string): string[] {
  const dir = resolve(workspaceRoot, "decks")
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => `decks/${entry.name}`)
    .sort((a, b) => a.localeCompare(b))
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
    slug,
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
