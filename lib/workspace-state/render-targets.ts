import { createHash } from "crypto"
import { basename, dirname, extname, join } from "path"
import type { DeckSpec, DecksState } from "../decks-state"
import type { RenderTarget } from "./types"

export type RenderTargetType = RenderTarget["type"]

export function activeHtmlDeckRenderTarget(state: DecksState): RenderTarget | undefined {
  const deck = activeDeck(state)
  if (!deck) return undefined
  const expectedPath = normalizeWorkspacePath(deck.outputPath)
  return (state.renderTargets ?? []).find((target) =>
    target.type === "html_deck" && normalizeWorkspacePath(target.outputPath ?? "") === expectedPath
  )
}

export function ensureActiveHtmlDeckRenderTarget(state: DecksState): RenderTarget | undefined {
  const deck = activeDeck(state)
  if (!deck?.outputPath) return undefined
  state.renderTargets ??= []

  const target = createHtmlDeckRenderTarget(deck)
  const index = state.renderTargets.findIndex((item) => item.id === target.id)
  if (index >= 0) {
    state.renderTargets[index] = mergeRenderTarget(state.renderTargets[index], target)
  } else {
    state.renderTargets.push(target)
  }

  state.renderTargets = sortRenderTargets(state.renderTargets)
  return state.renderTargets.find((item) => item.id === target.id)
}

export function resolveActiveHtmlDeckPath(state: DecksState): string | undefined {
  const target = activeHtmlDeckRenderTarget(state) ?? ensureActiveHtmlDeckRenderTarget(state)
  if (target?.outputPath) return normalizeWorkspacePath(target.outputPath)
  return activeDeck(state)?.outputPath ? normalizeWorkspacePath(activeDeck(state)?.outputPath ?? "") : undefined
}

export function upsertRenderTarget(state: DecksState, target: RenderTarget): DecksState {
  state.renderTargets ??= []
  const cleaned = cleanRenderTarget(target)
  const index = state.renderTargets.findIndex((item) => item.id === cleaned.id)
  if (index >= 0) state.renderTargets[index] = mergeRenderTarget(state.renderTargets[index], cleaned)
  else state.renderTargets.push(cleaned)
  state.renderTargets = sortRenderTargets(state.renderTargets)
  return state
}

export function deriveExportRenderTarget(htmlTarget: RenderTarget, type: "pdf" | "pptx" | "png", outputPath: string): RenderTarget {
  const normalizedOutput = normalizeWorkspacePath(outputPath)
  return cleanRenderTarget({
    id: renderTargetId(type, normalizedOutput),
    type,
    outputPath: normalizedOutput,
    sourceNodeIds: htmlTarget.outputPath ? [artifactNodeIdForRenderTarget(htmlTarget)] : htmlTarget.sourceNodeIds,
    contractStatus: "unknown",
    data: {
      sourceTargetId: htmlTarget.id,
      sourceOutputPath: htmlTarget.outputPath,
    },
  })
}

export function recordArtifactRenderTarget(
  state: DecksState,
  input: { sourceHtmlPath: string; type: "pdf" | "pptx" | "png"; outputPath: string; artifactVersion?: string },
): RenderTarget {
  const normalizedSource = normalizeWorkspacePath(input.sourceHtmlPath)
  const activeTarget = ensureActiveHtmlDeckRenderTarget(state)
  const htmlTarget = htmlDeckRenderTargetForPath(state, normalizedSource) ?? (
    activeTarget && normalizeWorkspacePath(activeTarget.outputPath ?? "") === normalizedSource ? activeTarget : undefined
  )
  const sourceTarget = htmlTarget ?? {
    id: renderTargetId("html_deck", normalizedSource),
    type: "html_deck" as const,
    outputPath: normalizedSource,
    sourceNodeIds: [],
    contractStatus: "unknown" as const,
  }
  const target = {
    ...deriveExportRenderTarget(sourceTarget, input.type, input.outputPath),
    ...(input.artifactVersion ? { artifactVersion: input.artifactVersion } : {}),
  }
  upsertRenderTarget(state, target)
  return target
}

export function htmlDeckRenderTargetForPath(state: DecksState, htmlPath: string): RenderTarget | undefined {
  const normalized = normalizeWorkspacePath(htmlPath)
  return (state.renderTargets ?? []).find((target) =>
    target.type === "html_deck" && normalizeWorkspacePath(target.outputPath ?? "") === normalized
  )
}

export function renderTargetId(type: RenderTargetType, outputPath: string): string {
  return `target:${type}:${stablePathOrHash(outputPath)}`
}

export function artifactNodeIdForRenderTarget(target: RenderTarget): string {
  return `artifact:${stablePathOrHash(target.outputPath || target.id)}`
}

export function normalizeWorkspacePath(value: string): string {
  return String(value ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "")
}

export function replaceExtension(filePath: string, extension: ".pdf" | ".pptx"): string {
  const normalized = normalizeWorkspacePath(filePath)
  const dir = dirname(normalized)
  const name = basename(normalized, extname(normalized))
  return normalizeWorkspacePath(join(dir, `${name}${extension}`))
}

function createHtmlDeckRenderTarget(deck: DeckSpec): RenderTarget {
  const outputPath = normalizeWorkspacePath(deck.outputPath)
  const slideNodeIds = deck.slides.map((slide) => `slide:${slide.index}`)
  return cleanRenderTarget({
    id: renderTargetId("html_deck", outputPath),
    type: "html_deck",
    outputPath,
    sourceNodeIds: [...new Set(slideNodeIds)].sort(),
    contractStatus: "unknown",
    data: {
      slug: deck.slug,
      compatibilityOutputPath: outputPath,
    },
  })
}

function activeDeck(state: DecksState): DeckSpec | undefined {
  const key = state.activeDeck || singleDeckKey(state.decks)
  return key ? state.decks[key] : undefined
}

function singleDeckKey(decks: Record<string, DeckSpec>): string | undefined {
  const keys = Object.keys(decks)
  return keys.length === 1 ? keys[0] : undefined
}

function cleanRenderTarget(target: RenderTarget): RenderTarget {
  const data = compactData(target.data ?? {})
  return {
    id: target.id || renderTargetId(target.type, target.outputPath || "unknown"),
    type: target.type,
    ...(target.outputPath ? { outputPath: normalizeWorkspacePath(target.outputPath) } : {}),
    sourceNodeIds: [...new Set(target.sourceNodeIds ?? [])].sort(),
    ...(target.artifactVersion ? { artifactVersion: target.artifactVersion } : {}),
    ...(target.contractStatus ? { contractStatus: target.contractStatus } : {}),
    ...(Object.keys(data).length > 0 ? { data } : {}),
  }
}

function mergeRenderTarget(existing: RenderTarget, next: RenderTarget): RenderTarget {
  return cleanRenderTarget({
    ...existing,
    ...next,
    sourceNodeIds: next.sourceNodeIds.length > 0 ? next.sourceNodeIds : existing.sourceNodeIds,
    data: { ...(existing.data ?? {}), ...(next.data ?? {}) },
  })
}

function sortRenderTargets(targets: RenderTarget[]): RenderTarget[] {
  return targets.map(cleanRenderTarget).sort((a, b) => a.id.localeCompare(b.id))
}

function compactData(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue
    if (typeof value === "string" && value.trim() === "") continue
    if (Array.isArray(value) && value.length === 0) continue
    output[key] = value
  }
  return output
}

function stablePathOrHash(value: string): string {
  const normalized = normalizeWorkspacePath(value)
  if (/^[a-z0-9._/-]+$/i.test(normalized) && normalized.length <= 80) return normalized
  return createHash("sha1").update(normalized).digest("hex").slice(0, 12)
}
