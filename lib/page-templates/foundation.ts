import { getPageTemplateVocabulary, listPageTemplateVocabulary, type PageTemplateVocabulary } from "./vocabulary"

export interface PageTemplateFoundation {
  templateId: string
  html: string
  cssHooks: string[]
  slots: PageTemplateVocabulary["slots"]
  designNotes: string[]
  contractNotes: string[]
}

export function listPageTemplateFoundations(): PageTemplateFoundation[] {
  return listPageTemplateVocabulary().map((item) => getPageTemplateFoundation(item.templateId))
}

export function getPageTemplateFoundation(templateId: string): PageTemplateFoundation {
  const vocabulary = getPageTemplateVocabulary(templateId)
  return {
    templateId: vocabulary.templateId,
    html: foundationHtml(vocabulary),
    cssHooks: [...new Set([...vocabulary.rootClasses, ...vocabulary.requiredClasses, ...vocabulary.optionalClasses])],
    slots: vocabulary.slots,
    designNotes: [
      "Use this foundation as the custom design starting point; style classes, do not remove structural classes.",
      "Prefer overriding visual treatment in design CSS while keeping data-template-slot attributes intact.",
      "Visual slots may become image, chart, table, or diagram containers when the semantic container remains clear.",
    ],
    contractNotes: vocabulary.contractNotes,
  }
}

function foundationHtml(vocabulary: PageTemplateVocabulary): string {
  const slotHtml = vocabulary.slots.map((slot) => `    <div data-template-slot="${slot.name}">${slot.name}</div>`).join("\n")
  return `<section class="slide template-slide" data-template="${vocabulary.templateId}">
  <div class="slide-canvas">
    <div class="template-frame">
${slotHtml}
    </div>
  </div>
</section>`
}
