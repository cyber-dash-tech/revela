import { describe, expect, it } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { RESEARCH_PROMPT } from "../lib/agents/research-prompt"

const skill = readFileSync(join(import.meta.dir, "..", "skill", "SKILL.md"), "utf-8")

describe("primary research orchestration skill", () => {
  it("describes conversation-driven research briefs", () => {
    expect(skill).toContain("Research Brief")
    expect(skill).toContain("the working topic emerges from the")
    expect(skill).toContain("workspace-derived research key")
    expect(skill).toContain("DECKS.json")
  })

  it("requires Task-based revela-research subagent invocation", () => {
    expect(skill).toContain("Task tool with `subagent_type: \"revela-research\"`")
    expect(skill).toContain("`revela-research` is an OpenCode subagent, **not a tool**")
    expect(skill).toContain("NEVER** call `revela-research` as a tool")
    expect(skill).toContain("Do not write or imply a\n`revela-research(...)` tool call")
  })

  it("does not force research agents as the first action", () => {
    expect(skill).toContain("Research is gated by the Research Brief")
    expect(skill).toContain("without new research")
    expect(skill).not.toContain("ALWAYS** launch research agents as your first action")
    expect(skill).not.toContain("LAUNCH TOGETHER (as your first action)")
  })
})

describe("revela-research subagent prompt", () => {
  it("uses DECKS.json before workspace freshness checks", () => {
    expect(RESEARCH_PROMPT).toContain("Use `DECKS.json` through `revela-decks` as the workspace material index")
    expect(RESEARCH_PROMPT).toContain("Use `revela-decks` action `read` first")
    expect(RESEARCH_PROMPT).toContain("lightweight freshness check")
    expect(RESEARCH_PROMPT).toContain("revela-workspace-scan")
  })

  it("keeps research output scoped to revela-research-save", () => {
    expect(RESEARCH_PROMPT).toContain("revela-research-save")
    expect(RESEARCH_PROMPT).toContain("NEVER** write or patch `DECKS.json`")
    expect(RESEARCH_PROMPT).toContain("One file only")
  })

  it("requires source trace in research findings for slide evidence mapping", () => {
    expect(RESEARCH_PROMPT).toContain("slide-level evidence mapping")
    expect(RESEARCH_PROMPT).toContain("Preserve compact source trace")
    expect(RESEARCH_PROMPT).toContain("Location: {page/slide/sheet/section if known}")
    expect(RESEARCH_PROMPT).toContain("Quote: \"{short exact snippet if available}\"")
    expect(RESEARCH_PROMPT).toContain("Caveat: {scope/uncertainty if relevant}")
    expect(RESEARCH_PROMPT).toContain("extractedTextPath")
    expect(RESEARCH_PROMPT).toContain("extractedManifestPath")
    expect(RESEARCH_PROMPT).toContain("Do not invent quotes, page references, locations, URLs, or caveats")
  })

  it("no longer says workspace scan is always first", () => {
    expect(RESEARCH_PROMPT).not.toContain("Scan the workspace for existing documents (always first)")
    expect(RESEARCH_PROMPT).not.toContain("Workspace documents (always first)")
  })
})
