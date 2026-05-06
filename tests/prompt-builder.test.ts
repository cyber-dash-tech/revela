import { describe, expect, it } from "bun:test"
import { readFileSync } from "fs"
import { ACTIVE_PROMPT_FILE } from "../lib/config"
import { seedBuiltinDesigns } from "../lib/design/designs"
import { seedBuiltinDomains } from "../lib/domain/domains"
import { buildPrompt } from "../lib/prompt-builder"

describe("buildPrompt", () => {
  it("builds narrative mode without design or HTML generation layers", () => {
    seedBuiltinDesigns()
    seedBuiltinDomains()

    buildPrompt({ mode: "narrative", designName: "starter", domainName: "general" })
    const prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")

    expect(prompt).toContain("Revela prompt mode: narrative")
    expect(prompt).toContain("Revela — Narrative Workspace")
    expect(prompt).toContain("upsertNarrative")
    expect(prompt).toContain("reviewNarrative")
    expect(prompt).toContain("Design layer intentionally omitted")
    expect(prompt).not.toContain("Active design:")
    expect(prompt).not.toContain("On-Demand Design Sections")
    expect(prompt).not.toContain("slide-canvas")
  })

  it("builds deck-render mode with the legacy design layer", () => {
    seedBuiltinDesigns()
    seedBuiltinDomains()

    buildPrompt({ mode: "deck-render", designName: "starter", domainName: "general" })
    const prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")

    expect(prompt).toContain("Revela prompt mode: deck-render")
    expect(prompt).toContain("Active design: starter")
    expect(prompt).toContain("AI Presentation Generator")
    expect(prompt).toContain("On-Demand Design Sections")
    expect(prompt).toContain("Layout Index")
  })
})
