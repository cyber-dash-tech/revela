import { dirname, resolve } from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { resolveRevelaRuntime } from "../mcp/runtime-resolver"
import { workspaceRootFromInput } from "./revela_post_write_notice"

interface HookResult {
  ok: boolean
  messages: string[]
}

const controlledStateFile = "DECKS" + ".json"

export async function runPreWriteChecks(input: string): Promise<HookResult> {
  const messages: string[] = []

  if (input.includes(controlledStateFile)) {
    messages.push(`Revela controls ${controlledStateFile}. Use Revela MCP/runtime tools or file-native narrative files instead of direct ${controlledStateFile} patches.`)
  }

  const cacheTargets = extractNarrativeCachePatchTargets(input)
  if (cacheTargets.length > 0) {
    messages.push([
      "Revela narrative cache patches are blocked.",
      `Controlled cache target(s): ${cacheTargets.map((target) => `\`${target}\``).join(", ")}`,
      "Edit `revela-narrative/**/*.md` instead; compile/cache files under `.opencode/revela/narrative-cache/` are regenerated.",
    ].join("\n"))
  }

  const deckTargets = extractDeckHtmlPatchTargets(input)
  if (deckTargets.length > 0) {
    const pluginRoot = resolve(process.env.PLUGIN_ROOT || dirname(dirname(fileURLToPath(import.meta.url))))
    const runtime = resolveRevelaRuntime({ pluginRoot })
    if (!runtime.ok || !runtime.runtimePath) {
      messages.push([
        "Revela deck HTML patch blocked because Codex could not locate the Revela runtime to verify active design rules.",
        ...runtime.diagnostics.map((item) => `- ${item}`),
      ].join("\n"))
    } else {
      const workspaceRoot = workspaceRootFromInput(input)
      const runtimeModule = await import(pathToFileURL(runtime.runtimePath).href)
      const result = runtimeModule.checkDesignRulesReadiness({ workspaceRoot })
      if (!result.ok) {
        messages.push([
          "Revela deck HTML patch blocked: active design rules must be loaded before patching `decks/*.html`.",
          `Reason: ${result.reason ?? "Design rules marker is missing or stale."}`,
          `Active design: ${result.activeDesign ?? "unknown"}`,
          "Next step: call `revela_design_read` with `section: \"rules\"` for this workspace, then retry the patch.",
          "Deck slides must use `<section class=\"slide\" ...><div class=\"slide-canvas\">...</div></section>` with exactly one direct `.slide-canvas` child.",
        ].join("\n"))
      }
    }
  }

  return { ok: messages.length === 0, messages }
}

export function extractDeckHtmlPatchTargets(input: string): string[] {
  const targets = new Set<string>()
  for (const patch of patchPayloads(input)) {
    const pattern = /(?:^\*\*\* Update File: |^\*\*\* Add File: )([^\r\n]*decks\/[^\r\n]+\.html)\s*$/gm
    let match: RegExpExecArray | null
    while ((match = pattern.exec(patch))) targets.add(match[1].trim())
  }
  return [...targets].sort((a, b) => a.localeCompare(b))
}

export function extractNarrativeCachePatchTargets(input: string): string[] {
  const targets = new Set<string>()
  for (const patch of patchPayloads(input)) {
    const pattern = /(?:^\*\*\* Update File: |^\*\*\* Add File: |^\*\*\* Delete File: |^\*\*\* Move to: )([^\r\n]*\.opencode\/revela\/narrative-cache\/[^\r\n]+)\s*$/gm
    let match: RegExpExecArray | null
    while ((match = pattern.exec(patch))) targets.add(match[1].trim())
  }
  return [...targets].sort((a, b) => a.localeCompare(b))
}

function patchPayloads(input: string): string[] {
  try {
    const parsed = JSON.parse(input)
    return [
      parsed.patch,
      parsed.args?.patch,
      parsed.tool_input?.patch,
      parsed.toolInput?.patch,
    ].filter((item): item is string => typeof item === "string")
  } catch {
    return [input]
  }
}

if (import.meta.main) {
  const input = await new Response(Bun.stdin.stream()).text()
  try {
    const result = await runPreWriteChecks(input)
    if (result.messages.length > 0) console.error(result.messages.join("\n\n---\n\n"))
    process.exit(result.ok ? 0 : 2)
  } catch (e) {
    console.error("Revela pre-write hook failed to run.")
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(2)
  }
}
