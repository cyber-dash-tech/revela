import { DECKS_STATE_FILE } from "../decks-state"
import { compileCacheMirrorNarrativeVault } from "./compile-mirror"
import { narrativeVaultCachePath } from "./paths"
import type { VaultDiagnosticDisplay } from "./diagnostic-report"
import { runNarrativeMarkdownQa, type MarkdownQaReport } from "./markdown-qa"

export interface AutoCompileNarrativeVaultResult {
  ok: boolean
  mirrored: "updated" | "skipped_no_decks" | "preserved_failed_compile" | "failed"
  cachePath: string
  touched: string[]
  markdownQa?: MarkdownQaReport
  error?: string
  markdown: string
}

export function autoCompileNarrativeVault(workspaceRoot: string, touched: string[]): AutoCompileNarrativeVaultResult {
  const uniqueTouched = [...new Set(touched)].sort()
  const cachePath = relativeCachePath(workspaceRoot)

  try {
    const markdownQa = runNarrativeMarkdownQa(workspaceRoot, uniqueTouched)
    const compiled = compileCacheMirrorNarrativeVault(workspaceRoot)
    const mirrored = compiled.mirrorStatus
    const ok = compiled.result.ok && markdownQa.ok

    return {
      ok,
      mirrored,
      cachePath,
      touched: uniqueTouched,
      markdownQa,
      markdown: formatAutoCompileReport({
        ok,
        mirrored,
        cachePath,
        touched: uniqueTouched,
        markdownQa,
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
  markdownQa?: MarkdownQaReport
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
  appendMarkdownQa(lines, input.markdownQa)
  appendDiagnostics(lines, "Blockers", input.blockers ?? [])
  appendDiagnostics(lines, "Warnings", input.warnings ?? [])
  return lines.join("\n")
}

function appendMarkdownQa(lines: string[], report?: MarkdownQaReport): void {
  if (!report) return
  const total = report.repairCards.length
  lines.push(`Markdown QA: ${report.ok ? "clean" : "blocked"}${total > 0 ? ` (${report.blockers.length} blocker(s), ${report.warnings.length} warning(s))` : ""}`)
  appendRepairCards(lines, "Markdown QA blockers", report.blockers)
  appendRepairCards(lines, "Markdown QA warnings", report.warnings)
}

function appendRepairCards(lines: string[], label: string, cards: MarkdownQaReport["repairCards"]): void {
  const shown = cards.slice(0, 8)
  if (shown.length === 0) return
  lines.push("", `${label}:`)
  for (const card of shown) {
    const location = [card.file, card.nodeId].filter(Boolean).join(" / ")
    lines.push(`- \`${card.issueCode}\`${location ? ` (${location})` : ""}: ${card.message} Smallest repair: ${card.smallestRepair}`)
  }
  if (cards.length > shown.length) lines.push(`- ... ${cards.length - shown.length} more`)
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
