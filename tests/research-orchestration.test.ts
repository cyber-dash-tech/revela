import { describe, expect, it } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { RESEARCH_PROMPT } from "../lib/agents/research-prompt"
import { NARRATIVE_REVIEWER_PROMPT, NARRATIVE_REVIEWER_SIGNATURE } from "../lib/agents/narrative-reviewer-prompt"
import { buildResearchPrompt } from "../lib/commands/research"

const skill = readFileSync(join(import.meta.dir, "..", "skill", "NARRATIVE_SKILL.md"), "utf-8")
const codexResearchSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-research", "SKILL.md"), "utf-8")
const codexStorySkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-story", "SKILL.md"), "utf-8")
const codexReviewDeckSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-review-deck", "SKILL.md"), "utf-8")
const codexCapabilityMatrix = readFileSync(join(import.meta.dir, "..", "docs", "CODEX_PLUGIN_CAPABILITY_MATRIX.md"), "utf-8")
const plugin = readFileSync(join(import.meta.dir, "..", "plugin.ts"), "utf-8")

describe("primary research orchestration skill", () => {
  it("describes conversation-driven research briefs", () => {
    expect(skill).toContain("## Research Rules")
    expect(skill).toContain("start from open research gaps")
    expect(skill).toContain("DECKS.json")
  })

  it("requires Task-based revela-research subagent invocation", () => {
    expect(skill).toContain("delegate external web search to the `revela-research` subagent")
    expect(skill).toContain("save findings through `revela-research-save`")
  })

  it("uses narrative diagnostics without approval gates", () => {
    expect(skill).toContain("call `revela-decks` action `reviewNarrative`")
    expect(skill).toContain("report the tool result as authoritative")
    expect(skill).toContain("Do not ask the user for narrative approval")
  })

  it("does not force research agents as the first action", () => {
    expect(skill).toContain("avoid generic internet research when workspace evidence already supports the claim")
    expect(skill).toContain("stopping when no public evidence can improve the state")
    expect(skill).not.toContain("ALWAYS** launch research agents as your first action")
    expect(skill).not.toContain("LAUNCH TOGETHER (as your first action)")
  })
})

describe("revela research command prompt", () => {
  it("uses deterministic research targets before external search", () => {
    const prompt = buildResearchPrompt({ exists: true, workspaceRoot: "/tmp/revela-demo" })

    expect(prompt).toContain("Required first calls")
    expect(prompt).toContain("Call `revela-decks read` with `summary: true`")
    expect(prompt).toContain("Call `revela-decks reviewNarrative`")
    expect(prompt).toContain("Call `revela-decks deriveResearchTargets`")
    expect(prompt).toContain("treat `selected`, `bindingDiagnostic`, and target order as deterministic inputs")
    expect(prompt).toContain("Do not bypass `deriveResearchTargets`")
    expect(prompt).toContain("target selection, `selected`, `bindingDiagnostic`, and `bindingEval` are deterministic inputs")
  })

  it("prioritizes existing findings and reports binding diagnostics", () => {
    const prompt = buildResearchPrompt({ exists: true })

    expect(prompt).toContain("call `revela-decks evaluateResearchFindings` before external search")
    expect(prompt).toContain("If findings are not bindable, report `missingFields` and `failureReasons`")
    expect(prompt).toContain("then run only targeted research for those missing fields")
    expect(prompt).toContain("`missing_quote`")
    expect(prompt).toContain("`unclear_source`")
    expect(prompt).toContain("`unsupported_scope`")
    expect(prompt).toContain("`caveat_conflict`")
    expect(prompt).toContain("`source_mismatch`")
    expect(prompt).toContain("`context_only_finding`")
  })

  it("requires bindable diagnostics or equivalent explicit fields before automatic binding", () => {
    const prompt = buildResearchPrompt({ exists: true })

    expect(prompt).toContain("If `bindingEval.status === \"bindable\"`, call `revela-decks bindResearchFindings`")
    expect(prompt).toContain("Do not hand-author evidence Markdown for bindable findings")
    expect(prompt).toContain("Never call `upsertNarrative` during research")
    expect(prompt).toContain("revela-narrative/evidence/*.md")
    expect(prompt).toContain("Initialize the vault with `initNarrativeVault`")
    expect(prompt).toContain("Canonical evidence: use `bindResearchFindings`")
    expect(prompt).toContain("`findingsFile`")
    expect(prompt).toContain("supported claim id exists")
    expect(prompt).toContain("Frontmatter `claimId` is compatibility fallback")
    expect(prompt).toContain("supportScope and unsupportedScope are explicit")
    expect(prompt).toContain("binding does not expand the claim")
    expect(prompt).toContain("report `findingsFile`, `bindingEval.status` when available, `bindingDiagnostic.bindable`, `missingFields`, `failureReasons`")
  })

  it("limits claim narrowing to safe vault actions during research", () => {
    const prompt = buildResearchPrompt({ exists: true })

    expect(prompt).toContain("Safe claim narrowing")
    expect(prompt).toContain("edit `revela-narrative/claims/*.md` only when it preserves strategic meaning")
    expect(prompt).toContain("Targeted vault actions are fallback helpers")
    expect(prompt).toContain("Relation rewrites must patch node-local `## Relations` lines and be reported in `Narrative changes`")
    expect(prompt).toContain("Broader narrative rewrites must be reported for Story/user confirmation")
    expect(prompt).not.toContain("through `upsertNarrative` only when")
    expect(prompt).not.toContain("or `upsertNarrative` to preserve canonical evidence bindings")
  })

  it("requires a stable structured research report", () => {
    const prompt = buildResearchPrompt({ exists: true })

    expect(prompt).toContain("Then use these exact sections in order")
    expect(prompt).toContain("`Selected target`")
    expect(prompt).toContain("`Existing findings inspected`")
    expect(prompt).toContain("`Attachments`")
    expect(prompt).toContain("`Evidence bound`")
    expect(prompt).toContain("`Unbound findings`")
    expect(prompt).toContain("`Gap updates`")
    expect(prompt).toContain("`Narrative changes`")
    expect(prompt).toContain("`Remaining caveats`")
    expect(prompt).toContain("`Next smallest story action`")
    expect(prompt).toContain("which explicit fields were present: `source`, `quoteOrSnippet`, `supportScope`, `unsupportedScope`, `caveat`, `strength`")
    expect(prompt).toContain("list every inspected but unbound findings file with structured failure reasons")
  })
})

describe("Codex revela-research skill", () => {
  it("uses tool-backed research before manual evidence authoring", () => {
    expect(codexResearchSkill).toContain("Call `revela_research_targets`")
    expect(codexResearchSkill).toContain("call `revela_evaluate_research_findings`")
    expect(codexResearchSkill).toContain("call `revela_research_save`")
    expect(codexResearchSkill).toContain("calling `revela_bind_research_findings`")
    expect(codexResearchSkill).toContain("do not hand-author evidence Markdown for bindable saved findings")
  })

  it("marks Codex research as tool-backed in the capability matrix", () => {
    expect(codexCapabilityMatrix).toContain("| Research workflow |")
    expect(codexCapabilityMatrix).toContain("MCP targets/save/evaluate/bind tools")
    expect(codexCapabilityMatrix).toContain("Tool-backed MVP")
    expect(codexCapabilityMatrix).toContain("Codex subagent packaging later")
  })
})

describe("Codex revela-story skill", () => {
  it("uses the tool-backed Story reader and remains read-only", () => {
    expect(codexStorySkill).toContain("Call `revela_story_read` first")
    expect(codexStorySkill).toContain("format: \"markdown\"")
    expect(codexStorySkill).toContain("Do not write claims, evidence, research gaps, deck HTML, deck-plan files, assets, or artifacts from Story mode")
    expect(codexStorySkill).toContain("source trace")
    expect(codexStorySkill).toContain("unsupported scope")
  })

  it("marks Codex Story reading as tool-backed in the capability matrix", () => {
    expect(codexCapabilityMatrix).toContain("| Story reading |")
    expect(codexCapabilityMatrix).toContain("`revela_story_read` deterministic map/Markdown tool")
    expect(codexCapabilityMatrix).toContain("Tool-backed MVP")
    expect(codexCapabilityMatrix).toContain("HTML/local UI parity remains OpenCode surface")
  })
})

describe("Codex revela-review-deck skill", () => {
  it("uses the tool-backed Review deck reader and remains read-only by default", () => {
    expect(codexReviewDeckSkill).toContain("Call `revela_review_deck_read` first")
    expect(codexReviewDeckSkill).toContain("format: \"markdown\"")
    expect(codexReviewDeckSkill).toContain("artifact QA, deck-plan diagnostics, narrative/vault diagnostics, artifact coverage, and evidence trace")
    expect(codexReviewDeckSkill).toContain("is read-only")
    expect(codexReviewDeckSkill).toContain("Meaning changes must update `revela-narrative/` first")
  })

  it("marks Codex Review deck reading as tool-backed in the capability matrix", () => {
    expect(codexCapabilityMatrix).toContain("| Review deck reading |")
    expect(codexCapabilityMatrix).toContain("`revela_review_deck_read` aggregate read tool")
    expect(codexCapabilityMatrix).toContain("Tool-backed MVP")
    expect(codexCapabilityMatrix).toContain("full Review UI parity deferred")
  })
})

describe("revela-research subagent prompt", () => {
  it("uses primary-agent context before workspace freshness checks", () => {
    expect(RESEARCH_PROMPT).toContain("Use the workspace and narrative context supplied by the primary agent")
    expect(RESEARCH_PROMPT).toContain("Do not call `revela-decks`")
    expect(RESEARCH_PROMPT).toContain("The primary agent owns canonical workspace state")
    expect(RESEARCH_PROMPT).toContain("lightweight freshness check")
    expect(RESEARCH_PROMPT).toContain("revela-workspace-scan")
    expect(RESEARCH_PROMPT).not.toContain("Use `DECKS.json` through `revela-decks` as the workspace material index")
    expect(RESEARCH_PROMPT).not.toContain("Use `revela-decks` action `read` first")
  })

  it("keeps research output scoped to revela-research-save", () => {
    expect(RESEARCH_PROMPT).toContain("revela-research-save")
    expect(RESEARCH_PROMPT).toContain("NEVER** write or patch `DECKS.json`")
    expect(RESEARCH_PROMPT).toContain("NEVER** call `revela-decks`")
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
  it("registers the file-native deck foundation tool", () => {
    expect(plugin).toContain('import deckFoundationTool from "./tools/deck-foundation"')
    expect(plugin).toContain('"revela-deck-foundation": deckFoundationTool')
  })

  it("registers research agent without access to revela-decks", () => {
    expect(plugin).toContain('opencodeConfig.agent["revela-research"]')
    expect(plugin).toContain('tools: {')
    expect(plugin).toContain('"revela-decks": false')
    expect(plugin).toContain('websearch = "allow"')
    expect(plugin).toContain("systemText.includes(RESEARCH_AGENT_SIGNATURE)")
  })

  it("registers narrative reviewer as read-only and skips prompt injection", () => {
    expect(plugin).toContain("NARRATIVE_REVIEWER_PROMPT")
    expect(plugin).toContain('opencodeConfig.agent["revela-narrative-reviewer"]')
    expect(plugin).toContain('description: "Revela narrative reviewer')
    expect(plugin).toContain('webfetch: "deny"')
    expect(plugin).toContain('websearch: "deny"')
    expect(plugin).toContain("systemText.includes(NARRATIVE_REVIEWER_SIGNATURE)")
  })
})
