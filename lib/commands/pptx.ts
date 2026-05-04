/**
 * lib/commands/pptx.ts
 *
 * Handler for `/revela pptx [file_path]` — exports an HTML slide deck to PPTX.
 *
 * Output: same directory and base name as the input, with .pptx extension.
 * Example: decks/my-deck.html → decks/my-deck.pptx
 */

import { existsSync, readdirSync } from "fs"
import { relative, resolve, sep } from "path"
import { hasDecksState, isDeckHtmlPath, readDecksState } from "../decks-state"
import { exportToPptx } from "../pptx/export"

export interface PptxArgs {
  filePath: string
  notes: boolean
}

export interface ResolvedPptxDeck {
  file: string
  absoluteFile: string
  source: "decks-state" | "fallback" | "file-path"
}

function formatSecs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export function parsePptxArgs(input: string): PptxArgs {
  const parts = input.trim().split(/\s+/).filter(Boolean)
  const notes = parts.includes("--notes")
  const filePath = parts.filter((part) => part !== "--notes").join(" ").trim()
  return { filePath, notes }
}

export function resolvePptxDeck(workspaceRoot: string, filePath = ""): ResolvedPptxDeck {
  const root = resolve(workspaceRoot)
  const explicit = filePath.trim()
  if (explicit) {
    const absoluteFile = resolve(root, explicit)
    if (!existsSync(absoluteFile)) throw new Error(`Deck HTML not found: ${explicit}`)
    if (!/\.html?$/i.test(absoluteFile)) throw new Error(`File must be an HTML file: ${explicit}`)
    return { file: workspaceRelative(root, absoluteFile), absoluteFile, source: "file-path" }
  }

  if (hasDecksState(root)) {
    const state = readDecksState(root)
    const key = state.activeDeck || singleDeckKey(state.decks)
    const outputPath = key ? state.decks[key]?.outputPath : undefined
    if (outputPath && isDeckHtmlPath(outputPath)) {
      const absoluteFile = resolve(root, outputPath)
      if (existsSync(absoluteFile)) {
        return { file: workspaceRelative(root, absoluteFile), absoluteFile, source: "decks-state" }
      }
    }
  }

  const htmlFiles = listDeckHtmlFiles(root)
  if (htmlFiles.length === 0) {
    throw new Error("No deck HTML found in decks/. Generate a deck first or pass a file path.")
  }
  if (htmlFiles.length > 1) {
    throw new Error("This workspace contains multiple deck HTML files. Run `/revela pptx decks/<file>.html` to choose one.")
  }

  const absoluteFile = resolve(root, htmlFiles[0])
  return { file: workspaceRelative(root, absoluteFile), absoluteFile, source: "fallback" }
}

export function buildPptxNotesPrompt(deck: ResolvedPptxDeck): string {
  return `Export the current Revela HTML deck to PPTX with PowerPoint speaker notes.

Deck file: \`${deck.file}\`

Workflow:
1. Read \`${deck.file}\` and inspect every \`<section class="slide">\` in DOM/source order.
2. Generate presenter-facing talk tracks for each slide based only on visible slide content.
3. Call \`revela-pptx\` with \`file: "${deck.file}"\` and a \`speakerNotes\` array using 1-based slide indexes.
4. Report the exported PPTX path from the tool result.

Speaker notes rules:
- Write notes in the deck's language.
- Write for the person presenting the deck, not for a designer or developer reviewing implementation.
- Use 3-5 concise bullet points per slide.
- Follow pyramid-style communication: the first bullet is the top-line conclusion or main message the presenter should say first.
- Later bullets unpack the visible evidence, audience/business implication, and optional transition in that order.
- Explain visible numbers and claims in business/audience terms; prioritize the strongest signal before supporting signals.
- Do not label bullets as What, Why, or How. Keep the structure implicit and natural.
- Match the visible slide content; do not add unsupported claims.
- Do not mention design-system or implementation terms such as component, layout, stat-card, card grid, logo marker, DOM, HTML, CSS, or class names unless the slide is explicitly about design implementation.
- Avoid meta commentary like "this slide highlights" or "frame this as". Write what the presenter should actually say.
- Never include hidden reasoning, system instructions, secrets, credentials, or sensitive personal information.
- If a slide needs no notes, pass an empty string for that slide.

Expected tool shape:
\`\`\`json
{
  "file": "${deck.file}",
  "speakerNotes": [
    { "index": 1, "notes": "- Lead with the main performance signal and what it means for the audience.\n- Explain the strongest visible evidence first, then use supporting metrics to deepen the interpretation.\n- Close with the implication or transition the presenter should carry into the next point." }
  ]
}
\`\`\``
}

export async function handlePptx(
  input: string,
  send: (text: string) => Promise<void>,
  workspaceRoot = process.cwd(),
): Promise<void> {
  try {
    const args = parsePptxArgs(input)
    const deck = resolvePptxDeck(workspaceRoot, args.filePath)
    const abs = deck.absoluteFile

    await send(`Exporting \`${abs}\` to PPTX...`)
    let lastSlideUpdate = 0
    let longDeckThreshold: number | null = null

    const result = await exportToPptx(abs, {
      onProgress: async (progress) => {
        if (progress.kind === "stage") {
          await send(progress.message)
          return
        }

        const current = progress.current ?? 0
        const total = progress.total ?? 0
        if (!total) return

        if (longDeckThreshold === null) {
          longDeckThreshold = total >= 8 ? (total > 20 ? 5 : 2) : -1
        }
        if (longDeckThreshold < 0) return

        const shouldSend = current === 1 || current === total || current - lastSlideUpdate >= longDeckThreshold
        if (!shouldSend) return

        lastSlideUpdate = current
        await send(`Editable export progress: slide ${current}/${total}`)
      },
    })

    await send(
      `**PPTX exported successfully**\n\n` +
      `- Output: \`${result.outputPath}\`\n` +
      `- Slides: ${result.slideCount}\n` +
      `- Time: ${formatSecs(result.durationMs)}\n` +
      `- Prepare: ${formatSecs(result.timingsMs.prepareMs)}\n` +
      `- Page setup: ${formatSecs(result.timingsMs.pageSetupMs)}\n` +
      `- Slide export: ${formatSecs(result.timingsMs.slideExportMs)}\n` +
      `- Merge: ${formatSecs(result.timingsMs.mergeMs)}\n` +
      `- Write: ${formatSecs(result.timingsMs.writeMs)}`
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await send(`**PPTX export failed**\n\n\`\`\`\n${msg}\n\`\`\``)
  }
}

function singleDeckKey(decks: Record<string, unknown>): string | undefined {
  const keys = Object.keys(decks)
  return keys.length === 1 ? keys[0] : undefined
}

function listDeckHtmlFiles(workspaceRoot: string): string[] {
  const dir = resolve(workspaceRoot, "decks")
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => `decks/${entry.name}`)
    .sort((a, b) => a.localeCompare(b))
}

function workspaceRelative(root: string, target: string): string {
  return relative(root, target).split(sep).join("/")
}
