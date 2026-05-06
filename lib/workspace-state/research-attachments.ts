import { existsSync } from "fs"
import { basename, resolve, sep } from "path"
import {
  readDecksState,
  writeDecksState,
  type DecksState,
  type ResearchAxis,
} from "../decks-state"
import { recordWorkspaceAction } from "./actions"

export interface AttachResearchFindingsInput {
  findingsFile: string
  researchAxis?: string
  status?: "done" | "read"
}

export interface AttachResearchFindingsResult {
  attached: boolean
  skipped: boolean
  reason?: string
  slug?: string
  axis?: string
  findingsFile?: string
  status?: ResearchAxis["status"]
}

export function attachResearchFindings(workspaceRoot: string, input: AttachResearchFindingsInput): AttachResearchFindingsResult {
  const state = readDecksState(workspaceRoot)
  const result = attachResearchFindingsToState(state, workspaceRoot, input)
  writeDecksState(workspaceRoot, state)
  return result
}

export function attachResearchFindingsToState(state: DecksState, workspaceRoot: string, input: AttachResearchFindingsInput): AttachResearchFindingsResult {
  const normalizedFile = normalizeResearchFindingsPath(input.findingsFile)
  if (!normalizedFile) {
    return recordSkipped(state, input, "findingsFile must be a workspace-relative researches/*.md path")
  }

  const absoluteFile = safeWorkspacePath(workspaceRoot, normalizedFile)
  if (!absoluteFile || !existsSync(absoluteFile)) {
    return recordSkipped(state, { ...input, findingsFile: normalizedFile }, "findingsFile does not exist inside the workspace")
  }

  const slug = state.activeDeck ?? singleDeckKey(state)
  const deck = slug ? state.decks[slug] : undefined
  if (!slug || !deck) return recordSkipped(state, { ...input, findingsFile: normalizedFile }, "no active deck is available")

  const matches = matchingAxes(deck.researchPlan ?? [], input.researchAxis, normalizedFile)
  if (matches.length === 0) return recordSkipped(state, { ...input, findingsFile: normalizedFile }, "no matching researchPlan axis found")
  if (matches.length > 1) return recordSkipped(state, { ...input, findingsFile: normalizedFile }, "researchPlan axis match is ambiguous")

  const index = matches[0]!
  const existing = deck.researchPlan[index]!
  const nextStatus = input.status ?? existing.status
  deck.researchPlan[index] = {
    ...existing,
    status: nextStatus,
    findingsFile: normalizedFile,
  }

  recordWorkspaceAction(state, {
    type: "research.findings_attached",
    actor: "revela-decks",
    inputs: { activeDeck: slug, axis: existing.axis, findingsFile: normalizedFile, requestedStatus: input.status },
    outputs: { slug, axis: existing.axis, findingsFile: normalizedFile, status: nextStatus },
    summary: `Attached research findings ${normalizedFile} to axis ${existing.axis}.`,
    nodeIds: [`finding:${normalizedFile}`],
  })

  return {
    attached: true,
    skipped: false,
    slug,
    axis: existing.axis,
    findingsFile: normalizedFile,
    status: nextStatus,
  }
}

function matchingAxes(researchPlan: ResearchAxis[], researchAxis: string | undefined, findingsFile: string): number[] {
  if (researchAxis?.trim()) {
    const requested = normalizeKey(researchAxis)
    return researchPlan.flatMap((axis, index) => normalizeKey(axis.axis) === requested ? [index] : [])
  }

  const fileKey = normalizeKey(basename(findingsFile, ".md"))
  return researchPlan.flatMap((axis, index) => normalizeKey(axis.axis) === fileKey ? [index] : [])
}

function recordSkipped(state: DecksState, input: AttachResearchFindingsInput, reason: string): AttachResearchFindingsResult {
  const normalizedFile = normalizeResearchFindingsPath(input.findingsFile) ?? input.findingsFile
  recordWorkspaceAction(state, {
    type: "research.findings_attached",
    actor: "revela-decks",
    inputs: { axis: input.researchAxis, findingsFile: normalizedFile, requestedStatus: input.status },
    outputs: { reason },
    status: "skipped",
    summary: `Skipped research findings attachment: ${reason}.`,
    nodeIds: normalizedFile ? [`finding:${normalizedFile}`] : [],
  })
  return { attached: false, skipped: true, reason }
}

function normalizeResearchFindingsPath(filePath: string | undefined): string | undefined {
  const normalized = normalizePath(filePath ?? "").replace(/^\.\//, "")
  if (!normalized || normalized.startsWith("../") || normalized.startsWith("/")) return undefined
  if (!normalized.startsWith("researches/") || !normalized.endsWith(".md")) return undefined
  return normalized
}

function safeWorkspacePath(workspaceRoot: string, relativePath: string): string | undefined {
  const root = resolve(workspaceRoot)
  const target = resolve(root, relativePath)
  if (target !== root && !target.startsWith(root + sep)) return undefined
  return target
}

function singleDeckKey(state: DecksState): string | undefined {
  const keys = Object.keys(state.decks)
  return keys.length === 1 ? keys[0] : undefined
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "")
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}
