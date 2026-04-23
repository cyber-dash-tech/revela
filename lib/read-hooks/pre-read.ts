/**
 * lib/read-hooks/pre-read.ts
 *
 * Before-hook handler for the OpenCode `read` tool.
 * Called from `tool.execute.before` in plugin.ts.
 *
 * Handles DOCX, PPTX, XLSX — formats that cause read tool to throw
 * Effect.fail("Cannot read binary file"), so the after-hook never fires.
 *
 * Strategy: materialize the document into cached text + images, render a
 * markdown read view, then redirect args.filePath to that temp .md file.
 * The read tool then reads the temp file normally. LLM is unaware of the redirect.
 */

import { writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import { classifyReadFile } from "./dispatch"
import { createOfficeReadView } from "./office-read-view"

/**
 * Intercept read tool args before execution.
 * If the file is a supported Office document, materialize it into cached
 * text + images and redirect args.filePath to a temporary markdown read view.
 *
 * @param args - Mutable read tool args object (from output.args in before-hook)
 */
export async function preRead(args: { filePath: string; [k: string]: any }): Promise<void> {
  if (classifyReadFile(args.filePath) !== "before-materialize-document") return

  const workspaceDir = process.cwd()
  const output = await createOfficeReadView(args.filePath, workspaceDir)

  const tmpPath = join(tmpdir(), `revela-${randomUUID()}.md`)
  writeFileSync(tmpPath, output, "utf-8")

  // Redirect read tool to the temp file
  args.filePath = tmpPath
}
