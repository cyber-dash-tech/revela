import { describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, readDecksState, upsertDeck, upsertSlides, writeDecksState, type DecksState } from "../lib/decks-state"
import { buildNarrativeViewPrompt, handleNarrative, parseNarrativeArgs, parseStoryArgs } from "../lib/commands/narrative"
import { validateNarrativeDisplayModel } from "../lib/narrative-state/display"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { buildNarrativeMap, formatNarrativeMap } from "../lib/narrative-state/map"
import { renderNarrativeMapHtml } from "../lib/narrative-state/map-html"
import { normalizeNarrativeState } from "../lib/narrative-state/normalize"
import { recordArtifactRenderTarget } from "../lib/workspace-state/render-targets"

describe("narrative map", () => {
  function narrativeMapState(): DecksState {
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug: "map-demo",
      goal: "Approve a phased AI manufacturing pilot.",
      audience: "Board",
      outputPath: "decks/map-demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:map-demo",
      status: "ready_for_approval",
      audience: {
        primary: "Board",
        beliefBefore: "The board sees AI manufacturing as speculative.",
        beliefAfter: "The board sees a phased pilot as bounded and evidence-backed.",
      },
      decision: { action: "Approve the phased pilot.", decisionType: "approve" },
      thesis: { id: "thesis:pilot", statement: "A phased pilot captures upside while bounding execution risk.", confidence: "medium" },
      claims: [
        {
          id: "claim:supported",
          kind: "recommendation",
          text: "Phased pilot approval is the safer path.",
          importance: "central",
          evidenceRequired: true,
          evidenceStatus: "supported",
          supportedScope: "Pilot scope only.",
        },
        {
          id: "claim:partial",
          kind: "evidence",
          text: "Current line data supports initial automation gains.",
          importance: "supporting",
          evidenceRequired: true,
          evidenceStatus: "partial",
          unsupportedScope: "Does not prove lights-out manufacturing.",
        },
        {
          id: "claim:missing",
          kind: "opportunity",
          text: "Supplier ecosystem readiness is proven.",
          importance: "supporting",
          evidenceRequired: true,
          evidenceStatus: "missing",
        },
        {
          id: "claim:not-required",
          kind: "context",
          text: "The decision is about sequencing.",
          importance: "background",
          evidenceRequired: false,
          evidenceStatus: "not_required",
        },
      ],
      claimRelations: [
        { id: "relation:supported-partial", fromClaimId: "claim:supported", toClaimId: "claim:partial", relation: "supports", rationale: "Pilot recommendation depends on line evidence." },
        { id: "relation:partial-missing", fromClaimId: "claim:partial", toClaimId: "claim:missing", relation: "depends_on", rationale: "Supplier readiness remains the unresolved proof point." },
      ],
      evidenceBindings: [
        {
          id: "evidence:supported:ops",
          claimId: "claim:supported",
          source: "Operations study",
          findingsFile: "researches/map-demo/ops.md",
          quote: "Pilot scope fits current operating constraints.",
          location: "section 2",
          strength: "strong",
          supportScope: "Pilot scope only.",
        },
        {
          id: "evidence:partial:line",
          claimId: "claim:partial",
          source: "Line data",
          sourcePath: "sources/line-data.xlsx",
          quote: "Automation reduced manual interventions by 18%.",
          location: "Sheet1!B2",
          strength: "partial",
          unsupportedScope: "No supplier readiness proof.",
        },
      ],
      objections: [{ id: "objection:roi", text: "ROI may be too uncertain.", claimId: "claim:supported", priority: "high", response: "Stage gates cap exposure." }],
      risks: [{ id: "risk:supplier", text: "Supplier readiness may lag.", claimId: "claim:partial", severity: "medium", mitigation: "Gate supplier integration separately." }],
      researchGaps: [{
        id: "research-gap:supplier-readiness",
        targetType: "claim",
        targetId: "claim:missing",
        question: "Find supplier ecosystem readiness evidence.",
        status: "open",
        priority: "high",
        createdFromIssueType: "missing_evidence",
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z",
      }],
      approvals: [],
      updatedAt: "2026-05-07T00:00:00.000Z",
    }
    state.narrative = normalizeNarrativeState(state)
    const hash = computeNarrativeHash(state.narrative)
    state.narrative.approvals.push({
      id: "approval:map-demo",
      narrativeHash: hash,
      approvedAt: "2026-05-07T00:00:00.000Z",
      approvedBy: "user",
      scope: "narrative",
    })
    state = upsertSlides(state, "map-demo", [{
      index: 1,
      title: "Pilot Recommendation",
      purpose: "Show why the phased pilot is safer.",
      narrativeRole: "recommendation",
      layout: "two-col",
      components: ["card"],
      content: { headline: "Phased pilot approval is the safer path.", bullets: ["Current line data supports initial automation gains."] },
      evidence: [{ source: "Operations study", findingsFile: "researches/map-demo/ops.md", quote: "Pilot scope fits current operating constraints." }],
      status: "planned",
    }])
    recordArtifactRenderTarget(state, { sourceHtmlPath: "decks/map-demo.html", type: "pdf", outputPath: "decks/map-demo.pdf" })
    recordArtifactRenderTarget(state, { sourceHtmlPath: "decks/map-demo.html", type: "pptx", outputPath: "decks/map-demo.pptx" })
    return state
  }

  function narrativeOnlyState(): DecksState {
    const state = createEmptyDecksState()
    state.narrative = narrativeMapState().narrative
    state.activeDeck = ""
    state.decks = {}
    state.renderTargets = []
    return state
  }

  it("builds a read-only narrative map with snapshot, claim evidence, risks, and artifacts", () => {
    const map = buildNarrativeMap(narrativeMapState())

    expect(map.snapshot).toMatchObject({
      status: "approved",
      approval: "current",
      primaryAudience: "Board",
      decisionAction: "Approve the phased pilot.",
      thesis: "A phased pilot captures upside while bounding execution risk.",
    })
    expect(map.claims.supported).toContainEqual(expect.objectContaining({
      id: "claim:supported",
      evidence: [expect.objectContaining({ findingsFile: "researches/map-demo/ops.md", strength: "strong" })],
    }))
    expect(map.claims.partial).toContainEqual(expect.objectContaining({ id: "claim:partial", unsupportedScope: "Does not prove lights-out manufacturing." }))
    expect(map.claimFlow.map((claim) => claim.id)).toEqual(["claim:supported", "claim:partial", "claim:missing", "claim:not-required"])
    expect(map.claimRelations).toContainEqual(expect.objectContaining({ fromClaimId: "claim:supported", toClaimId: "claim:partial", relation: "supports", inferred: false }))
    expect(map.claims.missing).toContainEqual(expect.objectContaining({ id: "claim:missing" }))
    expect(map.claims.not_required).toContainEqual(expect.objectContaining({ id: "claim:not-required" }))
    expect(map.objections).toContainEqual(expect.objectContaining({ text: "ROI may be too uncertain.", claimText: "Phased pilot approval is the safer path." }))
    expect(map.risks).toContainEqual(expect.objectContaining({ text: "Supplier readiness may lag.", claimText: "Current line data supports initial automation gains." }))
    expect(map.researchGaps).toContainEqual(expect.objectContaining({ question: "Find supplier ecosystem readiness evidence.", targetText: "Supplier ecosystem readiness is proven." }))
    expect(map.artifactCoverage).toContainEqual(expect.objectContaining({ type: "html_deck", outputPath: "decks/map-demo.html" }))
    expect(map.artifactCoverage).toContainEqual(expect.objectContaining({
      type: "html_deck",
      coverageStatus: "partial",
      missingClaimIds: expect.arrayContaining(["claim:missing"]),
      staleReasons: expect.arrayContaining(["Artifact does not cover 1 central or evidence-required claim."]),
    }))
    expect(map.artifactCoverage).toContainEqual(expect.objectContaining({ type: "pdf", outputPath: "decks/map-demo.pdf" }))
    expect(map.artifactCoverage).toContainEqual(expect.objectContaining({ type: "pptx", outputPath: "decks/map-demo.pptx" }))
    expect(map.claimFlow.find((claim) => claim.id === "claim:missing")?.nextActions).toContainEqual(expect.objectContaining({ label: "Research this gap", command: "/revela research" }))
    expect(map.claimFlow.find((claim) => claim.id === "claim:partial")?.nextActions).toContainEqual(expect.objectContaining({ label: "Narrow claim", command: "/revela story" }))
    expect(map.claimFlow.find((claim) => claim.id === "claim:supported")?.nextActions).toContainEqual(expect.objectContaining({ label: "Remake stale artifact", command: "/revela make --deck" }))
    expect(map.workbench.filters).toContainEqual(expect.objectContaining({ id: "missing_evidence", count: 1, claimIds: ["claim:missing"] }))
    expect(map.workbench.filters).toContainEqual(expect.objectContaining({ id: "partial_evidence", count: 1, claimIds: ["claim:partial"] }))
    expect(map.workbench.filters).toContainEqual(expect.objectContaining({ id: "stale_artifacts", count: 3, claimIds: ["claim:supported", "claim:partial", "claim:missing"] }))
    expect(map.workbench.filters).toContainEqual(expect.objectContaining({ id: "open_gaps", count: 1, claimIds: ["claim:missing"] }))
    expect(map.workbench.filters).toContainEqual(expect.objectContaining({ id: "risks", count: 1, claimIds: ["claim:partial"] }))
    expect(map.workbench.filters).toContainEqual(expect.objectContaining({ id: "high_priority_objections", count: 1, claimIds: ["claim:supported"] }))
    expect(map.workbench.artifactCoverage).toContainEqual(expect.objectContaining({
      type: "html_deck",
      outputPath: "decks/map-demo.html",
      coverageStatus: "partial",
      missingClaimIds: ["claim:missing"],
      recommendedNextCommand: "/revela make --deck",
    }))
  })

  it("formats the narrative map as a stable markdown workspace view", () => {
    const text = formatNarrativeMap(buildNarrativeMap(narrativeMapState()))

    expect(text).toContain("## Narrative Snapshot")
    expect(text).toContain("- Approval: current")
    expect(text).toContain("## Claim Evidence Board")
    expect(text).toContain("## Claim Flow")
    expect(text).toContain("Phased pilot approval is the safer path. --supports--> Current line data supports initial automation gains.")
    expect(text).toContain("### supported (1)")
    expect(text).toContain("### partial (1)")
    expect(text).toContain("### missing (1)")
    expect(text).toContain("Evidence: Operations study | strength: strong | findings: researches/map-demo/ops.md | location: section 2 | quote: Pilot scope fits current operating constraints.")
    expect(text).not.toContain("  Findings: researches/map-demo/ops.md")
    expect(text).toContain("## Objections & Risks")
    expect(text).toContain("## Research Gaps")
    expect(text).toContain("Find supplier ecosystem readiness evidence. [open/high]")
    expect(text).toContain("## Render Target Coverage")
    expect(text).toContain("html_deck: decks/map-demo.html")
    expect(text).toContain("coverage: partial")
    expect(text).toContain("Missing claim refs: claim:missing")
    expect(text).toContain("Coverage note: Artifact does not cover 1 central or evidence-required claim.")
    expect(text).toContain("Slide 1: claim:supported [primary]")
    expect(text).toContain("## Story Workbench")
    expect(text).toContain("Filter missing_evidence: 1 (claim:missing)")
    expect(text).toContain("Artifact work item: html_deck: decks/map-demo.html [partial] -> /revela make --deck")
    expect(text).toContain("Next actions: Remake stale artifact (/revela make --deck)")
  })

  it("renders narrative map without an active deck or render target", async () => {
    const state = narrativeOnlyState()
    const map = buildNarrativeMap(state)
    const text = formatNarrativeMap(map)

    expect(map.snapshot.primaryAudience).toBe("Board")
    expect(map.claimFlow.map((claim) => claim.id)).toEqual(["claim:supported", "claim:partial", "claim:missing", "claim:not-required"])
    expect(map.artifactCoverage).toEqual([])
    expect(map.workbench.renderTargetAction).toEqual(expect.objectContaining({ label: "Make deck", command: "/revela make --deck" }))
    expect(text).toContain("## Render Target Coverage")
    expect(text).toContain("- No render targets recorded")
    expect(text).toContain("Render target action: Make deck (/revela make --deck)")
    const html = renderNarrativeMapHtml(map)
    expect(html).toContain("No render targets recorded")
    expect(html).toContain("Recommended next command")
    expect(html).toContain("/revela make --deck")

    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-no-deck-"))
    const messages: string[] = []
    try {
      writeDecksState(workspaceRoot, state)
      await handleNarrative({ workspaceRoot }, async (message) => { messages.push(message) })
      expect(messages.join("\n")).toContain("Narrative Snapshot")
      expect(messages.join("\n")).toContain("No render targets recorded")
      expect(messages.join("\n")).not.toContain("Narrative map failed")
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it("renders a read-only HTML narrative workspace view", () => {
    const html = renderNarrativeMapHtml(buildNarrativeMap(narrativeMapState()))

    expect(html).toContain("Read-only claim flow board")
    expect(html).toContain("Narrative claim flow board")
    expect(html).toContain("Selected claim")
    expect(html).toContain("supports")
    expect(html).toContain("strength: strong | findings file: researches/map-demo/ops.md | location: section 2 | quote: Pilot scope fits current operating constraints.")
    expect(html).toContain("Research gaps")
    expect(html).toContain("Phased pilot approval is the safer path.")
    expect(html).toContain("slide 1")
    expect(html).toContain("coverage:partial")
    expect(html).toContain("Artifact coverage")
    expect(html).toContain("Artifact does not cover 1 central or evidence-required claim.")
    expect(html).toContain("Story workbench")
    expect(html).toContain("Missing evidence (1)")
    expect(html).toContain("Partial evidence (1)")
    expect(html).toContain("Stale artifacts (3)")
    expect(html).toContain("Open gaps (1)")
    expect(html).toContain("High-priority objections (1)")
    expect(html).toContain("data-filter-id=\"missing_evidence\"")
    expect(html).toContain("data-filters=\"all high_priority_objections stale_artifacts\"")
    expect(html).toContain("Next actions")
    expect(html).toContain("Research this gap")
    expect(html).toContain("Narrow claim")
    expect(html).toContain("Recommended next command")
    expect(html).toContain("/revela make --deck")
    expect(html).toContain("claim:supported")
    expect(html).toContain("claim-card")
    expect(html).toContain("claim-section")
    expect(html).toContain("section-label")
    expect(html).toContain("relation-badge")
    expect(html).toContain("relation-target")
    expect(html).toContain("data-node-id=\"claim-claim-supported\"")
  })

  it("renders localized display-only claim card organization", () => {
    const map = buildNarrativeMap(narrativeMapState())
    const display = validateNarrativeDisplayModel(map, {
      version: 1,
      language: "zh-CN",
      pageTitle: "董事会主张推进图",
      summaryLine: "按主张推进顺序阅读，证据和风险保留在右侧详情。",
      labels: { selectedClaim: "自定义当前主张" },
      claimCards: [{
        claimId: "claim:supported",
        displayTitle: "批准分阶段试点",
        roleLabel: "核心建议",
        narrativeJob: "把决策从泛化 AI 投入收敛到可控试点。",
        evidenceSummary: "运营研究支持试点范围。",
        riskOrGapSummary: "ROI 风险通过阶段门控制。",
      }, {
        claimId: "claim:partial",
        displayTitle: "当前产线数据支持初始自动化收益",
        roleLabel: "证据主张",
        narrativeJob: "说明试点建议已有运营数据支撑。",
      }],
      relations: [{ fromClaimId: "claim:supported", toClaimId: "claim:partial", relation: "supports", displayLabel: "由证据支撑", displayRationale: "试点建议由当前产线证据支撑。" }],
    }, "zh-CN")

    const html = renderNarrativeMapHtml(map, display)

    expect(html).toContain("<html lang=\"zh-CN\">")
    expect(html).toContain("董事会主张推进图")
    expect(html).toContain("批准分阶段试点")
    expect(html).toContain("当前产线数据支持初始自动化收益")
    expect(html).toContain("核心建议")
    expect(html).toContain("由证据支撑")
    expect(html).toContain("试点建议由当前产线证据支撑。")
    expect(html).toContain("自定义当前主张")
    expect(html).toContain("Story 工作台")
    expect(html).toContain("建议命令")
    expect(html).toContain("已支持范围")
    expect(html).toContain("前置关系")
    expect(html).toContain("后续关系")
    expect(html).toContain("强度")
    expect(html).toContain("位置")
    expect(html).toContain("页面 1")
    expect(html).toContain("强度: 强 | 研究文件: researches/map-demo/ops.md | 位置: section 2 | 引用: Pilot scope fits current operating constraints.")
    expect(html).toContain("已支持")
    expect(html).toContain("核心")
    expect(html).toContain("建议")
    expect(html).toContain("叙事任务")
    expect(html).toContain("证据摘要")
    expect(html).not.toContain("Supported scope")
    expect(html).not.toContain("Incoming relations")
    expect(html).not.toContain("Outgoing relations")
    expect(html).toContain("claim:supported")
    expect(html).toContain("Operations study")
  })

  it("does not allow display rationale to invent missing canonical causal logic", () => {
    const state = narrativeMapState()
    state.narrative!.claimRelations = [{
      id: "relation:missing-rationale",
      fromClaimId: "claim:supported",
      toClaimId: "claim:partial",
      relation: "supports",
    }]
    const map = buildNarrativeMap(state)

    expect(() => validateNarrativeDisplayModel(map, {
      version: 1,
      language: "zh-CN",
      relations: [{
        fromClaimId: "claim:supported",
        toClaimId: "claim:partial",
        relation: "supports",
        displayRationale: "试点建议由当前产线证据支撑。",
      }],
    }, "zh-CN")).toThrow("Display rationale requires canonical claim relation rationale")

    const html = renderNarrativeMapHtml(map, validateNarrativeDisplayModel(map, { version: 1, language: "zh-CN" }, "zh-CN"))
    const markdown = formatNarrativeMap(map)
    expect(html).toContain("因果依据未记录。")
    expect(markdown).toContain("Rationale: causal rationale is not recorded")
  })

  it("renders inferred relations as unconfirmed order notes instead of causal logic", () => {
    const state = narrativeMapState()
    state.narrative!.claimRelations = []
    const map = buildNarrativeMap(state)
    const display = validateNarrativeDisplayModel(map, {
      version: 1,
      language: "zh-CN",
      claimCards: [
        { claimId: "claim:supported", displayTitle: "批准分阶段试点" },
        { claimId: "claim:partial", displayTitle: "当前产线数据支持初始自动化收益" },
      ],
    }, "zh-CN")

    const html = renderNarrativeMapHtml(map, display)

    expect(map.claimRelations.some((relation) => relation.inferred)).toBe(true)
    expect(html).toContain("批准分阶段试点")
    expect(html).toContain("当前产线数据支持初始自动化收益")
    expect(html).toContain("未确认顺序提示")
    expect(html).toContain("仅表示两个主张在当前叙事顺序中相邻；系统未判断因果、支撑或依赖关系。")
    expect(html).not.toContain("引出 (推断)")
    expect(html).not.toContain("根据主张顺序和主张类型推断，仅用于展示。")
    expect(html).not.toContain("Inferred from claim order and claim kind for display only.")
    expect(formatNarrativeMap(map)).toContain("unconfirmed order note only; no causal, support, or dependency relation has been judged")
  })

  it("does not allow display rationale to replace inferred non-canonical relation logic", () => {
    const state = narrativeMapState()
    state.narrative!.claimRelations = []
    const map = buildNarrativeMap(state)
    const inferred = map.claimRelations.find((relation) => relation.inferred)!

    expect(() => validateNarrativeDisplayModel(map, {
      version: 1,
      language: "en",
      relations: [{
        fromClaimId: inferred.fromClaimId,
        toClaimId: inferred.toClaimId,
        relation: inferred.relation,
        displayRationale: "This causal bridge is now confirmed.",
      }],
    }, "en")).toThrow("Display rationale cannot replace inferred")
  })

  it("does not allow display label to turn inferred relation into causal logic", () => {
    const state = narrativeMapState()
    state.narrative!.claimRelations = []
    const map = buildNarrativeMap(state)
    const inferred = map.claimRelations.find((relation) => relation.inferred)!

    expect(() => validateNarrativeDisplayModel(map, {
      version: 1,
      language: "zh-CN",
      relations: [{
        fromClaimId: inferred.fromClaimId,
        toClaimId: inferred.toClaimId,
        relation: inferred.relation,
        displayLabel: "引出",
      }],
    }, "zh-CN")).toThrow("Display label cannot replace inferred")
  })

  it("parses narrative language flags with en default and raw mode", () => {
    expect(parseNarrativeArgs("")).toEqual({ ok: true, args: { language: "en", raw: false } })
    expect(parseNarrativeArgs("--cn")).toEqual({ ok: true, args: { language: "zh-CN", raw: false } })
    expect(parseNarrativeArgs("--jp --raw")).toEqual({ ok: true, args: { language: "ja-JP", raw: true } })
    expect(parseNarrativeArgs("--fr")).toEqual({ ok: true, args: { language: "fr", raw: false } })
    expect(parseNarrativeArgs("--Portuguese-BR --raw")).toEqual({ ok: true, args: { language: "Portuguese-BR", raw: true } })
    expect(parseNarrativeArgs("中文")).toEqual({ ok: true, args: { language: "中文", raw: false } })
    expect(parseNarrativeArgs("--unknown")).toEqual({ ok: true, args: { language: "unknown", raw: false } })
  })

  it("parses story language flags without accepting equals syntax", () => {
    expect(parseStoryArgs("")).toEqual({ ok: true, args: { language: "en" } })
    expect(parseStoryArgs("--language zh-CN")).toEqual({ ok: true, args: { language: "zh-CN" } })
    expect(parseStoryArgs("-l Japanese")).toEqual({ ok: true, args: { language: "ja-JP" } })
    expect(parseStoryArgs("--language=fr").ok).toBe(false)
    expect(parseStoryArgs("--language").ok).toBe(false)
    expect(parseStoryArgs("--raw").ok).toBe(false)
  })

  it("accepts arbitrary display languages and localized labels", () => {
    const map = buildNarrativeMap(narrativeMapState())
    const display = validateNarrativeDisplayModel(map, {
      version: 1,
      language: "fr",
      pageTitle: "Carte narrative du pilote",
      labels: {
        selectedClaim: "Thèse sélectionnée",
        claimFlow: "Progression des thèses",
        evidence: "Preuve",
        storyWorkbench: "Atelier narratif",
        workbenchNote: "Filtrez les thèses sans modifier l'état narratif.",
        recommendedNextCommand: "Commande recommandée",
      },
      claimCards: [{ claimId: "claim:supported", displayTitle: "Approuver le pilote par étapes" }],
    }, "fr")

    const html = renderNarrativeMapHtml(map, display)

    expect(html).toContain("<html lang=\"fr\">")
    expect(html).toContain("Carte narrative du pilote")
    expect(html).toContain("Thèse sélectionnée")
    expect(html).toContain("Progression des thèses")
    expect(html).toContain("Preuve")
    expect(html).toContain("Atelier narratif")
    expect(html).toContain("Filtrez les thèses sans modifier l'état narratif.")
    expect(html).toContain("Commande recommandée")
    expect(html).toContain("Approuver le pilote par étapes")
  })

  it("builds an LLM display-model prompt that preserves deterministic IDs", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-map-prompt-"))
    try {
      writeDecksState(workspaceRoot, narrativeMapState())

      const prompt = buildNarrativeViewPrompt({ workspaceRoot, language: "fr" })

      expect(prompt).toContain("revela-narrative-view")
      expect(prompt).toContain("Target language request: fr")
      expect(prompt).toContain("--fr, --de, --es, --ko, --Arabic, --Portuguese-BR")
      expect(prompt).toContain("Translate normal UI/display text into the target language request")
      expect(prompt).toContain("Story workbench labels")
      expect(prompt).toContain("Preserve every claimId exactly")
      expect(prompt).toContain("relation displayRationale may only localize or clarify an existing canonical relation rationale")
      expect(prompt).toContain("when the target language request is Chinese")
      expect(prompt).toContain("translate \"autonomy\" as \"自主化\", \"自主能力\", or \"自主系统\"")
      expect(prompt).toContain("Do not translate it as \"自治\"")
      expect(prompt).toContain("autonomy-is-architectural")
      expect(prompt).toContain("自主化是架构问题")
      expect(prompt).toContain("claim:supported")
      expect(prompt).toContain("relation:supported-partial")
      expect(prompt).toContain("Operations study")
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it("reports stale approval when canonical narrative changes", () => {
    const state = narrativeMapState()
    state.narrative!.claims[0].text = "Pilot approval now requires a narrower scope."

    expect(buildNarrativeMap(state).snapshot.approval).toBe("stale")
  })

  it("shows /revela init guidance when DECKS.json is missing", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-map-missing-"))
    const messages: string[] = []
    try {
      await handleNarrative({ workspaceRoot }, async (text) => { messages.push(text) })
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }

    expect(messages.join("\n")).toContain("/revela init")
  })

  it("does not mutate DECKS.json while rendering the command", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-map-readonly-"))
    const messages: string[] = []
    try {
      writeDecksState(workspaceRoot, narrativeMapState())
      const before = JSON.stringify(readDecksState(workspaceRoot))

      await handleNarrative({ workspaceRoot }, async (text) => { messages.push(text) })

      expect(messages.join("\n")).toContain("Narrative Snapshot")
      expect(JSON.stringify(readDecksState(workspaceRoot))).toBe(before)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it("opens the generated HTML view when requested without mutating state", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-narrative-map-open-"))
    const messages: string[] = []
    const opened: string[] = []
    try {
      writeDecksState(workspaceRoot, narrativeMapState())
      const before = JSON.stringify(readDecksState(workspaceRoot))

      await handleNarrative({ workspaceRoot, openBrowser: true, openUrl: (url) => { opened.push(url) } }, async (text) => { messages.push(text) })

      expect(opened).toHaveLength(1)
      expect(opened[0]).toStartWith("file://")
      const htmlPath = opened[0].replace(/^file:\/\//, "")
      expect(existsSync(htmlPath)).toBe(true)
      expect(readFileSync(htmlPath, "utf-8")).toContain("Read-only claim flow board")
      expect(messages.join("\n")).toContain("Opened read-only narrative workspace")
      expect(JSON.stringify(readDecksState(workspaceRoot))).toBe(before)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })
})
