export interface ParsedVaultFrontmatter {
  frontmatter: Record<string, string | string[] | boolean>
  body: string
}

export function parseVaultFrontmatter(markdown: string): ParsedVaultFrontmatter {
  const normalized = markdown.replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) return { frontmatter: {}, body: normalized.trim() }
  const end = normalized.indexOf("\n---", 4)
  if (end === -1) return { frontmatter: {}, body: normalized.trim() }
  const raw = normalized.slice(4, end).trim()
  const body = normalized.slice(end + 4).replace(/^\n/, "").trim()
  const frontmatter: Record<string, string | string[] | boolean> = {}
  const lines = raw.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = /^(\w[\w-]*):\s*(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]
    const value = match[2].trim()
    if (value === "true" || value === "false") {
      frontmatter[key] = value === "true"
    } else if (value.startsWith("[") && value.endsWith("]")) {
      frontmatter[key] = value.slice(1, -1).split(",").map((item) => unquote(item.trim())).filter(Boolean)
    } else if (!value) {
      const items: string[] = []
      while (lines[index + 1]?.trim().startsWith("- ")) {
        index += 1
        items.push(unquote(lines[index].trim().slice(2).trim()))
      }
      frontmatter[key] = items.length > 0 ? items : ""
    } else {
      frontmatter[key] = unquote(value)
    }
  }
  return { frontmatter, body }
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, "").trim()
}
