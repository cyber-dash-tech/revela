# Deck Plan: Revela Built-in Page Template Catalog

- design: lucent
- output: decks/foo.html
- language: en
- slideCount: 15
- purpose: One page introduces one built-in page template so the template layer can be tuned independently from the design layer.

### Slide 1 - cover

- id: template-01-cover
- title: cover
- template: cover
- layout: full-bleed
- purpose: Introduce the cover page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: cover
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 01 / 15",
  "title": "cover",
  "subtitle": "Opening page for artifact title, audience context, and a single first impression.",
  "catalog": {
    "title": "Cover",
    "purpose": "Use once at the beginning to name the artifact and frame the conversation.",
    "fields": [
      "eyebrow",
      "title",
      "subtitle"
    ],
    "qa": [
      "One dominant H1",
      "No evidence detail",
      "Hero contrast remains readable"
    ]
  }
}
```

### Slide 2 - section-divider

- id: template-02-section-divider
- title: section-divider
- template: section-divider
- layout: full-bleed
- purpose: Introduce the section-divider page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: section-divider
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 02 / 15",
  "title": "section-divider",
  "subtitle": "Chapter transition page that resets attention before the next argument block.",
  "catalog": {
    "title": "Section Divider",
    "purpose": "Separate major chapters without introducing new evidence or dense content.",
    "fields": [
      "eyebrow",
      "title",
      "subtitle"
    ],
    "qa": [
      "One transition idea",
      "Short title",
      "Works without cards"
    ]
  }
}
```

### Slide 3 - closing

- id: template-03-closing
- title: closing
- template: closing
- layout: full-bleed
- purpose: Introduce the closing page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: closing
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 03 / 15",
  "title": "closing",
  "subtitle": "Final ask, decision, or principle stated with no competing message.",
  "catalog": {
    "title": "Closing",
    "purpose": "End with the action or decision the audience should remember.",
    "fields": [
      "title",
      "subtitle"
    ],
    "qa": [
      "One final ask",
      "No new supporting chart",
      "High contrast close"
    ]
  }
}
```

### Slide 4 - agenda

- id: template-04-agenda
- title: agenda
- template: agenda
- layout: full-bleed
- purpose: Introduce the agenda page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: agenda
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 04 / 15",
  "title": "agenda",
  "subtitle": "A compact map of the deck flow.",
  "items": [
    {
      "label": "Frame the decision",
      "description": "Name the audience question and why it matters now."
    },
    {
      "label": "Show the evidence",
      "description": "Keep the proof sequence visible and ordered."
    },
    {
      "label": "Compare options",
      "description": "Make tradeoffs explicit before the ask."
    },
    {
      "label": "Close with action",
      "description": "Leave the next step unambiguous."
    }
  ],
  "catalog": {
    "title": "Agenda / TOC",
    "purpose": "Orient the reader before a longer artifact or at the beginning of a chapter.",
    "fields": [
      "title",
      "items[]"
    ],
    "qa": [
      "3-6 ordered items",
      "DOM order matches reading order",
      "No long paragraphs"
    ]
  }
}
```

### Slide 5 - executive-summary

- id: template-05-executive-summary
- title: executive-summary
- template: executive-summary
- layout: full-bleed
- purpose: Introduce the executive-summary page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: executive-summary
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 05 / 15",
  "title": "executive-summary",
  "subtitle": "Decision logic compressed into a few scannable takeaways.",
  "items": [
    {
      "label": "Decision is ready",
      "description": "The facts support moving from discussion to selection without adding another analysis cycle."
    },
    {
      "label": "Risk is bounded",
      "description": "Known caveats are visible, named, and can be managed through rollout gates."
    },
    {
      "label": "Next step is narrow",
      "description": "A pilot decision creates more learning without overcommitting capital or team capacity."
    }
  ],
  "catalog": {
    "title": "Executive Summary",
    "purpose": "Summarize the whole argument for readers who may only scan one page.",
    "fields": [
      "title",
      "items[]"
    ],
    "qa": [
      "3-4 summary cards",
      "Each card has support line",
      "No raw table dump"
    ]
  }
}
```

### Slide 6 - problem-context

- id: template-06-problem-context
- title: problem-context
- template: problem-context
- layout: full-bleed
- purpose: Introduce the problem-context page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: problem-context
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 06 / 15",
  "title": "problem-context",
  "subtitle": "Why this topic matters now.",
  "body": "Use this template when the audience needs the situation, tension, and implication before seeing recommendations.",
  "items": [
    {
      "label": "Situation",
      "description": "A shift has changed the operating baseline."
    },
    {
      "label": "Tension",
      "description": "Current process cannot absorb the new variance cleanly."
    },
    {
      "label": "Implication",
      "description": "Delay increases rework and weakens decision confidence."
    }
  ],
  "catalog": {
    "title": "Problem / Context",
    "purpose": "Frame the problem without jumping straight into a solution.",
    "fields": [
      "title",
      "body",
      "items[]"
    ],
    "qa": [
      "Situation separate from implication",
      "Main message outside cards",
      "No unsupported claims"
    ]
  }
}
```

### Slide 7 - key-message-evidence

- id: template-07-key-message-evidence
- title: key-message-evidence
- template: key-message-evidence
- layout: full-bleed
- purpose: Introduce the key-message-evidence page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: key-message-evidence
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 07 / 15",
  "title": "key-message-evidence",
  "subtitle": "A claim on the left, evidence on the right.",
  "claim": "Template selection should preserve structure before style.",
  "body": "This key message stays large and readable, while the supporting evidence is separated into traceable slots for source-backed proof.",
  "items": [
    {
      "label": "Evidence 1",
      "description": "The generated HTML separates the key-message panel from the evidence grid, so the claim cannot collapse into generic card content."
    },
    {
      "label": "Evidence 2",
      "description": "Each evidence slot has a stable title and explanation area, giving the agent a predictable place for proof, caveat, or source-backed detail."
    },
    {
      "label": "Evidence 3",
      "description": "QA can inspect the DOM contract before visual styling, which keeps template structure from depending on a design skin."
    }
  ],
  "catalog": {
    "title": "Key Message + Evidence",
    "purpose": "Use when one claim needs several concise support points.",
    "fields": [
      "title",
      "claim",
      "body",
      "items[]"
    ],
    "qa": [
      "Claim visible",
      "Evidence cards present",
      "No invented proof"
    ]
  }
}
```

### Slide 8 - claim-supporting-visual

- id: template-08-claim-supporting-visual
- title: claim-supporting-visual
- template: claim-supporting-visual
- layout: full-bleed
- purpose: Introduce the claim-supporting-visual page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: claim-supporting-visual
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 08 / 15",
  "title": "claim-supporting-visual",
  "subtitle": "One claim paired with one bounded visual area.",
  "claim": "A single visual should carry one argument.",
  "body": "The template reserves a stable visual region while keeping explanatory copy close enough to guide interpretation.",
  "visualTitle": "Visual placeholder",
  "visualNote": "Replace with an image, diagram, UI capture, or chart once the source asset is known.",
  "items": [
    {
      "label": "Anchor",
      "description": "State what the reader should inspect first."
    },
    {
      "label": "Callout",
      "description": "Use short labels instead of a second paragraph."
    }
  ],
  "catalog": {
    "title": "Claim + Supporting Visual",
    "purpose": "Use for one visual argument, not a collage of unrelated proof.",
    "fields": [
      "title",
      "claim",
      "body",
      "visualTitle",
      "items[]"
    ],
    "qa": [
      "Visual region present",
      "One argument only",
      "Readable at export size"
    ]
  }
}
```

### Slide 9 - metric-highlight

- id: template-09-metric-highlight
- title: metric-highlight
- template: metric-highlight
- layout: full-bleed
- purpose: Introduce the metric-highlight page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: metric-highlight
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 09 / 15",
  "title": "metric-highlight",
  "subtitle": "Let a small number set carry the page.",
  "insightTitle": "Read the signal",
  "insightIcon": "scan-search",
  "insightBody": "Treat the metric row as the evidence surface, then use this panel to state the decision implication, caveat, or next reading step.",
  "insightPosition": "bottom",
  "metrics": [
    {
      "value": "67%",
      "label": "Adoption signal",
      "description": "Primary number plus interpretation."
    },
    {
      "value": "3x",
      "label": "Review speed",
      "description": "Comparison is stated beside the metric."
    },
    {
      "value": "14d",
      "label": "Pilot window",
      "description": "Time bound keeps the ask concrete."
    }
  ],
  "catalog": {
    "title": "Metric Highlight",
    "purpose": "Use when metrics are the main evidence and need editorial hierarchy.",
    "fields": [
      "title",
      "metrics[]",
      "insightBody"
    ],
    "qa": [
      "Values not buried in prose",
      "Every value has label",
      "Interpretation line included"
    ]
  }
}
```

### Slide 10 - chart-takeaways

- id: template-10-chart-takeaways
- title: chart-takeaways
- template: chart-takeaways
- layout: full-bleed
- purpose: Introduce the chart-takeaways page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: chart-takeaways
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 10 / 15",
  "title": "chart-takeaways",
  "subtitle": "A bounded chart region plus the conclusions to read from it.",
  "chartTitle": "Illustrative chart slot",
  "takeawaysTitle": "What to read",
  "items": [
    {
      "label": "Trend",
      "description": "Call out the movement or comparison the chart is meant to prove, including the direction and the comparison baseline."
    },
    {
      "label": "Driver",
      "description": "Name the likely reason without overclaiming; separate observed movement from the interpretation or hypothesis."
    },
    {
      "label": "Decision use",
      "description": "Explain how the chart changes the recommendation, what threshold matters, and what follow-up evidence would reduce risk."
    }
  ],
  "catalog": {
    "title": "Chart + Takeaways",
    "purpose": "Use when a chart needs interpretation, not just placement.",
    "fields": [
      "title",
      "chartTitle",
      "takeawaysTitle",
      "items[]"
    ],
    "qa": [
      "Chart area bounded",
      "Takeaways separate",
      "Chart title visible"
    ]
  }
}
```

### Slide 11 - table-comparison

- id: template-11-table-comparison
- title: table-comparison
- template: table-comparison
- layout: full-bleed
- purpose: Introduce the table-comparison page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: table-comparison
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 11 / 15",
  "title": "table-comparison",
  "subtitle": "Compare options, states, or template responsibilities.",
  "columns": [
    "Dimension",
    "Template Layer",
    "Design Layer"
  ],
  "rows": [
    {
      "Dimension": "Layout",
      "Template Layer": "Owns structure",
      "Design Layer": "Styles surfaces"
    },
    {
      "Dimension": "Content",
      "Template Layer": "Names fields",
      "Design Layer": "Keeps hierarchy"
    },
    {
      "Dimension": "Assets",
      "Template Layer": "Defines slot intent",
      "Design Layer": "Selects visual treatment"
    },
    {
      "Dimension": "QA",
      "Template Layer": "Checks contract",
      "Design Layer": "Checks polish"
    }
  ],
  "insightTitle": "Insight",
  "insightBody": "Template owns the table structure and reading contract; design only changes the surface treatment, typography, and emphasis.",
  "insightIcon": "lightbulb",
  "catalog": {
    "title": "Table / Comparison",
    "purpose": "Use for structured comparison that should be scanned row by row.",
    "fields": [
      "title",
      "columns[]",
      "rows[]",
      "insightBody"
    ],
    "qa": [
      "Headers present",
      "Rows stay concise",
      "Not used for pure prose"
    ]
  }
}
```

### Slide 12 - timeline-roadmap

- id: template-12-timeline-roadmap
- title: timeline-roadmap
- template: timeline-roadmap
- layout: full-bleed
- purpose: Introduce the timeline-roadmap page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: timeline-roadmap
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 12 / 15",
  "title": "timeline-roadmap",
  "subtitle": "A dated journey with alternating vertical milestones.",
  "orientation": "vertical",
  "insightTitle": "Reading the journey",
  "insightBody": "The timeline should show sequence and decision rhythm, while the side panel explains why the milestones matter.",
  "insightSide": "right",
  "milestones": [
    {
      "date": "Mar 2019",
      "label": "Launch",
      "description": "Baseline mapping."
    },
    {
      "date": "Nov 2019",
      "label": "Audit",
      "description": "Evidence sprint."
    },
    {
      "date": "May 2020",
      "label": "Scale",
      "description": "Operating cadence."
    },
    {
      "date": "Feb 2021",
      "label": "Review",
      "description": "QA before export."
    }
  ],
  "catalog": {
    "title": "Timeline / Roadmap",
    "purpose": "Use for dated phases, historical evolution, or future plans.",
    "fields": [
      "title",
      "orientation",
      "milestones[]",
      "insightBody"
    ],
    "qa": [
      "Dot and copy are siblings",
      "Dots align to copy center",
      "3-6 milestones"
    ]
  }
}
```

### Slide 13 - process-steps

- id: template-13-process-steps
- title: process-steps
- template: process-steps
- layout: full-bleed
- purpose: Introduce the process-steps page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: process-steps
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 13 / 15",
  "title": "process-steps",
  "subtitle": "A short ordered process with action-first labels.",
  "steps": [
    {
      "label": "Choose",
      "description": "Select the page template that matches the communication job."
    },
    {
      "label": "Fill",
      "description": "Provide only the content fields the template needs."
    },
    {
      "label": "Style",
      "description": "Let the active design control type, color, and surfaces."
    },
    {
      "label": "QA",
      "description": "Run contract and visual checks before export."
    }
  ],
  "catalog": {
    "title": "Process / Steps",
    "purpose": "Use for a sequence the audience should follow in order.",
    "fields": [
      "title",
      "steps[]"
    ],
    "qa": [
      "3-5 steps",
      "Numbers in DOM order",
      "Action verbs first"
    ]
  }
}
```

### Slide 14 - recommendation-decision

- id: template-14-recommendation-decision
- title: recommendation-decision
- template: recommendation-decision
- layout: full-bleed
- purpose: Introduce the recommendation-decision page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: recommendation-decision
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 14 / 15",
  "title": "recommendation-decision",
  "subtitle": "Make the ask explicit, then show rationale and next steps.",
  "recommendation": "Adopt page templates as the structural layer, with designs remaining user-customizable.",
  "image": "../designs/lucent/assets/report-visual.jpg",
  "imageAlt": "Lucent report visual texture",
  "imageCaption": "Design asset example",
  "items": [
    {
      "label": "Rationale",
      "description": "This keeps generation reliable while leaving style expressive and replaceable."
    }
  ],
  "steps": [
    {
      "label": "Pilot",
      "description": "Use foo.html to tune every built-in template."
    },
    {
      "label": "Validate",
      "description": "Promote only contracts that pass QA and browser review."
    },
    {
      "label": "Ship",
      "description": "Document the add-slide workflow for agents."
    }
  ],
  "catalog": {
    "title": "Recommendation / Decision / Ask",
    "purpose": "Use when the page needs a clear decision request and follow-through.",
    "fields": [
      "title",
      "recommendation",
      "image",
      "items[]",
      "steps[]"
    ],
    "qa": [
      "Ask is plain",
      "Rationale separate",
      "Next steps ordered"
    ]
  }
}
```

### Slide 15 - risks-tradeoffs

- id: template-15-risks-tradeoffs
- title: risks-tradeoffs
- template: risks-tradeoffs
- layout: full-bleed
- purpose: Introduce the risks-tradeoffs page template with a live example and contract notes.
- narrativeRole: template-catalog
- components: risks-tradeoffs
- sourceLinks: built-in page template registry

#### Template Content

```json
{
  "eyebrow": "Template 15 / 15",
  "title": "risks-tradeoffs",
  "subtitle": "Keep uncertainty visible instead of hiding it in prose.",
  "items": [
    {
      "label": "Too rigid",
      "description": "Templates should be editable HTML starts, not locked slide generators.",
      "image": "../designs/lucent/assets/card-lens.jpg",
      "imageAlt": "Lucent lens texture",
      "imageCaption": "Flexibility"
    },
    {
      "label": "Too vague",
      "description": "Contracts should include required fields and QA checks.",
      "image": "../designs/lucent/assets/soft-texture.jpg",
      "imageAlt": "Lucent soft texture",
      "imageCaption": "Contract"
    },
    {
      "label": "Too stylish",
      "description": "Design should not overwrite the communication structure.",
      "image": "../designs/lucent/assets/report-visual.jpg",
      "imageAlt": "Lucent report visual",
      "imageCaption": "Structure first"
    }
  ],
  "catalog": {
    "title": "Risks / Caveats / Tradeoffs",
    "purpose": "Use when limitations, alternatives, or implementation risks must stay visible.",
    "fields": [
      "title",
      "items[]",
      "item.image"
    ],
    "qa": [
      "Risks named directly",
      "Caveats visible",
      "No false certainty"
    ]
  }
}
```
