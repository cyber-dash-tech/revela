import { DECKS_STATE_FILE } from "../decks-state"
import { runVaultAuthoringGuard, type VaultAuthoringGuardReport } from "./authoring-guard"
import { compileCacheMirrorNarrativeVault } from "./compile-mirror"
import { narrativeVaultCachePath } from "./paths"
import type { VaultDiagnosticDisplay } from "./diagnostic-report"

export interface AutoCompileNarrativeVaultResult {
  ok: boolean
  mirrored: "updated" | "skipped_no_decks" | "preserved_failed_compile" | "failed"
  cachePath: string
  touched: string[]
  authoringGuard?: VaultAuthoringGuardReport
  error?: string
  markdown: string
}

export function autoCompileNarrativeVault(workspaceRoot: string, touched: string[]): AutoCompileNarrativeVaultResult {
  const uniqueTouched = [...new Set(touched)].sort()
  const cachePath = relativeCachePath(workspaceRoot)

  try {
    const authoringGuard = runVaultAuthoringGuard(workspaceRoot, uniqueTouched)
    const compiled = compileCacheMirrorNarrativeVault(workspaceRoot)
    const mirrored = compiled.mirrorStatus
    const ok = compiled.result.ok && authoringGuard.ok

    return {
      ok,
      mirrored,
      cachePath,
      touched: uniqueTouched,
      authoringGuard,
      markdown: formatAutoCompileReport({
        ok,
        mirrored,
        cachePath,
        touched: uniqueTouched,
        authoringGuard,
        blockers: compiled.diagnosticReport.blockers,
        warnings: compiled.diagnosticReport.warnings,
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
  authoringGuard?: VaultAuthoringGuardReport
  blockers?: VaultDiagnosticDisplay[]
  warnings?: VaultDiagnosticDisplay[]
  error?: string
}): string {
  const lines = ["**[revela narrative vault]** Auto-compile completed.", ""]
  lines.push(`Status: ${input.ok ? "ok" : "blocked"}`)
  lines.push(`State: ${mirrorLabel(input.mirrored)}`)
  lines.push(`Cache: \`${input.cachePath}\``)
  lines.push(`Touched Markdown: ${formatTouched(input.touched)}`)

  if (input.error) lines.push("", `Hook error: ${input.error}`)
  appendAuthoringGuard(lines, input.authoringGuard)
  appendDiagnostics(lines, "Blockers", input.blockers ?? [])
  appendDiagnostics(lines, "Warnings", input.warnings ?? [])
  return lines.join("\n")
}

function appendAuthoringGuard(lines: string[], report?: VaultAuthoringGuardReport): void {
  if (!report) return
  const total = report.blockers.length + report.warnings.length
  lines.push(`Authoring guard: ${report.ok ? "clean" : "blocked"}${total > 0 ? ` (${report.blockers.length} blocker(s), ${report.warnings.length} warning(s))` : ""}`)
  appendDiagnostics(lines, "Authoring blockers", report.blockers)
  appendDiagnostics(lines, "Authoring warnings", report.warnings)
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
      return `${DECKS_STATE_FILE} render state saved; runtime narrative hydrated from vault`
    case "skipped_no_decks":
      return `${DECKS_STATE_FILE} not found; no state created`
    case "preserved_failed_compile":
      return `${DECKS_STATE_FILE} render state preserved; last-good narrative cache kept because compile is blocked`
    case "failed":
      return "not updated because auto-compile failed"
  }
}

function relativeCachePath(workspaceRoot: string): string {
  const cachePath = narrativeVaultCachePath(workspaceRoot).replace(/\\/g, "/")
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "")
  return cachePath.startsWith(root + "/") ? cachePath.slice(root.length + 1) : cachePath
}
