import type { NarrativeBrief } from "../decks-state"
import type { NarrativeStateV1 } from "./types"

export function narrativeToBrief(narrative: NarrativeStateV1): NarrativeBrief {
  return {
    audienceBeliefBefore: narrative.audience.beliefBefore || undefined,
    audienceBeliefAfter: narrative.audience.beliefAfter || undefined,
    decisionOrAction: narrative.decision.action || undefined,
    narrativeArc: narrative.thesis?.statement,
    keyClaims: narrative.claims.filter((claim) => claim.importance === "central").map((claim) => claim.text),
    objections: narrative.objections.map((objection) => objection.text),
    risks: narrative.risks.map((risk) => risk.text),
  }
}
