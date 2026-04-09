/**
 * Minimal YAML frontmatter parser.
 *
 * Handles the simple `key: value` format used by DESIGN.md / DOMAIN.md files.
 * No dependency on external YAML libraries.
 */

export interface Frontmatter {
  /** Key-value pairs from the YAML block between `---` fences. */
  meta: Record<string, string>
  /** Everything after the closing `---`, trimmed. */
  body: string
}

/**
 * Parse a markdown file with optional YAML frontmatter.
 *
 * Format:
 * ```
 * ---
 * key1: value1
 * key2: value2
 * ---
 *
 * Body text...
 * ```
 *
 * If the file does not start with `---`, the entire content is returned as body
 * with an empty meta object.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split("\n")

  if (!lines.length || lines[0].trim() !== "---") {
    return { meta: {}, body: text.trim() }
  }

  const meta: Record<string, string> = {}
  let endIdx = -1

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i
      break
    }
    const colonPos = lines[i].indexOf(":")
    if (colonPos !== -1) {
      const key = lines[i].slice(0, colonPos).trim()
      const value = lines[i].slice(colonPos + 1).trim()
      if (key) {
        meta[key] = value
      }
    }
  }

  if (endIdx === -1) {
    // No closing ---, treat entire content as body
    return { meta: {}, body: text.trim() }
  }

  const body = lines.slice(endIdx + 1).join("\n").trim()
  return { meta, body }
}
