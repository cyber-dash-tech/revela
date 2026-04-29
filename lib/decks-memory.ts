export function isDeckHtmlPath(filePath: string): boolean {
  return normalizePath(filePath).match(/(^|\/)decks\/[^/]+\.html$/) !== null
}

export function extractDeckHtmlTargetsFromPatch(patchText: string): string[] {
  const targets = new Set<string>()

  for (const line of patchText.replace(/\r\n/g, "\n").split("\n")) {
    const match = /^\*\*\*\s+(?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    const target = match[1].trim()
    if (isDeckHtmlPath(target)) targets.add(target)
  }

  return [...targets]
}

export function extractPatchTextArg(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined
  for (const key of ["patchText", "patch", "content"]) {
    const value = args[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return undefined
}

export function setPatchTextArg(args: Record<string, unknown>, patchText: string): void {
  if (typeof args.patchText === "string") {
    args.patchText = patchText
    return
  }
  if (typeof args.patch === "string") {
    args.patch = patchText
    return
  }
  if (typeof args.content === "string") {
    args.content = patchText
    return
  }
  args.patchText = patchText
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}
