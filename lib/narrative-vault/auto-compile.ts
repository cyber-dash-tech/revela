import { existsSync } from "fs"
import { join } from "path"
import { DECKS_STATE_FILE, readDecksState, writeDecksState } from "../decks-state"
import { formatVaultDiagnosticReport } from "./diagnostic-report"
import { compileNarrativeVault } from "./compile"
import { writeNarrativeVaultCache } from "./cache"
import { narrativeVaultCachePath } from "./paths"
import type { VaultDiagnosticDisplay } from "./diagnostic-report"

export interface AutoCompileNarrativeVaultResult {
  ok: boolean
  mirrored: "updated" | "skipped_no_decks" | "preserved_failed_compile" | "failed"
  cachePath: string
  touched: string[]
  error?: string
  markdown: string
}

export function autoCompileNarrativeVault(workspaceRoot: string, touched: string[]): AutoCompileNarrativeVaultResult {
  const uniqueTouched = [...new Set(touched)].sort()
  const cachePath = relativeCachePath(workspaceRoot)

  try {
    const decksPath = join(workspaceRoot, DECKS_STATE_FILE)
    const hasDecks = existsSync(decksPath)
    const state = hasDecks ? readDecksState(workspaceRoot) : undefined
    const compiled = compileNarrativeVault(workspaceRoot, { fallbackApprovals: state?.narrative?.approvals ?? [] })
    const report = formatVaultDiagnosticReport(compiled.diagnostics)

    writeNarrativeVaultCache(workspaceRoot, compiled)

    let mirrored: AutoCompileNarrativeVaultResult["mirrored"] = "skipped_no_decks"
    if (hasDecks) {
      if (compiled.ok && compiled.narrative && state) {
        state.narrative = compiled.narrative
        writeDecksState(workspaceRoot, state)
        mirrored = "updated"
      } else {
        mirrored = "preserved_failed_compile"
      }
    }

    return {
      ok: compiled.ok,
      mirrored,
      cachePath,
      touched: uniqueTouched,
      markdown: formatAutoCompileReport({
        ok: compiled.ok,
        mirrored,
        cachePath,
        touched: uniqueTouched,
        blockers: report.blockers,
        warnings: report.warnings,
      }),
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      mirrored: "failed",
      cachePath,
      touched: uniqueTouched,
      error,
      markdown: formatAutoCompileReport({ ok: false, mirrored: "failed", cachePath, touched: uniqueTouched, error }),
    }
  }
}

export function formatAutoCompileReport(input: {
  ok: boolean
  mirrored: AutoCompileNarrativeVaultResult["mirrored"]
  cachePath: string
  touched: string[]
  blockers?: VaultDiagnosticDisplay[]
  warnings?: VaultDiagnosticDisplay[]
  error?: string
}): string {
  const lines = ["**[revela narrative vault]** Auto-compile completed.", ""]
  lines.push(`Status: ${input.ok ? "ok" : "blocked"}`)
  lines.push(`Mirror: ${mirrorLabel(input.mirrored)}`)
  lines.push(`Cache: \`${input.cachePath}\``)
  lines.push(`Touched Markdown: ${formatTouched(input.touched)}`)

  if (input.error) lines.push("", `Hook error: ${input.error}`)
  appendDiagnostics(lines, "Blockers", input.blockers ?? [])
  appendDiagnostics(lines, "Warnings", input.warnings ?? [])
  return lines.join("\n")
}

function appendDiagnostics(lines: string[], label: string, diagnostics: VaultDiagnosticDisplay[]): void {
  const shown = diagnostics.slice(0, 8)
  if (shown.length === 0) return
  lines.push("", `${label}:`)
  for (const diagnostic of shown) lines.push(`- ${formatDiagnostic(diagnostic)}`)
  if (diagnostics.length > shown.length) lines.push(`- ... ${diagnostics.length - shown.length} more`)
}

function formatDiagnostic(diagnostic: VaultDiagnosticDisplay): string {
  const location = [diagnostic.file, diagnostic.nodeId].filter(Boolean).join(" / ")
  return `\`${diagnostic.code}\`${location ? ` (${location})` : ""}: ${diagnostic.message}`
}

function formatTouched(touched: string[]): string {
  const shown = touched.slice(0, 10).map((target) => `\`${target}\``)
  if (touched.length > 10) shown.push(`... ${touched.length - 10} more`)
  return shown.length > 0 ? shown.join(", ") : "none"
}

function mirrorLabel(mirrored: AutoCompileNarrativeVaultResult["mirrored"]): string {
  switch (mirrored) {
    case "updated":
      return `${DECKS_STATE_FILE} narrative mirror updated`
    case "skipped_no_decks":
      return `${DECKS_STATE_FILE} not found; no state created`
    case "preserved_failed_compile":
      return `${DECKS_STATE_FILE} narrative mirror preserved because compile is blocked`
    case "failed":
      return "not updated because auto-compile failed"
  }
}

function relativeCachePath(workspaceRoot: string): string {
  const cachePath = narrativeVaultCachePath(workspaceRoot).replace(/\\/g, "/")
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "")
  return cachePath.startsWith(root + "/") ? cachePath.slice(root.length + 1) : cachePath
}
