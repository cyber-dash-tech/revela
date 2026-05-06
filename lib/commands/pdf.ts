/**
 * lib/commands/pdf.ts
 *
 * Handler for `/revela pdf <file_path>` — exports an HTML slide deck to PDF.
 *
 * Output: same directory and base name as the input, with .pdf extension.
 * Example: decks/my-deck.html → decks/my-deck.pdf
 */

import { resolve } from "path"
import { hasDecksState, readDecksState } from "../decks-state"
import { exportToPdf } from "../pdf/export"
import { assertExportQAPassed } from "../qa/export-gate"
import { recordRenderedArtifact, workspaceRelative } from "../workspace-state/rendered-artifacts"
import { resolveActiveHtmlDeckPath } from "../workspace-state/render-targets"

export async function handlePdf(
  filePath: string,
  send: (text: string) => Promise<void>,
  workspaceRoot = process.cwd(),
): Promise<void> {
  const root = resolve(workspaceRoot)
  const resolvedFile = resolvePdfDeckFile(root, filePath)

  if (!resolvedFile) {
    await send(
      "**Usage:** `/revela pdf [file_path]`\n\n" +
      "Example: `/revela pdf decks/my-deck.html`"
    )
    return
  }

  const abs = resolvedFile.absoluteFile
  await send(`Running pre-export QA for \`${abs}\`...`)

  try {
    await assertExportQAPassed(abs, { workspaceRoot: root })
    await send(`Exporting \`${abs}\` to PDF...`)
    const result = await exportToPdf(abs)
    recordRenderedArtifact(root, {
      sourceHtmlPath: resolvedFile.file,
      outputPath: result.outputPath,
      type: "pdf",
      actor: "revela-pdf",
    })
    const secs = (result.durationMs / 1000).toFixed(1)
    await send(
      `**PDF exported successfully**\n\n` +
      `- Output: \`${result.outputPath}\`\n` +
      `- Slides: ${result.slideCount}\n` +
      `- Time: ${secs}s`
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await send(`**PDF export failed**\n\n\`\`\`\n${msg}\n\`\`\``)
  }
}

function resolvePdfDeckFile(workspaceRoot: string, filePath: string): { file: string; absoluteFile: string } | undefined {
  const explicit = filePath.trim()
  if (explicit) {
    const absoluteFile = resolve(workspaceRoot, explicit)
    return { file: workspaceRelative(workspaceRoot, absoluteFile), absoluteFile }
  }

  if (!hasDecksState(workspaceRoot)) return undefined
  const state = readDecksState(workspaceRoot)
  const activePath = resolveActiveHtmlDeckPath(state)
  if (!activePath) return undefined
  const absoluteFile = resolve(workspaceRoot, activePath)
  return { file: workspaceRelative(workspaceRoot, absoluteFile), absoluteFile }
}
