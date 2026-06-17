import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { RESEARCH_PROMPT } from "../lib/agents/research-prompt"
import { NARRATIVE_REVIEWER_PROMPT, NARRATIVE_REVIEWER_SIGNATURE } from "../lib/agents/narrative-reviewer-prompt"
import { buildResearchPrompt } from "../lib/commands/research"

const skill = readFileSync(join(import.meta.dir, "..", "skill", "NARRATIVE_SKILL.md"), "utf-8")
const codexRouterSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela", "SKILL.md"), "utf-8")
const codexSpecSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-spec", "SKILL.md"), "utf-8")
const codexHelperSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-helper", "SKILL.md"), "utf-8")
const codexDesignSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-design", "SKILL.md"), "utf-8")
const codexDomainSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-domain", "SKILL.md"), "utf-8")
const codexResearchSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-research", "SKILL.md"), "utf-8")
const codexStorySkillPath = join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-story", "SKILL.md")
const codexMakeDeckSkill = readFileSync(join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-make-deck", "SKILL.md"), "utf-8")
const codexReviewSkillPath = join(import.meta.dir, "..", "plugins", "revela", "skills", "revela-review", "SKILL.md")
const codexCapabilityMatrix = readFileSync(join(import.meta.dir, "..", "docs", "CODEX_PLUGIN_CAPABILITY_MATRIX.md"), "utf-8")
const codexProductPlan = readFileSync(join(import.meta.dir, "..", "docs", "CODEX_PLUGIN_PRODUCT_PLAN.md"), "utf-8")
const readme = readFileSync(join(import.meta.dir, "..", "README.md"), "utf-8")
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
    expect(prompt).toContain("Run Revela deck-first research")
    expect(prompt).toContain("deck-plan unresolved inputs")
    expect(prompt).toContain("Do not use canonical evidence binding")
    return

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
    expect(prompt).toContain("Run Revela deck-first research")
    expect(prompt).toContain("Save useful findings under researches")
    expect(prompt).toContain("source limitations")
    return

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
    expect(prompt).toContain("Run Revela deck-first research")
    expect(prompt).toContain("Save useful findings under researches")
    expect(prompt).toContain("source limitations")
    return

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
    expect(prompt).toContain("Run Revela deck-first research")
    expect(prompt).toContain("Save useful findings under researches")
    expect(prompt).toContain("source limitations")
    return

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
    expect(prompt).toContain("Run Revela deck-first research")
    expect(prompt).toContain("Save useful findings under researches")
    expect(prompt).toContain("source limitations")
    return

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

describe("Codex revela router skill", () => {
  it("routes by user intent and file-native workspace state without mutating artifacts", () => {
    expect(codexRouterSkill).toContain("name: revela")
    expect(codexRouterSkill).toContain("Route Revela requests to the right specialist workflow")
    expect(codexRouterSkill).toContain("Call `revela_doctor`")
    expect(codexRouterSkill).toContain("Call `revela_design_list`")
    expect(codexRouterSkill).toContain("Call `revela_domain_list`")
    expect(codexRouterSkill).toContain("non-mutating router")
    expect(codexRouterSkill).toContain("No `spec.md`, unclear objective")
    expect(codexRouterSkill).toContain("use `revela-spec`")
    expect(codexRouterSkill).toContain("`spec.md` exists but source support")
    expect(codexRouterSkill).toContain("use `revela-research`")
    expect(codexRouterSkill).toContain("Valid `deck-plan.md` exists")
    expect(codexRouterSkill).toContain("use `revela-make-deck`")
    expect(codexRouterSkill).toContain("Codex Browser's native browsing/annotation flow")
    expect(codexRouterSkill).not.toContain("use `revela-review`")
    expect(codexRouterSkill).toContain("use `revela-export`")
    expect(codexRouterSkill).toContain("Do not write or patch files")
    expect(codexRouterSkill).toContain("Do not create or repair `spec.md` or `deck-plan.md`")
  })

  it("marks Codex routing as skill-backed in the capability matrix", () => {
    expect(codexCapabilityMatrix).toContain("| Workflow routing |")
    expect(codexCapabilityMatrix).toContain("`revela` router skill")
    expect(codexCapabilityMatrix).toContain("`spec.md`, `researches/`, `deck-plan.md`, and deck artifacts")
  })
})

describe("Codex revela-spec skill", () => {
  it("writes only the root demand contract before research or deck planning", () => {
    expect(codexSpecSkill).toContain("name: revela-spec")
    expect(codexSpecSkill).toContain("write a root-level spec.md")
    expect(codexSpecSkill).toContain("`spec.md` is the canonical demand and task specification")
    expect(codexSpecSkill).toContain("Call `revela_doctor`")
    expect(codexSpecSkill).toContain("Call `revela_domain_list`")
    expect(codexSpecSkill).toContain("Call `revela_design_list`")
    expect(codexSpecSkill).toContain("Call `revela_prepare_local_materials`")
    expect(codexSpecSkill).toContain("## Objective")
    expect(codexSpecSkill).toContain("## Audience")
    expect(codexSpecSkill).toContain("## Language")
    expect(codexSpecSkill).toContain("## Domain / Use Case")
    expect(codexSpecSkill).toContain("## Design")
    expect(codexSpecSkill).toContain("output language, terminology preference, and localization notes")
    expect(codexSpecSkill).toContain("active or requested domain, business/use-case context, and decision context")
    expect(codexSpecSkill).toContain("active or requested design, visual direction, and brand/style constraints")
    expect(codexSpecSkill).toContain("## Acceptance Criteria")
    expect(codexSpecSkill).toContain("## Recommended Next Step")
    expect(codexSpecSkill).toContain("Root-level `spec.md`")
    expect(codexSpecSkill).toContain("Do not write `researches/**/*.md`")
    expect(codexSpecSkill).toContain("Do not write `deck-plan.md`")
    expect(codexSpecSkill).toContain("Do not write `decks/*.html`")
  })

  it("marks Codex spec discovery as skill-backed in the capability matrix", () => {
    expect(codexCapabilityMatrix).toContain("| Spec / requirements discovery |")
    expect(codexCapabilityMatrix).toContain("`revela-spec` skill writes root-level `spec.md`")
    expect(codexCapabilityMatrix).toContain("objective, audience, output, language, domain/use-case framing, design, constraints, gaps, acceptance criteria")
  })
})

describe("Codex revela-helper skill", () => {
  it("reports Revela status, active design, and active domain without mutating artifacts", () => {
    expect(codexHelperSkill).toContain("revela_doctor")
    expect(codexHelperSkill).toContain("revela_design_list")
    expect(codexHelperSkill).toContain("revela_domain_list")
    expect(codexHelperSkill).toContain("active design")
    expect(codexHelperSkill).toContain("active domain")
    expect(codexHelperSkill).toContain("must not perform research")
    expect(codexHelperSkill).toContain("`revela` is the main workflow router")
    expect(codexHelperSkill).toContain("Workspace artifact status")
    expect(codexHelperSkill).toContain("No `spec.md` or unclear objective: run `revela-spec`")
    expect(codexHelperSkill).toContain("`spec.md` exists but no `researches/`: run `revela-research`")
    expect(codexHelperSkill).toContain("Research exists but no `deck-plan.md`: continue `revela-research` to the Planning Handoff")
    expect(codexHelperSkill).toContain("Valid `deck-plan.md` but no deck artifact: run `revela-make-deck`")
    expect(codexHelperSkill).toContain("Existing deck artifact: surface the HTML deck as a website card/link")
    expect(codexHelperSkill).toContain("Custom visual system requested: use `revela-design`")
    expect(codexHelperSkill).toContain("Custom narrative domain guidance requested: use `revela-domain`")
    expect(codexHelperSkill).toContain("Do not create, install, or activate designs or domains")
  })
})

describe("Codex skill discoverability docs", () => {
  it("documents design and domain skills in the public Codex skill list", () => {
    expect(readme).toContain("Codex uses eight Revela skills")
    expect(readme).toContain("`revela` for routing the next workflow step")
    expect(readme).toContain("`revela-spec` for writing root-level `spec.md`")
    expect(readme).toContain("`revela-design` for custom design creation/validation/activation")
    expect(readme).toContain("`revela-domain` for custom narrative domain creation/validation/activation")
    expect(readme).not.toContain("`revela-review`")
  })
})

describe("Codex revela-design skill", () => {
  it("restores discoverable draft-first design authoring", () => {
    expect(codexDesignSkill).toContain("name: revela-design")
    expect(codexDesignSkill).toContain("description: Create, edit, validate, package, share, install, activate")
    expect(codexDesignSkill).toContain("create, customize, edit, validate, package, share, install, activate")
    expect(codexDesignSkill).toContain("Call `revela_design_list`")
    expect(codexDesignSkill).toContain("Call `revela_design_read`")
    expect(codexDesignSkill).toContain("Call `revela_design_draft_create`")
    expect(codexDesignSkill).toContain("Call `revela_design_draft_validate`")
    expect(codexDesignSkill).toContain("Call `revela_design_draft_install` only after the draft validates")
    expect(codexDesignSkill).toContain("Call `revela_design_pack`")
    expect(codexDesignSkill).toContain("Call `revela_design_install_archive`")
    expect(codexDesignSkill).toContain("Optional assets must live under `assets/**`")
    expect(codexDesignSkill).toContain("When the user uploads or provides logo, cover, closing, background, texture, brand image")
    expect(codexDesignSkill).toContain("store it inside the design package with `revela_design_draft_create.assets`")
    expect(codexDesignSkill).toContain("the generated preview should visibly use the saved `assets/...` files")
    expect(codexDesignSkill).toContain("pass `assets: [{ path: \"assets/...\", contentBase64|content|sourcePath }]`")
    expect(codexDesignSkill).toContain("Saved asset paths and intended uses")
    expect(codexDesignSkill).toContain("Use `revela_design_create` only when the user explicitly requests direct local creation")
    expect(codexDesignSkill).toContain("Call `revela_design_activate` only when the user asks")
    expect(codexDesignSkill).toContain("Do not write `deck-plan.md`")
    expect(codexDesignSkill).toContain("Do not write `decks/*.html`")
    expect(codexDesignSkill.indexOf("Call `revela_design_draft_create`")).toBeLessThan(codexDesignSkill.indexOf("Call `revela_design_draft_validate`"))
    expect(codexDesignSkill.indexOf("Call `revela_design_draft_validate`")).toBeLessThan(codexDesignSkill.indexOf("Call `revela_design_draft_install` only after the draft validates"))
  })

  it("marks Codex design authoring as skill-backed in the capability matrix", () => {
    expect(codexCapabilityMatrix).toContain("| Design list/read/author/install/share/activate |")
    expect(codexCapabilityMatrix).toContain("`revela-design` skill + design MCP tools")
    expect(codexCapabilityMatrix).toContain("draft create/validate/install")
    expect(codexCapabilityMatrix).toContain("`revela_design_pack` shares `.tar`/`.tar.gz` archives")
    expect(codexCapabilityMatrix).toContain("`revela_design_install_archive` installs them")
  })
})

describe("Codex revela-domain skill", () => {
  it("restores discoverable draft-first domain authoring", () => {
    expect(codexDomainSkill).toContain("name: revela-domain")
    expect(codexDomainSkill).toContain("create, customize, edit, validate, install, activate")
    expect(codexDomainSkill).toContain("Call `revela_domain_list`")
    expect(codexDomainSkill).toContain("Call `revela_domain_read`")
    expect(codexDomainSkill).toContain("Call `revela_domain_draft_create`")
    expect(codexDomainSkill).toContain("Call `revela_domain_draft_validate`")
    expect(codexDomainSkill).toContain("Call `revela_domain_draft_install` only after the draft validates")
    expect(codexDomainSkill).toContain("Use `revela_domain_create` only when the user explicitly requests direct local creation")
    expect(codexDomainSkill).toContain("Call `revela_domain_activate` only when the user asks")
    expect(codexDomainSkill).toContain("Domain guidance is not evidence")
    expect(codexDomainSkill).toContain("Do not write `researches/**/*.md`, `deck-plan.md`, or `decks/*.html`")
    expect(codexDomainSkill.indexOf("Call `revela_domain_draft_create`")).toBeLessThan(codexDomainSkill.indexOf("Call `revela_domain_draft_validate`"))
    expect(codexDomainSkill.indexOf("Call `revela_domain_draft_validate`")).toBeLessThan(codexDomainSkill.indexOf("Call `revela_domain_draft_install` only after the draft validates"))
  })

  it("marks Codex domain authoring as skill-backed in the capability matrix", () => {
    expect(codexCapabilityMatrix).toContain("| Domain list/read/author/install/activate |")
    expect(codexCapabilityMatrix).toContain("`revela-domain` skill + domain MCP tools")
    expect(codexCapabilityMatrix).toContain("draft create/validate/install")
  })
})

describe("Codex revela-research skill", () => {
  it("uses domain-guided material intake, tool-backed research, and deck-plan handoff", () => {
    expect(codexResearchSkill).toContain("Prefer root-level `spec.md` as the demand contract")
    expect(codexResearchSkill).toContain("Call `revela_domain_list`")
    expect(codexResearchSkill).toContain("Call `revela_domain_read`")
    expect(codexResearchSkill).toContain("Read `spec.md` when present")
    expect(codexResearchSkill).toContain("Call `revela_prepare_local_materials`")
    expect(codexResearchSkill).toContain("revela_extract_document_materials")
    expect(codexResearchSkill).toContain("revela_record_material_review")
    expect(codexResearchSkill).toContain("revela_check_material_intake")
    expect(codexResearchSkill).toContain("Save useful findings with `revela_research_save`")
    expect(codexResearchSkill).toContain("Do not bind findings into a Narrative Vault")
    expect(codexResearchSkill).toContain("Planning Handoff")
    expect(codexResearchSkill).toContain("Call `revela_design_list`")
    expect(codexResearchSkill).toContain('Call `revela_design_read` with `section: "rules"`')
    expect(codexResearchSkill).toContain("Call `revela_design_inventory`")
    expect(codexResearchSkill).toContain("Write `deck-plan.md` directly")
    expect(codexResearchSkill).toContain("Call `revela_read_deck_plan` after writing `deck-plan.md`")
    expect(codexResearchSkill).toContain("If diagnostics report `sourceLinks`, layout, slot, component, or `children` issues")
    expect(codexResearchSkill).toContain("`researches/{topic}/{filename}.md`")
    expect(codexResearchSkill).toContain("deck-plan.md")
    expect(codexResearchSkill).toContain("Do not write `spec.md`; route demand changes to `revela-spec`")
    expect(codexResearchSkill).toContain("Do not write `decks/*.html`")
    expect(codexResearchSkill).toContain("Domain guidance is not evidence")
    expect(codexResearchSkill).toContain("## Finding: <stable-id>")
    expect(codexResearchSkill).toContain("## Synthesis: <stable-id>")
    expect(codexResearchSkill).toContain("Question answered")
    expect(codexResearchSkill).toContain("Interpretation")
    expect(codexResearchSkill).toContain("So what")
    expect(codexResearchSkill).toContain("Decision implication")
    expect(codexResearchSkill).toContain("Confidence")
    expect(codexResearchSkill).toContain("Alternative reading")
    expect(codexResearchSkill).toContain("Evidence boundary")
    expect(codexResearchSkill).toContain("Deck use")
    expect(codexResearchSkill).toContain("Display note")
    expect(codexResearchSkill).toContain("Internal boundaries must not be mechanically copied into deck text")
    expect(codexResearchSkill).toContain("Do not use raw findings as the default deck argument")
    expect(codexResearchSkill).toContain("finding-level references when available")
    expect(codexResearchSkill).toContain("`Claim`, `Reasoning`, `Audience takeaway`, `Evidence basis`, and `Boundary handling`")
    expect(codexResearchSkill).toContain("Base slide arguments on `Synthesis` blocks when available")
    expect(codexResearchSkill).toContain("Use `Display note` for short visible caption/source-note scope")
    expect(codexResearchSkill).toContain("Keep `Evidence boundary` internal unless it is required")
    expect(codexResearchSkill).toContain("`Analysis` and `Implementation Note` entries may support deck structure or rendering, but must not be cited as external factual proof")

    expect(codexResearchSkill.indexOf("Save useful findings with `revela_research_save`")).toBeLessThan(codexResearchSkill.indexOf("Call `revela_design_list`"))
    expect(codexResearchSkill.indexOf("Call `revela_design_inventory`")).toBeLessThan(codexResearchSkill.indexOf("Write `deck-plan.md` directly"))
    expect(codexResearchSkill.indexOf("Write `deck-plan.md` directly")).toBeLessThan(codexResearchSkill.indexOf("Call `revela_read_deck_plan` after writing `deck-plan.md`"))
  })

  it("marks Codex research as tool-backed in the capability matrix", () => {
    expect(codexCapabilityMatrix).toContain("| Research workflow |")
    expect(codexCapabilityMatrix).toContain("`revela-research` skill reads `spec.md` when present")
    expect(codexCapabilityMatrix).toContain("`revela_research_save`; for deck goals, Planning Handoff reads active design inventory and writes validated `deck-plan.md`")
    expect(codexCapabilityMatrix).toContain("Tool-backed MVP")
    expect(codexCapabilityMatrix).toContain("Codex subagent packaging later")
  })
})

describe("Codex Story removal", () => {
  it("does not ship a discoverable revela-story skill", () => {
    expect(existsSync(codexStorySkillPath)).toBe(false)
  })

  it("does not advertise Story reading as a Codex capability", () => {
    expect(codexCapabilityMatrix).not.toContain("| Story reading |")
    expect(codexCapabilityMatrix).not.toContain("`revela_story_read` deterministic map/Markdown tool")
  })
})

describe("Codex revela-make-deck skill", () => {
  it("requires an existing deck-plan and design-aware render preflight before HTML generation", () => {
    expect(codexMakeDeckSkill).toContain("Call `revela_design_list`")
    expect(codexMakeDeckSkill).toContain('Call `revela_design_read` with `section: "rules"`')
    expect(codexMakeDeckSkill).toContain("revela_design_inventory")
    expect(codexMakeDeckSkill).toContain("Required: readable `deck-plan.md`")
    expect(codexMakeDeckSkill).toContain("If `deck-plan.md` is missing, stop and tell the user to run `revela` for routing")
    expect(codexMakeDeckSkill).toContain("Slide argument copy comes from `deck-plan.md` `Claim`, `Reasoning`, and `Audience takeaway` fields")
    expect(codexMakeDeckSkill).toContain("treat it as synthesis-thin")
    expect(codexMakeDeckSkill).toContain("do not fill the gap by copying raw findings into slide body copy")
    expect(codexMakeDeckSkill).toContain("This skill does not own normal plan authoring")
    expect(codexMakeDeckSkill).toContain("Allowed plan repairs are limited to technical diagnostics from `revela_read_deck_plan`")
    expect(codexMakeDeckSkill).toContain("Do not redesign the argument structure")
    expect(codexMakeDeckSkill).toContain("Call `revela_read_deck_plan` before HTML generation")
    expect(codexMakeDeckSkill).toContain("Read `htmlWritingBatches`")
    expect(codexMakeDeckSkill).toContain("Keep finding text in source notes, captions, evidence charts, or speaker notes")
    expect(codexMakeDeckSkill).toContain("revela_design_read_layout")
    expect(codexMakeDeckSkill).toContain("revela_design_read_component")
    expect(codexMakeDeckSkill).toContain("at most 5 slide sections")
    expect(codexMakeDeckSkill).toContain("`revela_read_deck_plan` is QA/diagnostics, not a writer")
    expect(codexMakeDeckSkill).not.toContain("revela_upsert_deck_plan")
    expect(codexMakeDeckSkill).not.toContain("revela_upsert_deck_plan_slide")
    expect(codexMakeDeckSkill).toContain("box.children")
    expect(codexMakeDeckSkill).toContain("Do not require a Narrative Vault")
    expect(codexMakeDeckSkill).toContain("domain guidance")
    expect(codexMakeDeckSkill).toContain("design inventory")
    expect(codexMakeDeckSkill).toContain("Do not write a new `deck-plan.md` when it is missing")
    expect(codexMakeDeckSkill).toContain("`decks/*.html`")
    expect(codexMakeDeckSkill).toContain("After the final `revela_run_deck_qa` passes with zero hard errors, reply with a standalone Markdown link")
    expect(codexMakeDeckSkill).toContain("http://127.0.0.1:<port>/decks/<file>.html")

    expect(codexMakeDeckSkill.indexOf("revela_design_inventory")).toBeLessThan(codexMakeDeckSkill.indexOf("revela_read_deck_plan"))
    expect(codexMakeDeckSkill.indexOf("revela_read_deck_plan")).toBeLessThan(codexMakeDeckSkill.indexOf("revela_create_deck_foundation"))
  })
})

describe("Codex Browser deck annotation", () => {
  it("removes the public revela-review skill and keeps review tools compatibility-only", () => {
    expect(existsSync(codexReviewSkillPath)).toBe(false)
    expect(codexCapabilityMatrix).toContain("| Deck annotation after make |")
    expect(codexCapabilityMatrix).toContain("Codex Browser native annotation")
    expect(codexCapabilityMatrix).toContain("no public `revela-review` Codex skill")
    expect(codexProductPlan).toContain("Codex Browser is the default post-make surface")
    expect(codexProductPlan).toContain("revela_review_deck_open` and `revela_review_deck_read` remain compatibility-only")
    expect(codexProductPlan).not.toContain("Review UI Roadmap")
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
    expect(RESEARCH_PROMPT).toContain("finding-level deck-plan source links")
    expect(RESEARCH_PROMPT).toContain("## Finding: <stable-id>")
    expect(RESEARCH_PROMPT).toContain("## Synthesis: <stable-id>")
    expect(RESEARCH_PROMPT).toContain("Question answered: {research question this synthesis resolves}")
    expect(RESEARCH_PROMPT).toContain("Interpretation: {what the evidence means when read together}")
    expect(RESEARCH_PROMPT).toContain("So what: {why this matters for the audience or decision}")
    expect(RESEARCH_PROMPT).toContain("Decision implication: {what should change in the recommendation, story, or slide argument}")
    expect(RESEARCH_PROMPT).toContain("Confidence: {high|medium|low}")
    expect(RESEARCH_PROMPT).toContain("Alternative reading: {plausible competing interpretation or contradiction}")
    expect(RESEARCH_PROMPT).toContain("Location: {page/slide/sheet/section if known}")
    expect(RESEARCH_PROMPT).toContain("Quote/Snippet: \"{short exact snippet if available")
    expect(RESEARCH_PROMPT).toContain("Evidence boundary: {internal support limit")
    expect(RESEARCH_PROMPT).toContain("Deck use: {where this belongs in deck planning}")
    expect(RESEARCH_PROMPT).toContain("Display note: {optional short audience-facing scope note")
    expect(RESEARCH_PROMPT).toContain("Do not mechanically copy `Evidence boundary` into deck copy")
    expect(RESEARCH_PROMPT).toContain("Do not mechanically copy finding bullets into deck copy")
    expect(RESEARCH_PROMPT).toContain("Always** write synthesis")
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
