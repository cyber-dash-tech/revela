export interface EditSelectedElementPayload {
  slideIndex?: number
  slideTitle?: string
  selector?: string
  domPath?: string
  tagName?: string
  id?: string
  classList?: string[]
  text?: string
  outerHTMLExcerpt?: string
  nearbyText?: string
  boundingBox?: Record<string, unknown>
  viewport?: Record<string, unknown>
}

export interface EditCommentDraftPayload {
  comment: string
  elements: EditSelectedElementPayload[]
}

export interface EditCommentPayload extends EditSelectedElementPayload {
  deck: string
  file: string
  comment: string
  elements?: EditSelectedElementPayload[]
  comments?: EditCommentDraftPayload[]
  asset?: Record<string, unknown>
  drop?: Record<string, unknown>
  suppressAutomaticArtifactQa?: boolean
}

export function buildEditPrompt(payload: EditCommentPayload): string {
  const elements = payload.elements?.length
    ? payload.elements
    : [{
        slideIndex: payload.slideIndex,
        slideTitle: payload.slideTitle,
        selector: payload.selector,
        domPath: payload.domPath,
        tagName: payload.tagName,
        id: payload.id,
        classList: payload.classList ?? [],
        text: payload.text,
        outerHTMLExcerpt: payload.outerHTMLExcerpt,
        nearbyText: payload.nearbyText,
        boundingBox: payload.boundingBox,
        viewport: payload.viewport,
      }]
  const comments = payload.comments?.length
    ? payload.comments
    : [{
        comment: payload.comment,
        elements,
      }]

  const compact = {
    deck: payload.deck,
    file: payload.file,
    comments,
    asset: payload.asset,
    drop: payload.drop,
  }
  const qaInstruction = payload.suppressAutomaticArtifactQa
    ? `- Do not run artifact QA after this edit and do not keep editing just to satisfy post-write QA. The Review UI will refresh from the deck file version change; QA can be run later through an explicit Review, QA, or export workflow.`
    : `- Artifact QA runs automatically after deck writes/patches/edits. It checks deck HTML contract, design component compliance, exact 1920x1080 slide geometry, scrollbars, element overflow, text clipping, and claim/evidence content-density warnings.
- If the tool result reports hard QA errors, fix them with the smallest targeted patch and let the post-write QA run again. Refine opens automatically only after hard errors pass; warnings such as thin claim/evidence substance do not block opening.`

  return `The user left a visual edit comment on a Revela slide deck.

Target deck: ${payload.deck}
Target file: ${payload.file}

Structured selection payload:

\`\`\`json
${JSON.stringify(compact, null, 2)}
\`\`\`

Instructions:
- Make the smallest targeted change that satisfies the user's comment.
- If there are multiple comments, apply them as one coherent edit pass and avoid changes from one comment overwriting another.
- Each comment may reference one or more selected elements. Treat the elements in a single comment as a group.
- Preserve the narrative boundary: if the requested edit changes audience framing, belief shift, decision/action, thesis, recommendation, claim wording, evidence scope, caveat, risk, objection, or decision ask, do not patch the HTML directly. Explain that the canonical narrative must be updated first through targeted ${"`revela-decks`"} vault actions (${"`initNarrativeVault`"} if needed, then ${"`updateVaultCoreNarrative`"}, ${"`upsertVaultClaim`"}, ${"`upsertVaultEvidence`"}, ${"`upsertVaultObjection`"}, or ${"`upsertVaultRisk`"}), with manual Markdown edits plus ${"`compileNarrativeVault`"} only for unsupported node changes. Then the narrative must be reviewed/approved or explicitly overridden before updating the deck projection.
- Pure artifact polish such as layout, spacing, typography, alignment, color, image crop, animation, export fidelity, runtime JavaScript fixes, or deck HTML contract fixes may remain an artifact-level edit.
- If the request mixes content meaning and visual polish, treat it as narrative-impacting unless the user clarifies otherwise.
- Preserve the existing deck structure, active design language, typography, spacing system, animations, and slide count unless the comment explicitly asks otherwise.
- Before patching ${"`decks/*.html`"}, call ${"`revela-designs`"} with ${"`action: \"read\"`"} and ${"`section: \"rules\"`"} to fetch the active design rules for this edit pass.
- If the edit changes layout, component structure, typography scale, visual hierarchy, chart usage, icon usage, media treatment, or design-system classes, fetch the relevant ${"`revela-designs`"} layout/component details before editing. Fetch ${"`section: \"chart-rules\"`"} before changing or adding ECharts.
- Follow the fetched design rules and vocabulary exactly. Do not invent layout classes, component names, CSS variables, icon systems, or visual effects from model memory or the existing deck alone.
- If an asset/drop payload is present, this is an asset placement request. Use only the saved local asset path from the asset payload in deck HTML. Prefer asset.deckPath when present because it is relative to the target HTML file; otherwise use asset.path.
- Do not write remote imageUrl, thumbnailUrl, source page URLs, or ${"`/__revela_asset`"} proxy URLs into deck HTML.
- Logo assets should remain small, clear, and brand-like; do not use logos as decorative backgrounds.
- Photography can be cropped or masked when appropriate, but must not cover text, charts, tables, evidence, or important claims.
- Screenshots, diagrams, charts, tables, and evidence images must remain readable and should not be converted into decorative hero imagery.
- For asset targetMode ${"`replace`"}, prefer replacing the targeted image or visual element. For ${"`insert-into`"}, place the asset inside the targeted card, media box, or semantic container while preserving that element's layout role. For ${"`add`"}, place the asset near the drop coordinates within the existing layout or semantic box. Do not invent a new visual system when the existing deck grammar can express the placement.
- If an asset payload is present without drop coordinates, use the user's comment and selected element context to choose placement; if placement remains ambiguous, ask one concise clarification question instead of guessing.
- Preserve source/license/attribution facts if you surface them in visible notes; do not invent missing licensing or attribution.
- Do not rewrite unrelated slides or broad sections of the deck.
- Locate each target primarily with slideIndex, slideTitle, selected text, nearbyText, and outerHTMLExcerpt. Use selector/domPath as hints; they may be approximate.
- For targeted artifact-level edits, patch ${"`decks/*.html`"} directly. Do not call ${"`revela-decks`"} action ${"`review`"} as a precondition, and do not let ${"`writeReadiness`"}, ${"`planReview`"}, or ${"`slide_plan_unconfirmed`"} block the patch.
- Do not patch or write ${"`DECKS.json`"} directly. If state must change, use the ${"`revela-decks`"} tool.
- Apply the edit to ${payload.file} with the smallest targeted HTML patch that satisfies the comment.
${qaInstruction}
- If the comment is ambiguous, ask one concise clarification question instead of guessing.`
}
