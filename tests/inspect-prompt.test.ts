import { describe, expect, it } from "bun:test"
import { buildInspectionPrompt } from "../lib/inspect/prompt"

describe("buildInspectionPrompt", () => {
  it("passes the inspect comment and prioritizes purpose/source", () => {
    const prompt = buildInspectionPrompt({
      requestId: "inspect-1",
      file: "decks/demo.html",
      language: "English",
      comment: "@Metric 1 Where does this metric come from?",
      projection: {
        version: 1,
        deck: { slug: "demo", goal: "Explain market position" },
        selectedElement: { scope: "element", slideIndex: 1, text: "42%", classList: [], role: "Metric" },
        match: { confidence: "high", reason: "matched", slide: { index: 1, title: "Market" } },
        cards: {
          source: { status: "supported", sources: [], warnings: [], gaps: [], caveats: [] },
          evidence: { status: "supported", bindings: [] },
          caveats: { items: [] },
          objective: { purpose: "Show traction", whyItMatters: "Supports the recommendation" },
          appendix: { leads: [] },
          artifacts: { items: [] },
        },
      } as any,
    })

    expect(prompt).toContain("User inspect comment: @Metric 1 Where does this metric come from?")
    expect(prompt).toContain("do not parse it into a separate question field")
    expect(prompt).toContain("The user primarily wants to understand the selected component")
    expect(prompt).toContain("answer it through the Purpose and Source cards first")
    expect(prompt).toContain("prioritize Source")
    expect(prompt).toContain("Keep Purpose and Source concise")
  })
})
