import { createHash } from "crypto"
import type { NarrativeStateV1 } from "./types"

export function stableNarrativeId(seed: string): string {
  return `narrative:${stableHash(seed || "workspace")}`
}

export function stableClaimId(text: string): string {
  return `claim:${stableHash(text)}`
}

export function stableEvidenceId(claimId: string, seed: string): string {
  return `evidence:${claimId}:${stableHash(seed)}`
}

export function stableObjectionId(text: string): string {
  return `objection:${stableHash(text)}`
}

export function stableRiskId(text: string): string {
  return `risk:${stableHash(text)}`
}

export function computeNarrativeHash(narrative: NarrativeStateV1): string {
  return stableHash(stableStringify({
    version: narrative.version,
    id: narrative.id,
    audience: narrative.audience,
    decision: narrative.decision,
    thesis: narrative.thesis,
    claims: narrative.claims,
    evidenceBindings: narrative.evidenceBindings,
    objections: narrative.objections,
    risks: narrative.risks,
  }))
}

export function stableHash(input: unknown): string {
  const text = typeof input === "string" ? input : stableStringify(input)
  return createHash("sha1").update(text).digest("hex").slice(0, 12)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`
  }
  return JSON.stringify(value)
}
