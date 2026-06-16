import { getPageTemplateFoundation } from "../foundation"
import { getPageTemplateVocabulary } from "../vocabulary"

export function templateModule(templateId: string) {
  return {
    templateId,
    foundation: () => getPageTemplateFoundation(templateId),
    vocabulary: () => getPageTemplateVocabulary(templateId),
  }
}

