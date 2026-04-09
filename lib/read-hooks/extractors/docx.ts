/**
 * lib/read-hooks/extractors/docx.ts
 *
 * DOCX text extraction using mammoth.js (pure JS, 6k+ stars).
 * Extracts raw text without formatting — suitable for LLM context.
 */

import mammoth from "mammoth"

/**
 * Extract plain text from a DOCX buffer.
 */
export async function extractDocx(buf: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buf })
  return result.value
}
