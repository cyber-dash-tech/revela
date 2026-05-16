import { describe, expect, it } from "bun:test"
import { readFileSync } from "fs"
import { ACTIVE_PROMPT_FILE } from "../lib/config"
import { seedBuiltinDesigns } from "../lib/design/designs"
import { seedBuiltinDomains } from "../lib/domain/domains"
import { buildPrompt } from "../lib/prompt-builder"

describe("buildPrompt", () => {
  it("defaults to narrative mode", () => {
    seedBuiltinDesigns()
    seedBuiltinDomains()

    buildPrompt()
    const prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")

    expect(prompt).toContain("Revela prompt mode: narrative")
    expect(prompt).toContain("Revela — Narrative Workspace")
    expect(prompt).not.toContain("On-Demand Design Sections")
  })

  it("builds narrative mode without design or HTML generation layers", () => {
    seedBuiltinDesigns()
    seedBuiltinDomains()

    buildPrompt({ mode: "narrative", designName: "starter", domainName: "general" })
    const prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")

    expect(prompt).toContain("Revela prompt mode: narrative")
    expect(prompt).toContain("Revela — Narrative Workspace")
    expect(prompt).toContain("initNarrativeVault")
    expect(prompt).toContain("upsertNarrative` is deprecated")
    expect(prompt).toContain("reviewNarrative")
    expect(prompt).toContain("Design layer intentionally omitted")
    expect(prompt).not.toContain("Active design:")
    expect(prompt).not.toContain("On-Demand Design Sections")
    expect(prompt).not.toContain("slide-canvas")
  })

  it("injects active domain guidance in narrative mode", () => {
    seedBuiltinDesigns()
    seedBuiltinDomains()

    buildPrompt({ mode: "narrative", designName: "starter", domainName: "consulting" })
    const prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")

    expect(prompt).toContain("Revela prompt mode: narrative")
    expect(prompt).toContain("Active domain: consulting")
    expect(prompt).toContain("Strategic Consulting Reports")
    expect(prompt).toContain("Report Type Auto-Detection")
    expect(prompt).not.toContain("On-Demand Design Sections")
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
    expect(prompt).toContain("| Table of Contents | Always |")
    expect(prompt).toContain("Never skip Cover, Table of Contents, Background, or Closing")
    expect(prompt).toContain("Generate the artifact chapter by chapter")
    expect(prompt).toContain("Do not draft all content slides in")
  })

  it("excludes full domain guidance from deck-render mode", () => {
    seedBuiltinDesigns()
    seedBuiltinDomains()

    buildPrompt({ mode: "deck-render", designName: "starter", domainName: "consulting" })
    const prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")

    expect(prompt).toContain("Revela prompt mode: deck-render")
    expect(prompt).toContain("Active domain: consulting (not injected in deck-render mode)")
    expect(prompt).toContain("Active design: starter")
    expect(prompt).toContain("On-Demand Design Sections")
    expect(prompt).not.toContain("Report Type Auto-Detection")
  })
})
