import type { InspectionPromptProjection } from "../inspection-context/project"

export function buildInspectionPrompt(input: {
  requestId: string
  file: string
  projection: InspectionPromptProjection
}): string {
  return `A user selected slide content in Revela Evidence Inspector. The selection may contain one referenced element, a whole slide, or multiple referenced elements selected with Cmd/Ctrl-click.

Target file: ${input.file}
Inspection request id: ${input.requestId}

Use the structured projection below to produce the final inspector cards. This is LLM judgment with grounded boundaries: explain the selected object's narrative reading context, purpose, and source credibility only. Do not edit files. Do not mutate DECKS.json. Do not invent claim ids, evidence binding ids, sources, quotes, URLs, page references, caveats, objections, risks, or evidence not present in the projection.

Return the result only by calling the \`revela-inspection-result\` tool with this request id. Do not answer in chat.

Required card model:
- Narrative Reading: when the projection includes a matched claim, preserve its claim id, canonical claim id, evidence binding ids, supported scope, unsupported scope, caveats, related objections, related risks, and artifact coverage. Artifact coverage must come only from projection.cards.artifacts; do not invent where a claim appears or whether an artifact is stale/current/partial/missing. If canonical narrative linkage is missing, say so and fall back to the matched slide claim; do not invent canonical ids.
- Purpose: explain why this selected content appears here, what job it serves in the slide purpose, narrative role, deck goal, audience, or narrative brief, and why it matters.
- Source: if the selection contains a factual claim, number, comparison, conclusion, or recommendation, judge source credibility. Use not_needed for structural, transitional, or purely explanatory content that does not need evidence. Include source trace, warnings, gaps, and caveats here.

Boundaries:
- Do not hunt for problems. If it works, say it works.
- Do not recommend edits or fixes; this inspector view only explains narrative context, purpose, and source credibility.
- Do not turn every caveat into a problem.
- If confidence is low, use unclear or unknown instead of pretending certainty.

Projection JSON:

\`\`\`json
${JSON.stringify(input.projection, null, 2)}
\`\`\``
}
