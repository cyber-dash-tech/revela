import { describe, expect, it } from "bun:test"
import { existsSync, readFileSync, rmSync } from "fs"
import { readDecksState, writeDecksState } from "../lib/decks-state"
import { buildNarrativeViewPrompt, handleNarrative, parseNarrativeArgs, parseStoryArgs } from "../lib/commands/narrative"
import { validateNarrativeDisplayModel } from "../lib/narrative-state/display"
import { buildNarrativeMap, formatNarrativeMap } from "../lib/narrative-state/map"
import { renderNarrativeMapHtml } from "../lib/narrative-state/map-html"
import { narrativeMapState, narrativeOnlyState } from "./helpers/narrative-fixtures"
import { tempWorkspace } from "./helpers/tool-helpers"

describe("narrative map", () => {

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
    expect(text).not.toContain("## Story Workbench")
    expect(text).not.toContain("Next actions:")
  })

  it("renders narrative map without an active deck or render target", async () => {
    const state = narrativeOnlyState()
    const map = buildNarrativeMap(state)
    const text = formatNarrativeMap(map)

    expect(map.snapshot.primaryAudience).toBe("Board")
    expect(map.claimFlow.map((claim) => claim.id)).toEqual(["claim:supported", "claim:partial", "claim:missing", "claim:not-required"])
    expect(map.artifactCoverage).toEqual([])
    expect(text).toContain("## Render Target Coverage")
    expect(text).toContain("- No render targets recorded")
    expect(text).not.toContain("Render target action")
    const html = renderNarrativeMapHtml(map)
    expect(html).not.toContain("Recommended next command")
    expect(html).not.toContain("Primary next command")

    const workspaceRoot = tempWorkspace("revela-narrative-no-deck-")
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
    expect(html).toContain("Artifact does not cover 1 central or evidence-required claim.")
    expect(html).not.toContain("Story workbench")
    expect(html).not.toContain("Next actions")
    expect(html).not.toContain("Narrow claim")
    expect(html).not.toContain("Recommended next command")
    expect(html).not.toContain("data-filter-id")
    expect(html).not.toContain("data-filters")
    expect(html).not.toContain("coverage-slide-list")
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
        supportRationale: "运营证据说明试点范围符合当前约束，因此支撑分阶段批准。",
        supportedScope: "仅支持试点范围。",
        objectionsSummary: "ROI 不确定性通过阶段门控制。",
        riskOrGapSummary: "ROI 风险通过阶段门控制。",
      }, {
        claimId: "claim:partial",
        displayTitle: "当前产线数据支持初始自动化收益",
        roleLabel: "证据主张",
        narrativeJob: "说明试点建议已有运营数据支撑。",
        evidenceSummary: "产线数据只支持初始自动化收益。",
        supportRationale: "人工干预下降说明存在初始自动化收益，但不能证明全无人化制造。",
        unsupportedScope: "尚未证明全无人化制造。",
        risksSummary: "供应商准备度可能滞后，需要单独设置集成关口。",
      }, {
        claimId: "claim:missing",
        displayTitle: "供应商生态准备度仍需证明",
        researchGapsSummary: "仍需寻找供应商生态准备度证据。",
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
    expect(html).toContain("运营证据说明试点范围符合当前约束，因此支撑分阶段批准。")
    expect(html).toContain("仅支持试点范围。")
    expect(html).toContain("ROI 不确定性通过阶段门控制。")
    expect(html).toContain("尚未证明全无人化制造。")
    expect(html).toContain("供应商准备度可能滞后，需要单独设置集成关口。")
    expect(html).toContain("仍需寻找供应商生态准备度证据。")
    expect(html).toContain("自定义当前主张")
    expect(html).not.toContain("Story 工作台")
    expect(html).not.toContain("建议命令")
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
    expect(html).not.toContain("Phased pilot approval is the safer path.")
    expect(html).not.toContain("Pilot scope only.")
    expect(html).not.toContain("Does not prove lights-out manufacturing.")
    expect(html).not.toContain("ROI may be too uncertain.")
    expect(html).not.toContain("Supplier readiness may lag.")
    expect(html).not.toContain("Find supplier ecosystem readiness evidence.")
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
      },
      claimCards: [{ claimId: "claim:supported", displayTitle: "Approuver le pilote par étapes" }],
    }, "fr")

    const html = renderNarrativeMapHtml(map, display)

    expect(html).toContain("<html lang=\"fr\">")
    expect(html).toContain("Carte narrative du pilote")
    expect(html).toContain("Thèse sélectionnée")
    expect(html).toContain("Progression des thèses")
    expect(html).toContain("Preuve")
    expect(html).toContain("Approuver le pilote par étapes")
  })

  it("builds an LLM display-model prompt that preserves deterministic IDs", () => {
    const workspaceRoot = tempWorkspace("revela-narrative-map-prompt-")
    try {
      writeDecksState(workspaceRoot, narrativeMapState())

      const prompt = buildNarrativeViewPrompt({ workspaceRoot, language: "fr" })

      expect(prompt).toContain("revela-narrative-view")
      expect(prompt).toContain("Target language request: fr")
      expect(prompt).toContain("--fr, --de, --es, --ko, --Arabic, --Portuguese-BR")
      expect(prompt).toContain("Translate normal UI/display text into the target language request")
      expect(prompt).toContain("supportRationale")
      expect(prompt).toContain("supportedScope")
      expect(prompt).toContain("unsupportedScope")
      expect(prompt).toContain("objectionsSummary")
      expect(prompt).toContain("risksSummary")
      expect(prompt).toContain("researchGapsSummary")
      expect(prompt).toContain("For every claim in a non-English target language, provide displayTitle")
      expect(prompt).toContain("For every selected-claim detail field that has canonical user-facing text")
      expect(prompt).not.toContain("Story workbench labels")
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
      expect(prompt).toContain("ROI may be too uncertain.")
      expect(prompt).toContain("Supplier readiness may lag.")
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
    const workspaceRoot = tempWorkspace("revela-narrative-map-missing-")
    const messages: string[] = []
    try {
      await handleNarrative({ workspaceRoot }, async (text) => { messages.push(text) })
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }

    expect(messages.join("\n")).toContain("/revela init")
  })

  it("does not mutate DECKS.json while rendering the command", async () => {
    const workspaceRoot = tempWorkspace("revela-narrative-map-readonly-")
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
    const workspaceRoot = tempWorkspace("revela-narrative-map-open-")
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
