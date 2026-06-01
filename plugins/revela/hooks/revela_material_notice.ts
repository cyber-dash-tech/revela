import { dirname, resolve } from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { resolveRevelaRuntime } from "../mcp/runtime-resolver"
import { workspaceRootFromInput } from "./revela_post_write_notice"

export interface MaterialNoticeResult {
  ok: true
  messages: string[]
}

export async function runMaterialReadNotice(input: string): Promise<MaterialNoticeResult> {
  const command = commandFromInput(input)
  if (!command) return { ok: true, messages: [] }

  const pluginRoot = resolve(process.env.PLUGIN_ROOT || dirname(dirname(fileURLToPath(import.meta.url))))
  const runtime = resolveRevelaRuntime({ pluginRoot })
  if (!runtime.ok || !runtime.runtimePath) return { ok: true, messages: [] }

  const workspaceRoot = workspaceRootFromInput(input)
  const runtimeModule = await import(pathToFileURL(runtime.runtimePath).href)
  const notice = runtimeModule.materialIntakeNoticeForCommand?.({ workspaceRoot, command })
  return { ok: true, messages: notice ? [notice] : [] }
}

export function commandFromInput(input: string): string | null {
  try {
    const parsed = JSON.parse(input)
    const candidates = [
      parsed.cmd,
      parsed.command,
      parsed.args?.cmd,
      parsed.args?.command,
      parsed.tool_input?.cmd,
      parsed.tool_input?.command,
      parsed.toolInput?.cmd,
      parsed.toolInput?.command,
    ]
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate
    }
    return null
  } catch {
    return input.trim() || null
  }
}

if (import.meta.main) {
  const input = await new Response(Bun.stdin.stream()).text()
  try {
    const result = await runMaterialReadNotice(input)
    if (result.messages.length > 0) console.error(result.messages.join("\n\n---\n\n"))
    process.exit(0)
  } catch (e) {
    console.error("Revela material intake notice failed to run.")
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(0)
  }
}
