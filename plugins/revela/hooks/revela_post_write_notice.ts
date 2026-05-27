import { dirname, resolve } from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { resolveRevelaRuntime } from "../mcp/runtime-resolver"

interface HookResult {
  ok: boolean
  messages: string[]
}

export function extractDeckHtmlTargets(input: string): string[] {
  const targets = new Set<string>()
  const patterns = [
    /\bdecks\/[^\s"'`<>]+\.html\b/g,
    /(?:^\*\*\* Update File: |^\*\*\* Add File: )([^\r\n]+decks\/[^\r\n]+\.html)\s*$/gm,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(input))) {
      targets.add((match[1] ?? match[0]).trim())
    }
  }

  return [...targets].sort((a, b) => a.localeCompare(b))
}

export function workspaceRootFromInput(input: string): string {
  try {
    const parsed = JSON.parse(input)
    const candidates = [
      parsed.workspaceRoot,
      parsed.cwd,
      parsed.root,
      parsed.tool_input?.workspaceRoot,
      parsed.tool_input?.cwd,
      parsed.toolInput?.workspaceRoot,
      parsed.toolInput?.cwd,
    ]
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return resolve(candidate)
    }
  } catch {
    // Hook payloads are not guaranteed to be JSON across Codex versions.
  }
  return resolve(process.env.CODEX_WORKSPACE_ROOT || process.env.PWD || process.cwd())
}

export async function runPostWriteChecks(input: string): Promise<HookResult> {
  const messages: string[] = []
  if (/revela-narrative\/.*\.md/.test(input)) {
    messages.push("Revela narrative Markdown changed. Run `revela_markdown_qa` and `revela_compile_narrative` before treating the graph as usable.")
  }

  const deckTargets = extractDeckHtmlTargets(input)
  if (deckTargets.length === 0) return { ok: true, messages }

  const pluginRoot = resolve(process.env.PLUGIN_ROOT || dirname(dirname(fileURLToPath(import.meta.url))))
  const runtime = resolveRevelaRuntime({ pluginRoot })
  if (!runtime.ok || !runtime.runtimePath) {
    messages.push([
      "Revela deck HTML changed, but Codex hook could not locate the Revela runtime to run Artifact QA.",
      ...runtime.diagnostics.map((item) => `- ${item}`),
    ].join("\n"))
    return { ok: false, messages }
  }

  const workspaceRoot = workspaceRootFromInput(input)
  const runtimeModule = await import(pathToFileURL(runtime.runtimePath).href)
  let ok = true
  for (const target of deckTargets) {
    const result = await runtimeModule.runDeckQa({ workspaceRoot, file: target })
    messages.push(result.markdown ?? JSON.stringify(result, null, 2))
    if (!result.ok) ok = false
  }

  return { ok, messages }
}

if (import.meta.main) {
  const input = await new Response(Bun.stdin.stream()).text()
  try {
    const result = await runPostWriteChecks(input)
    if (result.messages.length > 0) console.error(result.messages.join("\n\n---\n\n"))
    process.exit(result.ok ? 0 : 2)
  } catch (e) {
    console.error("Revela post-write Artifact QA failed to run.")
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(2)
  }
}
