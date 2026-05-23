import { mkdirSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import { DECKS_STATE_FILE, hasDecksState, readDecksState, readOrCreateDecksState, writeDecksState, type DecksState } from "../decks-state"
import { stableEvidenceId } from "../narrative-state/hash"
import { evaluateResearchFindingsBinding } from "../narrative-state/research-binding-eval"
import { deriveResearchTargets } from "../narrative-state/research-gaps"
import { compileCacheMirrorNarrativeVault } from "../narrative-vault/compile-mirror"
import { compileNarrativeVault, formatVaultDiagnosticReport, hasNarrativeVault, updateVaultResearchGapNode, upsertVaultEvidenceNode } from "../narrative-vault"
import { recordWorkspaceAction } from "../workspace-state/actions"

export interface ResearchSaveInput {
  topic: string
  filename: string
  content: string
  sources?: string[]
  workspaceRoot?: string
}

export interface ResearchFindingsInput {
  findingsFile: string
  workspaceRoot?: string
}

export interface BindResearchFindingsInput extends ResearchFindingsInput {
  evidenceId?: string
}

export function researchTargets(input: { workspaceRoot?: string } = {}) {
  const workspaceRoot = root(input.workspaceRoot)
  const state = readOrCreateDecksState(workspaceRoot)
  return { ok: true, path: DECKS_STATE_FILE, result: deriveResearchTargets(state, { workspaceRoot }) }
}

export function researchSave(input: ResearchSaveInput) {
  const workspaceRoot = root(input.workspaceRoot)
  const topicKey = keyify(input.topic || "research")
  const fileKey = keyify(input.filename || "findings")
  const topicDir = join(workspaceRoot, "researches", topicKey)
  const sources = input.sources ?? []

  mkdirSync(topicDir, { recursive: true })
  const relPath = `researches/${topicKey}/${fileKey}.md`
  writeFileSync(join(topicDir, `${fileKey}.md`), `${buildFrontmatter(input.topic, fileKey, sources)}\n\n${input.content ?? ""}\n`, "utf-8")

  if (!hasDecksState(workspaceRoot)) return { ok: true, path: relPath }

  const state = readDecksState(workspaceRoot)
  recordWorkspaceAction(state, {
    type: "research.findings_saved",
    actor: "revela-research-save",
    inputs: { topic: topicKey, axis: fileKey, sourceCount: sources.length },
    outputs: { path: relPath, sources },
    summary: `Saved research findings for ${topicKey}/${fileKey}.`,
    nodeIds: [`finding:${relPath}`],
  })
  const bindingEval = evaluateResearchFindingsBinding(state, workspaceRoot, relPath)
  writeDecksState(workspaceRoot, state)
  return { ok: true, path: relPath, bindingEval }
}

export function evaluateResearchFindings(input: ResearchFindingsInput) {
  const workspaceRoot = root(input.workspaceRoot)
  if (!input.findingsFile?.trim()) return { ok: false, error: "findingsFile is required for evaluateResearchFindings" }
  const state = readOrCreateDecksState(workspaceRoot)
  const bindingEval = evaluateResearchFindingsBinding(state, workspaceRoot, input.findingsFile)
  const targets = deriveResearchTargets(state, { workspaceRoot })
  const vaultDiagnostics = hasNarrativeVault(workspaceRoot)
    ? formatVaultDiagnosticReport(compileNarrativeVault(workspaceRoot, { fallbackApprovals: state.narrative?.approvals ?? [] }).diagnostics)
    : undefined
  return { ok: true, path: DECKS_STATE_FILE, result: { bindingEval, selected: targets.selected, vaultDiagnostics } }
}

export function bindResearchFindings(input: BindResearchFindingsInput) {
  const workspaceRoot = root(input.workspaceRoot)
  if (!hasNarrativeVault(workspaceRoot)) return { ok: false, error: "bindResearchFindings requires revela-narrative/ to exist. Use initNarrativeVault first, then evaluateResearchFindings." }
  if (!input.findingsFile?.trim()) return { ok: false, error: "findingsFile is required for bindResearchFindings" }

  const state = readOrCreateDecksState(workspaceRoot)
  const bindingEval = evaluateResearchFindingsBinding(state, workspaceRoot, input.findingsFile)
  if (bindingEval.status !== "bindable" || !bindingEval.claimId || !bindingEval.recommendedEvidenceDraft) {
    return { ok: false, skipped: true, reason: "findings are not safely bindable", bindingEval }
  }

  const draft = bindingEval.recommendedEvidenceDraft
  const evidence = {
    id: input.evidenceId?.trim() || stableEvidenceId(bindingEval.claimId, `${bindingEval.findingsFile}:${draft.quote ?? ""}`),
    claimId: bindingEval.claimId,
    source: draft.source,
    sourcePath: draft.sourcePath,
    findingsFile: draft.findingsFile ?? bindingEval.findingsFile,
    quote: draft.quote,
    location: draft.location,
    url: draft.url,
    caveat: draft.caveat,
    supportScope: draft.supportScope,
    unsupportedScope: draft.unsupportedScope,
    strength: draft.strength,
  }
  const missing = missingBindableEvidenceFields(evidence)
  if (missing.length > 0) return { ok: false, skipped: true, reason: "recommended evidence draft is incomplete", missingFields: missing, bindingEval }

  const mutation = upsertVaultEvidenceNode(workspaceRoot, evidence as any)
  if (!mutation.ok) return { ok: false, mutation, bindingEval }

  const gap = exactResearchGapForBinding(state, bindingEval.findingsFile, bindingEval.claimId)
  const gapMutation = gap
    ? updateVaultResearchGapNode(workspaceRoot, {
      id: gap.id,
      status: "evidence_bound",
      findingsFile: bindingEval.findingsFile,
      evidenceBindingIds: [...new Set([...(gap.evidenceBindingIds ?? []), evidence.id])],
      notes: gap.notes,
    })
    : undefined
  const compiled = compileCacheMirrorNarrativeVault(workspaceRoot)
  return {
    ok: compiled.result.ok,
    path: mutation.file,
    bindingEval,
    mutation,
    gapMutation: gapMutation ?? { ok: true, skipped: true, reason: "no exact single research gap matched this findings file and claim" },
    evidence,
    diagnostics: compiled.result.diagnostics,
    diagnosticReport: compiled.diagnosticReport,
    narrative: compiled.result.narrative,
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function keyify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function buildFrontmatter(topic: string, axis: string, sources: string[]): string {
  const lines = [
    "---",
    `topic: ${topic}`,
    `axis: ${axis}`,
    `date: ${today()}`,
  ]
  if (sources.length > 0) {
    lines.push("sources:")
    for (const source of sources) lines.push(`  - "${source.replace(/"/g, '\\"')}"`)
  }
  lines.push("---")
  return lines.join("\n")
}

function missingBindableEvidenceFields(input: Record<string, unknown>): string[] {
  const missing: string[] = []
  for (const key of ["id", "claimId", "source", "quote", "supportScope", "unsupportedScope", "caveat", "strength"] as const) {
    if (!String(input[key] ?? "").trim()) missing.push(key)
  }
  if (!String(input.sourcePath ?? "").trim() && !String(input.url ?? "").trim() && !String(input.findingsFile ?? "").trim()) missing.push("sourcePath|url|findingsFile")
  return missing
}

function exactResearchGapForBinding(state: DecksState, findingsFile: string, claimId: string) {
  const gaps = state.narrative?.researchGaps ?? []
  const exact = gaps.filter((gap) => gap.targetType === "claim" && gap.targetId === claimId && gap.findingsFile === findingsFile)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return undefined
  const byClaim = gaps.filter((gap) => gap.targetType === "claim" && gap.targetId === claimId && !gap.findingsFile)
  return byClaim.length === 1 ? byClaim[0] : undefined
}

function root(workspaceRoot: string | undefined): string {
  return resolve(workspaceRoot || process.cwd())
}
