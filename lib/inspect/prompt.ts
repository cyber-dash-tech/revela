import type { InspectionPromptProjection } from "../inspection-context/project"

export function buildInspectionPrompt(input: {
  requestId: string
  file: string
  projection: InspectionPromptProjection
  language?: string
  comment?: string
  delivery?: "tool" | "json"
}): string {
  const language = normalizeInspectLanguage(input.language)
  const comment = typeof input.comment === "string" && input.comment.trim() ? input.comment.trim() : ""
  const delivery = input.delivery ?? "tool"
  return `A user selected slide content in Revela Evidence Inspector. The selection may contain one referenced element, a whole slide, or multiple referenced elements selected with Cmd/Ctrl-click.

Target file: ${input.file}
Inspection request id: ${input.requestId}
Display language: ${language}
User inspect comment: ${comment || "(none; explain purpose and source only)"}

Use the structured projection below to produce the final inspector cards. This is LLM judgment with grounded boundaries. The user's inspect comment is the complete request about the selected reference; do not parse it into a separate question field. The user primarily wants to understand the selected component: what purpose it serves and what source support exists. Use narrative reading and exploratory reading only as internal grounding unless needed to answer the user's comment. Do not edit files. Do not mutate DECKS.json. Do not invent claim ids, evidence binding ids, sources, quotes, URLs, page references, caveats, objections, risks, artifact coverage, or evidence not present in the projection.

Language boundary: the selected display language affects only human-readable card copy. Preserve all claim ids, canonical claim ids, evidence binding ids, source paths, findings files, URLs, numbers, quoted/source facts, caveats, artifact ids, and coverage statuses exactly as grounded in the projection. If the display language is Auto, use projection.deck.language when available; otherwise follow the user's/browser context or default to English.

${delivery === "json"
    ? "Return only a single JSON object that matches the final inspector result schema. Do not wrap it in Markdown. Do not call tools. Do not edit files."
    : "Return the result only by calling the `revela-inspection-result` tool with this request id. Do not answer in chat."}

Required card model:
- User inspect comment: if present, answer it through the Purpose and Source cards first. If it asks about trust, provenance, evidence, factuality, or where a number came from, prioritize Source. If it asks why something is on the slide or what it is doing, prioritize Purpose.
- Narrative Reading: when the projection includes a matched claim, preserve its claim id, canonical claim id, evidence binding ids, supported scope, unsupported scope, caveats, related objections, related risks, and artifact coverage. Artifact coverage must come only from projection.cards.artifacts; do not invent where a claim appears or whether an artifact is stale/current/partial/missing. If canonical narrative linkage is missing, say so and fall back to the matched slide claim; do not invent canonical ids.
- Candidate boundary: when projection.match.claim is absent but projection.match.candidateClaims is present, explain the selected child element only within those candidate claim boundaries. You may describe that the child element functions as a detail, prerequisite, source note, risk cue, or evidence cue inside the slide, but you must not select one candidate claim id by semantic guess. If projection.match.confidence is none or candidateClaims is empty, explain the mapping gap instead of inventing a plausible claim.
- Exploratory Reading: provide bounded, non-official reading cues for objection prep, audience reframing, appendix leads, and meeting prep only from the projection. Mark official as false. Keep missing evidence, caveats, unsupported scope, and stale artifacts visible. Do not make exploratory text sound like approved artifact content, and do not turn this into chat or a fix plan.
- Purpose: explain why this selected content appears here, what job it serves in the slide purpose, narrative role, deck goal, audience, or narrative brief, and why it matters.
- Source: if the selection contains a factual claim, number, comparison, conclusion, or recommendation, judge source credibility. Use not_needed for structural, transitional, or purely explanatory content that does not need evidence. Include source trace, warnings, gaps, and caveats here.

Boundaries:
- Do not hunt for problems. If it works, say it works.
- Do not recommend edits or fixes; this inspector view only explains narrative context, bounded exploratory reading context, purpose, and source credibility.
- Keep Purpose and Source concise and directly useful. Avoid long narrative-reading exposition unless the selected content cannot be explained without it.
- Do not turn every caveat into a problem.
- If confidence is low, use unclear or unknown instead of pretending certainty.

Projection JSON:

\`\`\`json
${JSON.stringify(input.projection, null, 2)}
\`\`\``
}

function normalizeInspectLanguage(language: string | undefined): string {
  const value = typeof language === "string" ? language.trim() : ""
  return value || "Auto"
}
