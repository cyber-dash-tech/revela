export interface PageTemplateSlotVocabulary {
  name: string
  required: boolean
  editable: boolean
  replaceable: boolean
  description: string
}

export interface PageTemplateVocabulary {
  templateId: string
  rootClasses: string[]
  requiredClasses: string[]
  optionalClasses: string[]
  slots: PageTemplateSlotVocabulary[]
  editableSlots: string[]
  replaceableSlots: string[]
  contractNotes: string[]
}

const sharedClasses = [
  "template-slide",
  "template-frame",
  "template-eyebrow",
  "template-title",
  "template-body",
  "template-grid",
  "template-chart-layout",
  "cols-2",
  "cols-3",
  "cols-4",
  "template-card",
  "template-list",
  "template-hero",
  "template-hero-title",
  "template-hero--cover",
  "template-hero--section-divider",
  "template-hero--closing",
  "template-frame--catalog",
  "template-page-number",
  "template-image-card",
  "template-image-frame",
  "template-image-caption",
  "template-visual-placeholder",
  "template-visual-placeholder-frame",
  "template-visual-placeholder-label",
]

export const PAGE_TEMPLATE_VOCABULARY: PageTemplateVocabulary[] = [
  vocab("cover", ["template-hero"], ["hero"], ["hero"], ["Cover, divider, and closing templates use the hero frame; keep title hierarchy visible."]),
  vocab("section-divider", ["template-hero"], ["hero"], ["hero"], ["Section divider uses the same hero-safe structure as cover."]),
  vocab("closing", ["template-hero"], ["hero"], ["hero"], ["Closing uses the same hero-safe structure as cover."]),
  vocab("agenda", ["template-agenda-panel"], ["agenda", "agenda-list"], ["agenda", "agenda-list"], ["Agenda numbers must remain in DOM order."]),
  vocab("executive-summary", ["template-card"], ["summary-cards"], ["summary-cards"], ["Cards are editable; visual placeholders are optional and may become image/chart slots."]),
  vocab("team", ["template-team-grid", "template-team-card", "template-team-photo", "template-team-highlights", "template-team-education"], ["members"], ["members"], ["Team cards keep portrait, name/role, highlights, and education as distinct regions.", "Use 3-4 members for a readable 16:9 page; 5-6 members require shorter copy."]),
  vocab("problem-context", ["template-card"], ["context", "supporting-points"], ["context", "supporting-points"], ["Context should stay separate from supporting bullets."]),
  vocab("key-message-evidence", ["template-key-message-panel", "template-evidence-grid"], ["key-message", "evidence"], ["key-message", "evidence"], ["Key message and evidence regions must remain distinct."]),
  vocab("claim-supporting-visual", ["template-claim-text-panel", "template-visual-slot-panel"], ["claim", "visual"], ["claim", "visual"], ["Visual slot may be replaced by image, chart, table, or diagram container."]),
  vocab("metric-highlight", ["template-stat-grid"], ["metrics"], ["metrics", "insight"], ["Metric values should remain visible outside prose."]),
  vocab("chart-takeaways", ["template-chart-panel", "template-chart-takeaway-panel", "template-text-panel--color"], ["visual", "takeaways"], ["visual", "takeaways"], ["Chart/image slot and color takeaway text panel must both remain present.", "Text panels may include quote and formula text members; do not model them as standalone components."]),
  vocab("table", ["template-table-layout", "template-table-wrap", "template-table", "template-side-panel", "template-text-panel", "template-text-panel--clear"], ["text-card", "table"], ["text-card", "table"], ["Left clear text card explains how to read the structured table.", "Table headers and body should remain structured, not prose-only.", "Text panels may include quote text members; do not model quotes as standalone components."]),
  vocab("table-comparison", ["template-table-wrap", "template-table"], ["table"], ["table", "insight"], ["Table headers and body should remain structured, not prose-only."]),
  vocab("milestone", ["template-timeline", "template-timeline-item", "template-timeline-dot", "template-timeline-copy", "template-insight-icon"], ["timeline"], ["timeline"], ["Each milestone item must keep dot and copy as sibling anchors inside one item.", "Milestone cards reuse .template-card; highlight uses the item modifier."]),
  vocab("timeline", ["template-timeline", "template-timeline-item", "template-timeline-dot", "template-timeline-copy"], ["timeline"], ["timeline", "insight"], ["Each timeline item must keep dot and copy as sibling anchors inside one item.", "The optional color insight slot explains the sequence without replacing event copy."]),
  vocab("process-steps", ["template-steps", "template-step-number"], ["steps"], ["steps"], ["Steps should remain ordered in DOM order."]),
  vocab("recommendation-decision", ["template-card"], ["recommendation", "rationale", "next-steps"], ["recommendation", "rationale", "next-steps"], ["Keep recommendation, rationale, and next steps separate."]),
  vocab("risks-tradeoffs", ["template-card"], ["risks"], ["risks"], ["Risk/tradeoff cards should name uncertainty explicitly."]),
  vocab("free", ["template-free-stage", "template-free-placeholder"], ["placeholder"], ["placeholder"], ["Free pages keep a title plus one semantic placeholder region for agent-decided image, chart, text, table, or mixed content.", "Do not split the placeholder into multiple top-level slots when bounded-editing the page."]),
]

const additionalClasses = [
  "template-key-message-panel",
  "template-key-message-kicker",
  "template-evidence-grid",
  "template-evidence-card",
  "template-claim-text-panel",
  "template-claim-text-title",
  "template-claim-text-body",
  "template-agenda-panel",
  "template-agenda-inner",
  "template-agenda-header",
  "template-agenda-footer",
  "template-agenda-list",
  "template-agenda-item",
  "template-stat-grid",
  "template-stat-value",
  "template-metric-layout",
  "template-metric-layout--insight-top",
  "template-metric-layout--insight-bottom",
  "template-chart-panel",
  "template-chart-placeholder",
  "template-visual-slot-panel",
  "template-visual-slot-label",
  "template-chart-takeaway-panel",
  "template-chart-takeaway-list",
  "template-chart-takeaway-item",
  "template-bar",
  "template-table-layout",
  "template-table-region",
  "template-table",
  "template-table-wrap",
  "template-side-panel",
  "template-side-panel-title",
  "template-side-panel-body",
  "template-side-panel--left",
  "template-side-panel--right",
  "template-text-panel",
  "template-text-panel--plain",
  "template-text-panel--clear",
  "template-text-panel--color",
  "template-text-panel-title",
  "template-text-panel-body",
  "template-text-panel-quote",
  "template-text-panel-formula",
  "template-text-panel-formula-caption",
  "template-text-panel-formula-fallback",
  "template-insight-panel",
  "template-insight-title",
  "template-insight-icon",
  "template-insight-body",
  "template-timeline",
  "template-timeline-layout",
  "template-timeline-layout--left",
  "template-timeline-layout--right",
  "template-timeline--horizontal",
  "template-timeline--vertical",
  "template-timeline-item",
  "template-timeline-item--highlight",
  "template-timeline-dot",
  "template-timeline-copy",
  "template-timeline-date",
  "template-steps",
  "template-step-number",
  "template-team-grid",
  "template-team-card",
  "template-team-photo",
  "template-team-copy",
  "template-team-name",
  "template-team-role",
  "template-team-highlights",
  "template-team-education",
  "template-free-stage",
  "template-free-placeholder",
  "template-free-placeholder-label",
  "template-free-placeholder-hints",
  "template-free-placeholder-hint",
  "template-catalog-panel",
  "template-catalog-kicker",
  "template-catalog-title",
  "template-catalog-grid",
  "template-catalog-section",
  "template-catalog-list",
]

export const PAGE_TEMPLATE_CLASSES = [...new Set([...sharedClasses, ...additionalClasses])]

export function listPageTemplateVocabulary(): PageTemplateVocabulary[] {
  return PAGE_TEMPLATE_VOCABULARY
}

export function getPageTemplateVocabulary(templateId: string): PageTemplateVocabulary {
  const id = templateId === "timeline-roadmap" ? "milestone" : templateId
  const vocabulary = PAGE_TEMPLATE_VOCABULARY.find((item) => item.templateId === id)
  if (!vocabulary) throw new Error(`Unknown page template vocabulary: ${templateId}`)
  return templateId === "timeline-roadmap" ? { ...vocabulary, templateId } : vocabulary
}

function vocab(templateId: string, requiredClasses: string[], slotNames: string[], replaceableSlots: string[], contractNotes: string[]): PageTemplateVocabulary {
  const slots = slotNames.map((name) => ({
    name,
    required: true,
    editable: true,
    replaceable: replaceableSlots.includes(name),
    description: `${templateId} ${name} slot.`,
  }))
  return {
    templateId,
    rootClasses: ["template-slide", "template-frame", ...requiredClasses.slice(0, 1)],
    requiredClasses,
    optionalClasses: [],
    slots,
    editableSlots: slotNames,
    replaceableSlots,
    contractNotes,
  }
}
