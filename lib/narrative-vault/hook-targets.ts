import { relative, resolve } from "path"

const VAULT_MARKDOWN_RE = /^revela-narrative\/(.+)\.md$/

export function isNarrativeVaultMarkdownPath(filePath: string, workspaceRoot: string): boolean {
  const workspaceRelative = toWorkspaceRelativePath(filePath, workspaceRoot)
  if (!workspaceRelative) return false
  const match = VAULT_MARKDOWN_RE.exec(workspaceRelative)
  return Boolean(match?.[1])
}

export function normalizeNarrativeVaultMarkdownPath(filePath: string, workspaceRoot: string): string | undefined {
  const workspaceRelative = toWorkspaceRelativePath(filePath, workspaceRoot)
  if (!workspaceRelative) return undefined
  return VAULT_MARKDOWN_RE.test(workspaceRelative) ? workspaceRelative : undefined
}

export function extractNarrativeVaultMarkdownTargetsFromPatch(patchText: string, workspaceRoot: string): string[] {
  const targets = new Set<string>()

  for (const line of patchText.replace(/\r\n/g, "\n").split("\n")) {
    const match = /^\*\*\*\s+(?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    const target = normalizeNarrativeVaultMarkdownPath(match[1].trim(), workspaceRoot)
    if (target) targets.add(target)
  }

  return [...targets]
}

function toWorkspaceRelativePath(filePath: string, workspaceRoot: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/").trim()
  if (!normalized) return undefined

  const root = resolve(workspaceRoot)
  const absolute = resolve(root, normalized)
  const rel = relative(root, absolute).replace(/\\/g, "/")
  if (!rel || rel === "." || rel.startsWith("../") || rel === "..") return undefined
  return rel
}
