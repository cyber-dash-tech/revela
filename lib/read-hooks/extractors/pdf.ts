/**
 * lib/read-hooks/extractors/pdf.ts
 *
 * PDF text extraction using unpdf (zero-dependency, pure JS, serverless PDF.js).
 * Only extracts text — image extraction from PDFs requires native deps (@napi-rs/canvas)
 * and is intentionally excluded.
 */

import { getDocumentProxy, extractText } from "unpdf"

/**
 * Extract all text from a PDF buffer.
 * Pages are merged into a single string with double newlines between them.
 */
export async function extractPdfText(buf: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}
