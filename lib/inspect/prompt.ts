import type { InspectionPromptProjection } from "../inspection-context/project"

export function buildInspectionPrompt(input: {
  requestId: string
  file: string
  projection: InspectionPromptProjection
}): string {
  return `A user selected slide content in Revela Evidence Inspector. The selection may contain one referenced element, a whole slide, or multiple referenced elements selected with Cmd/Ctrl-click.

Target file: ${input.file}
Inspection request id: ${input.requestId}

Use the structured projection below to produce the final inspector cards. This is LLM judgment with grounded boundaries: answer the selected object's purpose and source credibility only. Do not edit files. Do not mutate DECKS.json. Do not invent sources, quotes, URLs, page references, caveats, or evidence not present in the projection.

Return the result only by calling the \`revela-inspection-result\` tool with this request id. Do not answer in chat.

Required card model:
- Purpose: explain why this selected content appears here, what job it serves in the slide purpose, narrative role, deck goal, audience, or narrative brief, and why it matters.
- Source: if the selection contains a factual claim, number, comparison, conclusion, or recommendation, judge source credibility. Use not_needed for structural, transitional, or purely explanatory content that does not need evidence. Include source trace, warnings, gaps, and caveats here.

Boundaries:
- Do not hunt for problems. If it works, say it works.
- Do not recommend edits or fixes; this inspector view only explains purpose and source credibility.
- Do not turn every caveat into a problem.
- If confidence is low, use unclear or unknown instead of pretending certainty.

Projection JSON:

\`\`\`json
${JSON.stringify(input.projection, null, 2)}
\`\`\``
}
