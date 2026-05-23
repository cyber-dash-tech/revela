import { existsSync } from "fs"
import { resolve } from "path"
import { DECKS_STATE_FILE, hasDecksState, normalizeWorkspaceDeckState, readDecksState } from "../decks-state"
import { extractDesignClasses } from "../design/designs"
import { compileInspectionContext, type InspectionContext } from "../inspection-context/compile"
import { computeNarrativeHash } from "../narrative-state/hash"
import { readDeckPlanArtifact } from "../narrative-state/deck-plan-artifact"
import { compileNarrativeVault } from "../narrative-vault/compile"
import { formatVaultDiagnosticMarkdown, formatVaultDiagnosticReport } from "../narrative-vault/diagnostic-report"
import { formatArtifactQAReport, runArtifactQA } from "../qa/artifact"
import { workspaceRelative } from "../workspace-state/rendered-artifacts"

export interface ReviewDeckReadInput {
  workspaceRoot?: string
  file: string
  format?: "json" | "markdown"
}

export interface ReviewDeckInspectionContextResult {
  ok: boolean
  skipped: boolean
  reason?: string
  context?: InspectionContext
}

export async function reviewDeckRead(input: ReviewDeckReadInput): Promise<any> {
  const workspaceRoot = root(input.workspaceRoot)
  const requestedFile = input.file?.trim()
  if (!requestedFile) {
    return {
      ok: false,
      file: "",
      error: "Missing required file.",
      diagnostics: [{ severity: "error", code: "missing_file", message: "Provide a workspace-relative or absolute deck HTML file." }],
    }
  }

  const filePath = resolve(workspaceRoot, requestedFile)
  const file = workspaceRelative(workspaceRoot, filePath)
  if (!existsSync(filePath)) {
    return {
      ok: false,
      file,
      error: `Deck HTML file not found: ${file}`,
      diagnostics: [{ severity: "error", code: "file_not_found", message: `Deck HTML file not found: ${file}` }],
    }
  }

  const artifactQa = await readArtifactQa(workspaceRoot, filePath)
  const narrativeRead = readNarrative(workspaceRoot)
  const deckPlan = readDeckPlan(workspaceRoot, narrativeRead.knownNodeIds, narrativeRead.narrativeHash)
  const { knownNodeIds: _knownNodeIds, ...narrative } = narrativeRead
  const inspectionContext = readInspectionContext(workspaceRoot, file)
  const diagnostics = {
    artifactQa: artifactQa.summary,
    deckPlan: summarizeDeckPlan(deckPlan),
    narrative: narrative.summary,
    inspectionContext: inspectionContext.ok
      ? { ok: true, skipped: false }
      : { ok: false, skipped: true, reason: inspectionContext.reason },
  }
  const markdown = input.format === "markdown"
    ? formatReviewDeckReadMarkdown({ file, artifactQa, deckPlan, narrative, inspectionContext })
    : undefined

  return {
    ok: artifactQa.ok,
    file,
    artifactQa,
    deckPlan,
    narrative,
    diagnostics,
    inspectionContext,
    artifactCoverage: inspectionContext.context?.artifactCoverage ?? [],
    evidenceTrace: inspectionContext.context?.slides.flatMap((slide) => slide.evidence) ?? narrative.evidenceTrace,
    markdown,
  }
}

async function readArtifactQa(workspaceRoot: string, filePath: string) {
  let vocabulary
  try {
    vocabulary = extractDesignClasses()
  } catch {
    // Design vocabulary is optional for standalone artifacts.
  }
  const report = await runArtifactQA({ workspaceRoot, filePath, vocabulary })
  return {
    ok: report.passed,
    summary: {
      passed: report.passed,
      errors: report.hardErrorCount,
      warnings: report.warningCount,
    },
    report,
    markdown: formatArtifactQAReport(report),
  }
}

function readNarrative(workspaceRoot: string): any {
  if (!existsSync(resolve(workspaceRoot, "revela-narrative"))) {
    return {
      ok: false,
      skipped: true,
      reason: "No revela-narrative/ vault exists; narrative diagnostics skipped.",
      summary: { ok: false, skipped: true, reason: "No revela-narrative/ vault exists; narrative diagnostics skipped." },
      evidenceTrace: [],
    }
  }

  const compiled = compileNarrativeVault(workspaceRoot)
  const report = formatVaultDiagnosticReport(compiled.diagnostics)
  const narrative = compiled.narrative
  return {
    ok: compiled.ok,
    skipped: false,
    narrativeHash: narrative ? computeNarrativeHash(narrative) : undefined,
    summary: report,
    diagnostics: compiled.diagnostics,
    diagnosticsMarkdown: formatVaultDiagnosticMarkdown(report),
    evidenceTrace: narrative?.evidenceBindings.map((binding) => ({
      id: binding.id,
      claimId: binding.claimId,
      source: binding.source,
      sourcePath: binding.sourcePath,
      findingsFile: binding.findingsFile,
      quote: binding.quote,
      location: binding.location,
      url: binding.url,
      supportScope: binding.supportScope,
      unsupportedScope: binding.unsupportedScope,
      caveat: binding.caveat,
      strength: binding.strength,
    })) ?? [],
    knownNodeIds: compiled.graph ? new Set(compiled.graph.nodes.map((node) => node.id)) : undefined,
  }
}

function readDeckPlan(workspaceRoot: string, knownNodeIds: Set<string> | undefined, narrativeHash: string | undefined) {
  return readDeckPlanArtifact(workspaceRoot, { knownNodeIds, narrativeHash })
}

function readInspectionContext(workspaceRoot: string, file: string): ReviewDeckInspectionContextResult {
  if (!hasDecksState(workspaceRoot)) {
    return {
      ok: false,
      skipped: true,
      reason: `No ${DECKS_STATE_FILE} exists; legacy inspection context skipped for file-native deck.`,
    }
  }

  try {
    const state = normalizeWorkspaceDeckState(readDecksState(workspaceRoot), workspaceRoot)
    const slug = Object.entries(state.decks).find(([, deck]) => normalizePath(deck.outputPath) === normalizePath(file))?.[0]
    if (!slug) {
      return {
        ok: false,
        skipped: true,
        reason: `No ${DECKS_STATE_FILE} deck outputPath matches ${file}; legacy inspection context skipped.`,
      }
    }
    return { ok: true, skipped: false, context: compileInspectionContext(state, slug) }
  } catch (e) {
    return {
      ok: false,
      skipped: true,
      reason: `Could not compile legacy inspection context: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

function summarizeDeckPlan(deckPlan: ReturnType<typeof readDeckPlanArtifact>) {
  return {
    ok: deckPlan.ok,
    skipped: !deckPlan.ok && Boolean(deckPlan.reason?.includes("missing")),
    warnings: deckPlan.warnings?.length ?? 0,
    reason: deckPlan.reason,
  }
}

function formatReviewDeckReadMarkdown(input: {
  file: string
  artifactQa: Awaited<ReturnType<typeof readArtifactQa>>
  deckPlan: ReturnType<typeof readDeckPlanArtifact>
  narrative: ReturnType<typeof readNarrative>
  inspectionContext: ReviewDeckInspectionContextResult
}): string {
  const lines = [
    "# Review Deck Read",
    "",
    `File: \`${input.file}\``,
    "",
    `Artifact QA: ${input.artifactQa.summary.passed ? "passed" : "failed"} (${input.artifactQa.summary.errors} hard error(s), ${input.artifactQa.summary.warnings} warning(s))`,
    `Deck-plan: ${input.deckPlan.ok ? "read" : `skipped/diagnostic - ${input.deckPlan.reason ?? "not available"}`}`,
    `Narrative: ${input.narrative.skipped ? input.narrative.reason : input.narrative.summary.summary}`,
    `Inspection context: ${input.inspectionContext.ok ? "read" : `skipped - ${input.inspectionContext.reason}`}`,
    "",
    input.artifactQa.markdown,
  ]
  if (!input.narrative.skipped && input.narrative.diagnosticsMarkdown) lines.push("", input.narrative.diagnosticsMarkdown)
  return lines.join("\n")
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "")
}

function root(workspaceRoot: string | undefined): string {
  return resolve(workspaceRoot || process.cwd())
}
