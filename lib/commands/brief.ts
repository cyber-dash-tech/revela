import { existsSync, mkdirSync, writeFileSync } from "fs"
import { dirname, isAbsolute, join, normalize, resolve } from "path"
import { readDecksState, writeDecksState } from "../decks-state"
import { compileExecutiveBrief, DEFAULT_EXECUTIVE_BRIEF_PATH } from "../narrative-state/executive-brief"

export interface BriefArgs {
  outputPath?: string
}

export type ParseBriefArgsResult = { ok: true; args: BriefArgs } | { ok: false; error: string }

export function parseBriefArgs(input: string): ParseBriefArgsResult {
  const value = input.trim()
  if (!value) return { ok: true, args: {} }
  if (value.startsWith("--")) return { ok: false, error: "Usage: `/revela make --brief [workspace-relative-output.md]`" }
  if (!value.endsWith(".md")) return { ok: false, error: "Executive brief output must be a Markdown file ending in `.md`." }
  if (isAbsolute(value) || value.split(/[\\/]+/).includes("..")) return { ok: false, error: "Executive brief output must be a safe workspace-relative path." }
  return { ok: true, args: { outputPath: normalize(value).replace(/\\/g, "/") } }
}

export async function handleBrief(
  input: { workspaceRoot: string; outputPath?: string },
  send: (text: string) => Promise<void>,
): Promise<void> {
  const statePath = join(input.workspaceRoot, "DECKS.json")
  if (!existsSync(statePath)) {
    await send("No `DECKS.json` found. Run `/revela init` before rendering an executive brief.")
    return
  }

  const state = readDecksState(input.workspaceRoot)
  const result = compileExecutiveBrief(state, { outputPath: input.outputPath })
  if (!result.ok) {
    await send(
      `**Executive brief not rendered**\n\n${result.reason}\n\n` +
      (result.narrativeHash ? `Narrative hash: \`${result.narrativeHash}\`\n\n` : "") +
      "Run `/revela story` and approve the current narrative, or record an explicit render override before retrying."
    )
    return
  }

  const filePath = safeWorkspaceFilePath(input.workspaceRoot, result.outputPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, result.content, "utf-8")
  writeDecksState(input.workspaceRoot, result.state)

  await send(
    `**Executive brief rendered**\n\n` +
    `- Output: \`${result.outputPath}\`\n` +
    `- Render target: \`${result.target.id}\`\n` +
    `- Narrative hash: \`${result.narrativeHash}\`\n\n` +
    "The brief was compiled from canonical narrative state, not from a deck summary."
  )
}

function safeWorkspaceFilePath(workspaceRoot: string, outputPath: string): string {
  const relative = outputPath || DEFAULT_EXECUTIVE_BRIEF_PATH
  if (isAbsolute(relative) || relative.split(/[\\/]+/).includes("..")) throw new Error("Executive brief output must be a safe workspace-relative path.")
  const root = resolve(workspaceRoot)
  const target = resolve(root, relative)
  if (target !== root && !target.startsWith(`${root}/`)) throw new Error("Executive brief output must stay inside the workspace.")
  return target
}
