import { existsSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { narrativeVaultPath } from "./paths"

export function narrativeVaultTimestampMs(workspaceRoot: string): number {
  const root = narrativeVaultPath(workspaceRoot)
  if (!existsSync(root)) return 0
  return newestMarkdownMtime(root)
}

function newestMarkdownMtime(dir: string): number {
  let newest = 0
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return 0
  }

  for (const entry of entries) {
    const path = join(dir, entry)
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (stat.isDirectory()) newest = Math.max(newest, newestMarkdownMtime(path))
    else if (stat.isFile() && entry.endsWith(".md")) newest = Math.max(newest, stat.mtimeMs)
  }
  return newest
}
