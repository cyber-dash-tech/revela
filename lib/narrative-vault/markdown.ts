export function splitMarkdownSections(body: string): { main: string; sections: Record<string, string> } {
  const sections: Record<string, string> = {}
  const lines = body.replace(/\r\n/g, "\n").split("\n")
  let current = "main"
  const buffers: Record<string, string[]> = { main: [] }
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match) {
      current = normalizeSectionName(match[1])
      buffers[current] = []
      continue
    }
    buffers[current].push(line)
  }
  for (const [key, value] of Object.entries(buffers)) {
    if (key === "main") continue
    sections[key] = value.join("\n").trim()
  }
  return { main: buffers.main.join("\n").trim(), sections }
}

export function firstParagraphOrBody(value: string): string {
  const cleaned = value.trim()
  if (!cleaned) return ""
  return cleaned.split(/\n\s*\n/)[0].replace(/\n+/g, " ").trim()
}

export function parseMarkdownList(section: string): string[] {
  return section.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim()).filter(Boolean)
}

export function normalizeSectionName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-")
}
