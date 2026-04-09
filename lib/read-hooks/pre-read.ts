/**
 * lib/read-hooks/pre-read.ts
 *
 * Before-hook handler for the OpenCode `read` tool.
 * Called from `tool.execute.before` in plugins/revela.ts.
 *
 * Handles DOCX, PPTX, XLSX — formats that cause read tool to throw
 * Effect.fail("Cannot read binary file"), so the after-hook never fires.
 *
 * Strategy: extract text → write temp .txt file → redirect args.filePath.
 * The read tool then reads the temp file normally. LLM is unaware of the redirect.
 */

import { readFileSync, writeFileSync } from "fs"
import { extname, basename, join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import { extractDocx } from "./extractors/docx"
import { extractPptx } from "./extractors/pptx"
import { extractXlsx } from "./extractors/xlsx"

// Extension → extractor function mapping
const HANDLERS: Record<string, (buf: Buffer) => Promise<string>> = {
  ".docx": extractDocx,
  ".pptx": extractPptx,
  ".xlsx": extractXlsx,
}

/**
 * Intercept read tool args before execution.
 * If the file is a supported binary format, extract its text and redirect
 * args.filePath to a temp .txt file containing the extracted content.
 *
 * @param args - Mutable read tool args object (from output.args in before-hook)
 */
export async function preRead(args: { filePath: string; [k: string]: any }): Promise<void> {
  const ext = extname(args.filePath).toLowerCase()
  const handler = HANDLERS[ext]
  if (!handler) return // Not a handled format — let read tool proceed normally

  const buf = readFileSync(args.filePath)
  const text = await handler(buf)

  // Write extracted text to a temp file, prefixed with source info
  const header = `[Extracted from: ${basename(args.filePath)}]\n\n`
  const tmpPath = join(tmpdir(), `revela-${randomUUID()}.txt`)
  writeFileSync(tmpPath, header + text, "utf-8")

  // Redirect read tool to the temp file
  args.filePath = tmpPath
}
