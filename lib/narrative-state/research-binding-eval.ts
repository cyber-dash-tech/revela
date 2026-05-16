import { existsSync, readFileSync } from "fs"
import { resolve, sep } from "path"
import type { DecksState } from "../decks-state"
import { normalizeNarrativeState } from "./normalize"
import type { NarrativeClaim, NarrativeEvidenceBinding, NarrativeStateV1 } from "./types"

export type EvidenceBindingFailureReason =
  | "missing_quote"
  | "unclear_source"
  | "over_broad_claim"
  | "weak_source"
  | "unsupported_scope"
  | "caveat_conflict"
  | "source_mismatch"
  | "context_only_finding"

export interface EvidenceBindingDiagnostic {
  findingsFile: string
  bindable: boolean
  failureReasons: EvidenceBindingFailureReason[]
  explicit: {
    source: boolean
    quoteOrSnippet: boolean
    supportScope: boolean
    unsupportedScope: boolean
    caveat: boolean
    strength: boolean
  }
}

export type ResearchFindingsBindingStatus = "bindable" | "needs_fields" | "not_relevant" | "unsafe"

export interface ResearchFindingsBindingEval {
  findingsFile: string
  status: ResearchFindingsBindingStatus
  claimId?: string
  claimText?: string
  diagnostic?: EvidenceBindingDiagnostic
  missingFields: Array<"source" | "quoteOrSnippet" | "supportScope" | "unsupportedScope" | "caveat" | "strength" | "claimId">
  failureReasons: EvidenceBindingFailureReason[]
  recommendedEvidenceDraft?: Partial<NarrativeEvidenceBinding>
  nextAction: string
}

export function evaluateResearchFindingsBinding(state: DecksState, workspaceRoot: string | undefined, findingsFile: string): ResearchFindingsBindingEval {
  const normalizedFile = normalizeResearchFindingsPath(findingsFile)
  if (!normalizedFile) return unsafeEval(findingsFile, "Use a workspace-relative researches/**/*.md findings file before evaluating evidence binding.")

  const text = readWorkspaceText(workspaceRoot, normalizedFile)
  if (text === undefined) return unsafeEval(normalizedFile, "Save the findings file inside the workspace before evaluating evidence binding.")

  const narrative = normalizeNarrativeState(state)
  const diagnostic = evidenceBindingDiagnosticFromText(normalizedFile, text)
  const claim = resolveClaimForFindings(narrative, normalizedFile, text)
  const explicitClaimId = extractField(text, ["claimId", "claim id"])
  const missingFields = missingExplicitFields(diagnostic)
  const failureReasons = [...diagnostic.failureReasons]

  if (explicitClaimId && !claim) {
    return {
      findingsFile: normalizedFile,
      status: "unsafe",
      claimId: explicitClaimId,
      diagnostic,
      missingFields,
      failureReasons: [...new Set([...failureReasons, "source_mismatch" as const])],
      nextAction: `Do not bind ${normalizedFile}: claimId ${explicitClaimId} does not exist in the canonical narrative.`,
    }
  }

  if (!claim) {
    return {
      findingsFile: normalizedFile,
      status: diagnostic.failureReasons.includes("context_only_finding") ? "not_relevant" : "needs_fields",
      diagnostic,
      missingFields: [...missingFields, "claimId"],
      failureReasons,
      nextAction: "Identify the exact canonical claimId this findings file supports before writing evidence/*.md.",
    }
  }

  if (!diagnostic.bindable) {
    return {
      findingsFile: normalizedFile,
      status: "needs_fields",
      claimId: claim.id,
      claimText: claim.text,
      diagnostic,
      missingFields,
      failureReasons,
      nextAction: `Do not bind yet. Fill missing fields for ${claim.id}: ${missingFields.join(", ") || "none"}.`,
    }
  }

  return {
    findingsFile: normalizedFile,
    status: "bindable",
    claimId: claim.id,
    claimText: claim.text,
    diagnostic,
    missingFields,
    failureReasons,
    recommendedEvidenceDraft: buildEvidenceDraft(normalizedFile, text, claim),
    nextAction: `Write a canonical evidence node in revela-narrative/evidence/ for ${claim.id}, preserving source trace, quote, scopes, caveat, and strength.`,
  }
}

export function evidenceBindingDiagnostic(workspaceRoot: string | undefined, findingsFile: string): EvidenceBindingDiagnostic | undefined {
  const text = readWorkspaceText(workspaceRoot, findingsFile)
  if (text === undefined) return undefined
  return evidenceBindingDiagnosticFromText(findingsFile, text)
}

function evidenceBindingDiagnosticFromText(findingsFile: string, text: string): EvidenceBindingDiagnostic {
  const explicit = {
    source: hasSourceTrace(text),
    quoteOrSnippet: hasQuoteOrSnippet(text),
    supportScope: hasField(text, ["support scope", "supported scope", "supports", "support"]),
    unsupportedScope: hasField(text, ["unsupported scope", "unsupported", "not supported", "gaps"]),
    caveat: hasField(text, ["caveat", "limitation", "limits", "boundary"]),
    strength: hasField(text, ["strength", "support strength", "evidence strength"]),
  }
  const failureReasons: EvidenceBindingFailureReason[] = []
  if (!explicit.quoteOrSnippet) failureReasons.push("missing_quote")
  if (!explicit.source) failureReasons.push("unclear_source")
  if (!explicit.supportScope || !explicit.unsupportedScope) failureReasons.push("unsupported_scope")
  if (!explicit.caveat) failureReasons.push("caveat_conflict")
  if (!explicit.strength) failureReasons.push("weak_source")
  if (looksContextOnly(text, explicit)) failureReasons.push("context_only_finding")
  return { findingsFile, bindable: failureReasons.length === 0, failureReasons, explicit }
}

function resolveClaimForFindings(narrative: NarrativeStateV1, findingsFile: string, text: string): NarrativeClaim | undefined {
  const explicitClaimId = extractField(text, ["claimId", "claim id"])
  if (explicitClaimId) return narrative.claims.find((claim) => claim.id === explicitClaimId)
  const gap = (narrative.researchGaps ?? []).find((item) => item.findingsFile === findingsFile && item.targetType === "claim" && item.targetId)
  if (gap?.targetId) return narrative.claims.find((claim) => claim.id === gap.targetId)
  return undefined
}

function buildEvidenceDraft(findingsFile: string, text: string, claim: NarrativeClaim): Partial<NarrativeEvidenceBinding> {
  const source = extractSource(text) ?? findingsFile
  const draft: Partial<NarrativeEvidenceBinding> = {
    claimId: claim.id,
    source,
    findingsFile,
    quote: extractQuote(text),
    supportScope: extractField(text, ["support scope", "supported scope", "support"]),
    unsupportedScope: extractField(text, ["unsupported scope", "unsupported", "not supported"]),
    caveat: extractField(text, ["caveat", "limitation", "limits", "boundary"]),
    strength: normalizeStrength(extractField(text, ["strength", "support strength", "evidence strength"])),
  }
  if (/^https?:\/\//i.test(source)) draft.url = source
  else draft.sourcePath = source
  return draft
}

function unsafeEval(findingsFile: string, nextAction: string): ResearchFindingsBindingEval {
  return {
    findingsFile,
    status: "unsafe",
    missingFields: ["source", "quoteOrSnippet", "supportScope", "unsupportedScope", "caveat", "strength", "claimId"],
    failureReasons: ["source_mismatch"],
    nextAction,
  }
}

function missingExplicitFields(diagnostic: EvidenceBindingDiagnostic): ResearchFindingsBindingEval["missingFields"] {
  const missing: ResearchFindingsBindingEval["missingFields"] = []
  if (!diagnostic.explicit.source) missing.push("source")
  if (!diagnostic.explicit.quoteOrSnippet) missing.push("quoteOrSnippet")
  if (!diagnostic.explicit.supportScope) missing.push("supportScope")
  if (!diagnostic.explicit.unsupportedScope) missing.push("unsupportedScope")
  if (!diagnostic.explicit.caveat) missing.push("caveat")
  if (!diagnostic.explicit.strength) missing.push("strength")
  return missing
}

function normalizeResearchFindingsPath(filePath: string | undefined): string | undefined {
  const normalized = normalizePath(filePath ?? "").replace(/^\.\//, "")
  if (!normalized || normalized.startsWith("../") || normalized.startsWith("/")) return undefined
  if (!normalized.startsWith("researches/") || !normalized.endsWith(".md")) return undefined
  return normalized
}

function readWorkspaceText(workspaceRoot: string | undefined, relativePath: string): string | undefined {
  if (!workspaceRoot) return undefined
  const root = resolve(workspaceRoot)
  const target = resolve(root, relativePath)
  if (target !== root && !target.startsWith(root + sep)) return undefined
  if (!existsSync(target)) return undefined
  return readFileSync(target, "utf-8")
}

function hasSourceTrace(text: string): boolean {
  return /^sources:\s*$/im.test(text)
    || /\[source:\s*[^\]]+\]/i.test(text)
    || /^\s*-?\s*source:\s*\S+/im.test(text)
    || /^\s*source\s+(path|url):\s*\S+/im.test(text)
}

function hasQuoteOrSnippet(text: string): boolean {
  return hasField(text, ["quote", "snippet"])
    || /["“][^"”]{20,}["”]/.test(text)
    || /^>\s*\S.{20,}/m.test(text)
}

function hasField(text: string, labels: string[]): boolean {
  return labels.some((label) => new RegExp(`(^|\\n)\\s*(?:[-*]\\s*)?${escapeRegex(label)}\\s*[:：]\\s*\\S`, "i").test(text)
    || new RegExp(`^##+\\s+.*${escapeRegex(label)}`, "im").test(text))
}

function looksContextOnly(text: string, explicit: EvidenceBindingDiagnostic["explicit"]): boolean {
  return /^##+\s+data\b/im.test(text) && !explicit.quoteOrSnippet && (!explicit.supportScope || !explicit.caveat)
}

function extractField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`(^|\\n)\\s*(?:[-*]\\s*)?${escapeRegex(label)}\\s*[:：]\\s*([^\\n]+)`, "i"))
    const value = match?.[2]?.trim()
    if (value) return value
  }
  return undefined
}

function extractSource(text: string): string | undefined {
  const yamlSource = text.match(/^sources:\s*\n\s*-\s*["']?([^"'\n]+)["']?\s*$/im)?.[1]?.trim()
  if (/^https?:\/\//i.test(yamlSource ?? "")) return yamlSource
  const bracket = text.match(/\[source:\s*([^\]]+)\]/i)?.[1]?.trim()
  if (bracket) return bracket
  return extractField(text, ["source", "source url", "source path"])
}

function extractQuote(text: string): string | undefined {
  const field = extractField(text, ["quote", "snippet"])
  if (field) return trimQuote(field)
  const quoted = text.match(/["“]([^"”]{20,})["”]/)?.[1]?.trim()
  if (quoted) return quoted
  return text.match(/^>\s*(\S.{20,})/m)?.[1]?.trim()
}

function normalizeStrength(value: string | undefined): NarrativeEvidenceBinding["strength"] | undefined {
  const normalized = value?.toLowerCase()
  if (normalized?.includes("strong")) return "strong"
  if (normalized?.includes("partial")) return "partial"
  if (normalized?.includes("weak")) return "weak"
  return undefined
}

function trimQuote(value: string): string {
  return value.replace(/^["“]/, "").replace(/["”]$/, "").trim()
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/")
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
