import { existsSync, readdirSync, statSync } from "fs"
import { relative, resolve, sep } from "path"
import { isDeckHtmlPath, workspaceDeckSlug } from "../decks-state"

export interface EditableDeck {
  slug: string
  file: string
  absoluteFile: string
  source: "discovered" | "file-path"
}

export function resolveEditableDeck(workspaceRoot: string, input = ""): EditableDeck {
  const explicit = input.trim()
  if (explicit) return resolveDeckFile(workspaceRoot, workspaceDeckSlug(workspaceRoot), explicit, "file-path")

  const htmlFiles = listDeckHtmlFiles(workspaceRoot)
  if (htmlFiles.length === 0) {
    throw new Error("No deck HTML found in decks/. Pass a deck path or generate a deck first.")
  }
  if (htmlFiles.length > 1) {
    throw new Error(`Multiple deck HTML files found in decks/: ${htmlFiles.join(", ")}. Pass the deck path explicitly.`)
  }

  return resolveDeckFile(workspaceRoot, workspaceDeckSlug(workspaceRoot), htmlFiles[0], "discovered")
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
  const root = resolve(workspaceRoot)
  const absoluteFile = resolve(root, file)
  if (!isInside(root, absoluteFile)) {
    throw new Error(`Resolved deck file is outside the workspace: ${file}`)
  }
  if (!isDeckHtmlPath(workspaceRelative(root, absoluteFile)) && !/\.html?$/i.test(absoluteFile)) {
    throw new Error(`Deck path must be an HTML file: ${file || "missing"}.`)
  }
  if (!existsSync(absoluteFile)) {
    throw new Error(`Deck HTML not found: ${workspaceRelative(root, absoluteFile)}`)
  }
  if (!statSync(absoluteFile).isFile()) {
    throw new Error(`Deck path is not a file: ${workspaceRelative(root, absoluteFile)}`)
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
