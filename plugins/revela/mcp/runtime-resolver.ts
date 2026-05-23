import { existsSync, readFileSync } from "fs"
import { dirname, join, resolve } from "path"

export interface ResolveRuntimeOptions {
  pluginRoot: string
  env?: Record<string, string | undefined>
  homeDir?: string
}

export interface ResolveRuntimeResult {
  ok: boolean
  repoRoot?: string
  runtimePath?: string
  source: "env" | "source-checkout" | "codex-marketplace" | "bundled" | "missing"
  diagnostics: string[]
}

export function resolveRevelaRuntime(options: ResolveRuntimeOptions): ResolveRuntimeResult {
  const env = options.env ?? process.env
  const pluginRoot = resolve(options.pluginRoot)
  const diagnostics: string[] = []

  const explicit = env.REVELA_REPO_ROOT
  if (explicit) {
    const result = runtimeAt(explicit, "env", diagnostics)
    if (result.ok) return result
    diagnostics.push(`REVELA_REPO_ROOT did not contain lib/runtime/index.ts: ${explicit}`)
  }

  const checkout = findSourceCheckoutRoot(pluginRoot)
  if (checkout) return runtimeAt(checkout, "source-checkout", diagnostics)
  diagnostics.push(`No source checkout root found above plugin root: ${pluginRoot}`)

  const marketplaceName = marketplaceNameFromPluginRoot(pluginRoot)
  if (marketplaceName) {
    const source = marketplaceSourceFromCodexConfig(marketplaceName, options.homeDir ?? env.HOME)
    if (source) {
      const result = runtimeAt(source, "codex-marketplace", diagnostics)
      if (result.ok) return result
      diagnostics.push(`Marketplace ${marketplaceName} source did not contain lib/runtime/index.ts: ${source}`)
    } else {
      diagnostics.push(`Marketplace ${marketplaceName} was not found in Codex config.`)
    }
  } else {
    diagnostics.push(`Could not infer marketplace name from plugin root: ${pluginRoot}`)
  }

  const bundled = runtimeAt(pluginRoot, "bundled", diagnostics)
  if (bundled.ok) return bundled
  diagnostics.push(`No bundled runtime found under plugin root: ${pluginRoot}`)

  return { ok: false, source: "missing", diagnostics }
}

function runtimeAt(root: string, source: ResolveRuntimeResult["source"], diagnostics: string[]): ResolveRuntimeResult {
  const repoRoot = resolve(root)
  const runtimePath = join(repoRoot, "lib", "runtime", "index.ts")
  return existsSync(runtimePath)
    ? { ok: true, repoRoot, runtimePath, source, diagnostics }
    : { ok: false, source: "missing", diagnostics }
}

function findSourceCheckoutRoot(pluginRoot: string): string | undefined {
  let current = resolve(pluginRoot)
  for (let i = 0; i < 6; i++) {
    if (
      existsSync(join(current, "package.json")) &&
      existsSync(join(current, "lib", "runtime", "index.ts")) &&
      existsSync(join(current, "plugins", "revela", ".codex-plugin", "plugin.json"))
    ) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
}

function marketplaceNameFromPluginRoot(pluginRoot: string): string | undefined {
  const parts = resolve(pluginRoot).split(/[\\/]+/)
  const cacheIndex = parts.lastIndexOf("cache")
  if (cacheIndex === -1) return undefined
  return parts[cacheIndex + 1] || undefined
}

function marketplaceSourceFromCodexConfig(marketplaceName: string, homeDir: string | undefined): string | undefined {
  if (!homeDir) return undefined
  const configPath = join(homeDir, ".codex", "config.toml")
  if (!existsSync(configPath)) return undefined
  const text = readFileSync(configPath, "utf-8")
  const section = sectionBody(text, `marketplaces.${marketplaceName}`)
  if (!section) return undefined
  const match = section.match(/^\s*source\s*=\s*"([^"]+)"/m)
  return match?.[1]
}

function sectionBody(text: string, sectionName: string): string | undefined {
  const lines = text.split(/\r?\n/)
  const header = `[${sectionName}]`
  const start = lines.findIndex((line) => line.trim() === header)
  if (start === -1) return undefined
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break
    body.push(line)
  }
  return body.join("\n")
}
