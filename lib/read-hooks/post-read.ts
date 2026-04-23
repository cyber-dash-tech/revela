/**
 * lib/read-hooks/post-read.ts
 *
 * After-hook handler for the OpenCode `read` tool.
 * Called from `tool.execute.after` in plugin.ts.
 *
 * Handles PDF and images — formats where read tool succeeds and returns
 * a base64 attachment. The after-hook fires after execution but before
 * the result reaches the LLM, so we can replace the output here.
 *
 * PDF strategy:    extract text from base64 → replace output string → remove attachment
 * Image strategy:  decompress base64 → jimp compress → re-encode → replace attachment
 *
 * Note: `output.attachments` is present at runtime despite not being in the
 * TypeScript type definition for tool.execute.after. Confirmed via source inspection
 * of packages/opencode/src/session/prompt.ts.
 */

import { basename } from "path"
import { extractPdfText } from "./extractors/pdf"
import { compressImage } from "./image/compress"
import { classifyReadFile, formatExtractedText } from "./dispatch"

interface ReadOutput {
  title: string
  output: string
  metadata: any
  attachments?: Array<{ url: string; mime: string; [k: string]: any }>
}

/**
 * Post-process read tool output for PDF and image files.
 *
 * @param args   - Read tool args (input.args in after-hook)
 * @param output - Mutable read tool output (output in after-hook)
 */
export async function postRead(
  args: { filePath: string; [k: string]: any },
  output: ReadOutput,
): Promise<void> {
  if (!output.attachments?.length) return

  const strategy = classifyReadFile(args.filePath)

  // ── PDF: extract text, drop base64 attachment ───────────────────────────
  if (strategy === "after-extract-text") {
    const attachment = output.attachments[0]
    const base64 = attachment.url.split(",")[1]
    if (!base64) return

    const buf = Buffer.from(base64, "base64")
    const text = await extractPdfText(buf)

    output.output = formatExtractedText(args.filePath, text)
    output.title = `Extracted text from ${basename(args.filePath)}`
    output.attachments.length = 0 // Remove base64 — saves significant tokens
    return
  }

  // ── Images: compress attachment to reduce token cost ────────────────────
  if (strategy === "after-compress-image") {
    const attachment = output.attachments[0]
    const base64 = attachment.url.split(",")[1]
    if (!base64) return

    const buf = Buffer.from(base64, "base64")
    const compressed = await compressImage(buf)

    // Replace with compressed JPEG
    attachment.url = `data:image/jpeg;base64,${compressed.toString("base64")}`
    attachment.mime = "image/jpeg"
  }
}
