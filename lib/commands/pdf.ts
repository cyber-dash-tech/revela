/**
 * lib/commands/pdf.ts
 *
 * Handler for `/revela export --deck pdf <file_path>` — exports an HTML slide deck to PDF.
 *
 * Output: same directory and base name as the input, with .pdf extension.
 * Example: decks/my-deck.html → decks/my-deck.pdf
 */

import { existsSync, readdirSync } from "fs"
import { resolve } from "path"
import { exportToPdf } from "../pdf/export"
import { assertExportQAPassed } from "../qa/export-gate"
import { recordRenderedArtifact, workspaceRelative } from "../workspace-state/rendered-artifacts"

export async function handlePdf(
  filePath: string,
  send: (text: string) => Promise<void>,
  workspaceRoot = process.cwd(),
): Promise<void> {
  const root = resolve(workspaceRoot)
  const resolvedFile = resolvePdfDeckFile(root, filePath)

  if (!resolvedFile.ok) {
    await send(
      `**PDF export cannot start**\n\n${resolvedFile.error}\n\n` +
      "Usage: `/revela export --deck pdf [file_path]`"
    )
    return
  }

  const abs = resolvedFile.deck.absoluteFile
  await send(`Running pre-export QA for \`${abs}\`...`)

  try {
    await assertExportQAPassed(abs, { workspaceRoot: root })
    await send(`Exporting \`${abs}\` to PDF...`)
    const result = await exportToPdf(abs)
    recordRenderedArtifact(root, {
      sourceHtmlPath: resolvedFile.deck.file,
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

function resolvePdfDeckFile(workspaceRoot: string, filePath: string): { ok: true; deck: { file: string; absoluteFile: string } } | { ok: false; error: string } {
  const explicit = filePath.trim()
  if (explicit) {
    const absoluteFile = resolve(workspaceRoot, explicit)
    if (!existsSync(absoluteFile)) return { ok: false, error: `Deck HTML not found: ${explicit}` }
    if (!/\.html?$/i.test(absoluteFile)) return { ok: false, error: `File must be an HTML file: ${explicit}` }
    return { ok: true, deck: { file: workspaceRelative(workspaceRoot, absoluteFile), absoluteFile } }
  }

  const htmlFiles = listDeckHtmlFiles(workspaceRoot)
  if (htmlFiles.length === 0) return { ok: false, error: "No deck HTML found in decks/. Pass a file path or generate a deck first." }
  if (htmlFiles.length > 1) return { ok: false, error: `Multiple deck HTML files found in decks/: ${htmlFiles.join(", ")}. Pass the deck path explicitly.` }
  const absoluteFile = resolve(workspaceRoot, htmlFiles[0])
  return { ok: true, deck: { file: workspaceRelative(workspaceRoot, absoluteFile), absoluteFile } }
}

function listDeckHtmlFiles(workspaceRoot: string): string[] {
  const dir = resolve(workspaceRoot, "decks")
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => `decks/${entry.name}`)
    .sort((a, b) => a.localeCompare(b))
}
