import { describe, expect, it } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { RESEARCH_PROMPT } from "../lib/agents/research-prompt"
import { NARRATIVE_REVIEWER_PROMPT, NARRATIVE_REVIEWER_SIGNATURE } from "../lib/agents/narrative-reviewer-prompt"

const skill = readFileSync(join(import.meta.dir, "..", "skill", "SKILL.md"), "utf-8")
const plugin = readFileSync(join(import.meta.dir, "..", "plugin.ts"), "utf-8")

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

  it("requires Task-based read-only narrative reviewer invocation", () => {
    expect(skill).toContain("`revela-narrative-reviewer` is a read-only OpenCode subagent, **not a tool**")
    expect(skill).toContain("Task tool with `subagent_type: \"revela-narrative-reviewer\"`")
    expect(skill).toContain("The primary agent should not\nself-certify semantic narrative quality")
    expect(skill).toContain("reviewer findings are advisory notes only")
    expect(skill).toContain("stable finding IDs such as `NB-001`, `KC-001`, `ASK-001`, and\n`EV-001`")
    expect(skill).toContain("`Findings: none` rather\nthan inventing optional improvements")
    expect(skill).toContain("NEVER** call `revela-narrative-reviewer` as a tool")
    expect(skill).toContain("NEVER** present `revela-narrative-reviewer` findings as authoritative")
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

describe("revela-narrative-reviewer subagent prompt", () => {
  it("is clearly signed and read-only", () => {
    expect(NARRATIVE_REVIEWER_PROMPT).toContain(NARRATIVE_REVIEWER_SIGNATURE)
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("specialized read-only narrative reviewer")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("fixed narrative rubric")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("Prefer repeatability over creativity")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("NEVER write, patch, or edit any file")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("NEVER call `revela-decks` actions `init`, `upsertDeck`, `upsertSlides`, `review`, or `remember`")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("NEVER use `websearch` or `webfetch`")
  })

  it("keeps narrative critique advisory and structured", () => {
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("Treat `revela-decks review` as the authoritative readiness gate")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("Your critique is advisory only")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("Narrative review complete.")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("No direct state changes were made.")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("evidenceOverreach")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("decisionAction")
  })

  it("uses a stable rubric and suppresses optional improvements", () => {
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("## Stable Rubric")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("`NB-001` Narrative brief completeness")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("`AB-001` Audience belief shift not reflected")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("`KC-001` Key claim not represented in slides")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("`OBJ-001` Objection not handled")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("`RISK-001` Risk or assumption not carried")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("`ASK-001` Decision/action not reflected in ask")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("`EV-001` Recommendation overreaches evidence")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("`FLOW-001` Declared narrative arc is broken")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("Do not create new IDs")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("Do not brainstorm optional improvements")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("If all rubric checks pass, write exactly `Findings: none`")
    expect(NARRATIVE_REVIEWER_PROMPT).toContain("Do not include general praise")
  })
})

describe("revela subagent registration", () => {
  it("registers narrative reviewer as read-only and skips prompt injection", () => {
    expect(plugin).toContain("NARRATIVE_REVIEWER_PROMPT")
    expect(plugin).toContain('opencodeConfig.agent["revela-narrative-reviewer"]')
    expect(plugin).toContain('description: "Revela narrative reviewer')
    expect(plugin).toContain('webfetch: "deny"')
    expect(plugin).toContain('websearch: "deny"')
    expect(plugin).toContain("systemText.includes(NARRATIVE_REVIEWER_SIGNATURE)")
  })
})
