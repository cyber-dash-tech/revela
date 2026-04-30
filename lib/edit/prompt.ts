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
  }

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
- Preserve the existing deck structure, active design language, typography, spacing system, animations, and slide count unless the comment explicitly asks otherwise.
- Do not rewrite unrelated slides or broad sections of the deck.
- Locate each target primarily with slideIndex, slideTitle, selected text, nearbyText, and outerHTMLExcerpt. Use selector/domPath as hints; they may be approximate.
- Before patching or writing ${"`decks/*.html`"}, ensure ${"`DECKS.json`"} contains this deck and call ${"`revela-decks`"} with action ${"`review`"}. If ${"`DECKS.json`"} or the deck entry is missing, initialize/upsert the deck state with ${"`revela-decks`"} first. If readiness remains blocked, explain the blockers instead of forcing the edit.
- Apply the edit to ${payload.file} only after readiness allows deck HTML changes.
- Static design compliance is checked automatically after deck writes. If the tool result reports unknown classes, replace them with classes from the active design.
- Do not run QA after the edit unless the user explicitly asks for diagnostics. PDF/PPTX export commands run hard-error pre-export QA automatically.
- If the comment is ambiguous, ask one concise clarification question instead of guessing.`
}
