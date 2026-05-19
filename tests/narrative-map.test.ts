import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { DECKS_STATE_FILE } from "../lib/decks-state"
import { buildNarrativeViewPrompt, handleNarrative, loadStoryMap, parseNarrativeArgs, parseStoryArgs } from "../lib/commands/narrative"
import { validateNarrativeDisplayModel } from "../lib/narrative-state/display"
import { buildNarrativeMap, formatNarrativeMap } from "../lib/narrative-state/map"
import { renderNarrativeMapHtml } from "../lib/narrative-state/map-html"
import { narrativeMapState, narrativeOnlyState, resolvedState } from "./helpers/narrative-fixtures"
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
      writeStoryVault(workspaceRoot)
      await handleNarrative({ workspaceRoot }, async (message) => { messages.push(message) })
      expect(messages.join("\n")).toContain("Narrative Snapshot")
      expect(messages.join("\n")).toContain("No render targets recorded")
      expect(messages.join("\n")).not.toContain("Narrative map failed")
      expect(existsSync(join(workspaceRoot, DECKS_STATE_FILE))).toBe(false)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it("renders a read-only HTML narrative workspace view", () => {
    const html = renderNarrativeMapHtml(buildNarrativeMap(narrativeMapState()))

    expect(html).toContain("Read-only claim flow board")
    expect(html).toContain("Narrative claim flow board")
    expect(html).toContain("Selected claim")
    expect(html).toContain("Selected evidence")
    expect(html).toContain("selected-claim")
    expect(html).toContain("selected-evidence")
    expect(html).toContain("supports")
    expect(html).toContain("data-evidence-id=\"evidence_supported_ops\"")
    expect(html).toContain("Why this supports the claim")
    expect(html).toContain("Gaps linked to evidence")
    expect(html).toContain("No gaps linked to this evidence.")
    expect(html).toContain("Source")
    expect(html).toContain("researches/map-demo/ops.md")
    expect(html).toContain("section 2")
    expect(html).toContain("Pilot scope fits current operating constraints.")
    expect(html).toContain("evidence-title")
    expect(html).toContain("evidence-field-title")
    expect(html).toContain("evidence-bullets")
    expect(html).toContain("<span class=\"evidence-field-title\">Why this supports the claim</span><ul class=\"evidence-bullets\"><li>")
    expect(html).toContain("<span class=\"evidence-field-title\">Source</span><ul class=\"evidence-bullets\"><li>Operations study</li><li>section 2</li><li>researches/map-demo/ops.md</li>")
    expect(html).not.toContain("<li><strong>Why this supports the claim</strong>")
    expect(html).not.toContain("<li><strong>Source</strong>")
    expect(html).not.toContain("<div class=\"detail-card\"><h3>Status</h3><p>1 Evidence List / 1 Gaps</p></div>")
    expect(html).toContain("Gaps")
    expect(html).toContain("Phased pilot approval is the safer path.")
    expect(html).toContain("Find supplier ecosystem readiness evidence.")
    expect(html).toContain("open / high")
    expect(html).not.toContain("<div class=\"detail-card\"><h3>Claim</h3><p>Phased pilot approval is the safer path.")
    expect(html).not.toContain("coverage:partial")
    expect(html).not.toContain("Artifact does not cover 1 central or evidence-required claim.")
    expect(html).not.toContain("Story workbench")
    expect(html).not.toContain("Next actions")
    expect(html).not.toContain("Narrow claim")
    expect(html).not.toContain("Recommended next command")
    expect(html).not.toContain("data-filter-id")
    expect(html).not.toContain("data-filters")
    expect(html).not.toContain("coverage-slide-list")
    expect(html).toContain("claim:supported")
    expect(html).toContain("claim-card")
    expect(html).toContain("\"EB Garamond\",\"Cormorant Garamond\",Garamond,Georgia,serif")
    expect(html).toContain("grid-template-columns:repeat(3,minmax(0,1fr))")
    expect(html).toContain(".claim-card { width:100%; min-width:0; text-align:left; cursor:pointer; border:0; border-left:6px solid var(--good); background:transparent; color:var(--ink); border-radius:0;")
    expect(html).toContain(".claim-card:hover .claim-title,.claim-card.active .claim-title { color:var(--accent); }")
    expect(html).toContain(".claim-card.supported { border-left-color:var(--good); }")
    expect(html).toContain(".claim-card.partial,.claim-card.weak { border-left-color:var(--warn); }")
    expect(html).toContain(".claim-card.missing { border-left-color:var(--bad); }")
    expect(html).toContain(".claim-card.not_required { border-left-color:var(--line); }")
    expect(html).toContain(".detail-card { min-width:0; border:0; border-left:5px solid var(--line); border-radius:0;")
    expect(html).toContain(".evidence-item { width:100%; min-width:0;")
    expect(html).toContain("border:0; border-left:5px solid var(--good); border-radius:0; background:transparent;")
    expect(html).toContain("box-shadow:none; font-family:var(--reading-font); overflow-wrap:anywhere; word-break:break-word; transition:none;")
    expect(html).toContain(".evidence-item:hover .evidence-title,.evidence-item.active .evidence-title,.evidence-item:hover .evidence-source,.evidence-item.active .evidence-source { color:var(--accent); }")
    expect(html).toContain(".evidence-item.strong { border-left-color:var(--good); }")
    expect(html).toContain(".evidence-item.gap { border-left-color:var(--gap); background:transparent; }")
    expect(html).not.toContain("minmax(420px,1.15fr)")
    expect(html).not.toContain(".claim-card { width:100%; min-width:0; text-align:left; cursor:pointer; border:1px solid var(--line);")
    expect(html).not.toContain(".detail-card { min-width:0; border:1px solid var(--line);")
    expect(html).not.toContain(".evidence-item { width:100%; min-width:0; text-align:left; cursor:pointer; border:1px solid var(--line);")
    expect(html).not.toContain(".claim-card:hover,.claim-card.active { border-color:var(--accent);")
    expect(html).not.toContain(".evidence-item:hover,.evidence-item.active { border-color:var(--accent);")
    expect(html).not.toContain(".claim-card:hover,.claim-card.active { border-color:var(--accent); box-shadow:")
    expect(html).not.toContain(".evidence-item:hover,.evidence-item.active { border-color:var(--accent); box-shadow:")
    expect(html).not.toContain(".claim-card:hover,.claim-card.active { border-left-color:var(--accent);")
    expect(html).not.toContain(".evidence-item:hover,.evidence-item.active { border-left-color:var(--accent);")
    expect(html).not.toContain("transform:translateY(-1px)")
    expect(html).not.toContain(".evidence-item.gap { border-left-color:var(--gap); background:#fbf8ff;")
    expect(html).toContain("font-family:var(--reading-font); overflow-wrap:anywhere; word-break:break-word;")
    expect(html).toContain(".evidence-title { display:block; min-width:0; font-family:var(--reading-font);")
    expect(html).toContain(".evidence-field-title { display:block; margin:0 0 4px;")
    expect(html).toContain(".evidence-bullets { min-width:0;")
    expect(html).toContain(".tag { display:inline-flex; min-width:0; max-width:100%;")
    expect(html).toContain("section-label")
    expect(html).toContain("relation-badge")
    expect(html).toContain("relation-target")
    expect(html).toContain(".relation { display:grid; grid-template-columns:1fr;")
    expect(html).toContain(".relation-badge { width:fit-content; max-width:100%;")
    expect(html).toContain("white-space:normal; overflow-wrap:anywhere;")
    expect(html).toContain(".relation-target { display:block; color:#51483f; font-weight:720; overflow-wrap:anywhere; }")
    expect(html).not.toContain(".relation-badge { flex:0 0 auto;")
    expect(html).toContain("data-node-id=\"claim-claim-supported\"")
  })

  it("does not render gap selectors when no canonical research gaps exist", () => {
    const html = renderNarrativeMapHtml(buildNarrativeMap(resolvedState()))

    expect(html).toContain("Selected evidence")
    expect(html).toContain("data-evidence-id=\"evidence_supported_ops\"")
    expect(html).toContain("No gaps linked to this evidence.")
    expect(html).not.toContain("data-gap-id=")
    expect(html).not.toContain(">Gaps<")
    expect(html).not.toContain("0 Gaps")
    expect(html).not.toContain("Find supplier ecosystem readiness evidence.")
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
      researchGapCards: [{ gapId: "research-gap:supplier-readiness", displayQuestion: "补充供应商生态准备度证据。" }],
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
    expect(html).not.toContain("仅支持试点范围。")
    expect(html).not.toContain("ROI 风险通过阶段门控制。")
    expect(html).not.toContain("尚未证明全无人化制造。")
    expect(html).toContain("补充供应商生态准备度证据。")
    expect(html).not.toContain("Find supplier ecosystem readiness evidence.")
    expect(html).toContain("自定义当前主张")
    expect(html).not.toContain("Story 工作台")
    expect(html).not.toContain("建议命令")
    expect(html).not.toContain("已支持范围")
    expect(html).not.toContain("前置关系")
    expect(html).not.toContain("后续关系")
    expect(html).not.toContain("强度")
    expect(html).not.toContain("位置")
    expect(html).toContain("当前论据")
    expect(html).toContain("论据")
    expect(html).toContain("来源")
    expect(html).toContain("为什么支撑论点")
    expect(html).toContain("这条论据关联的缺口")
    expect(html).toContain("evidence-field-title")
    expect(html).toContain("evidence-bullets")
    expect(html).toContain("<span class=\"evidence-field-title\">为什么支撑论点</span><ul class=\"evidence-bullets\"><li>")
    expect(html).toContain("<span class=\"evidence-field-title\">来源</span><ul class=\"evidence-bullets\"><li>Operations study</li><li>section 2</li><li>researches/map-demo/ops.md</li>")
    expect(html).not.toContain("<li><strong>为什么支撑论点</strong>")
    expect(html).not.toContain("<li><strong>来源</strong>")
    expect(html).not.toContain("研究文件")
    expect(html).toContain("researches/map-demo/ops.md")
    expect(html).toContain("Pilot scope fits current operating constraints.")
    expect(html).toContain("已支持")
    expect(html).toContain("核心")
    expect(html).toContain("建议")
    expect(html).toContain("叙事任务")
    expect(html).toContain("证据摘要")
    expect(html).not.toContain("风险/缺口")
    expect(html).not.toContain("Supported scope")
    expect(html).not.toContain("Incoming relations")
    expect(html).not.toContain("Outgoing relations")
    expect(html).not.toContain("Phased pilot approval is the safer path.")
    expect(html).not.toContain("<h3>已支持范围</h3><p>仅支持试点范围。</p>")
    expect(html).not.toContain("Does not prove lights-out manufacturing.")
    expect(html).not.toContain("ROI may be too uncertain.")
    expect(html).not.toContain("Supplier readiness may lag.")
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
      writeStoryVault(workspaceRoot)

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
      expect(prompt).toContain("research gap displayQuestion")
      expect(prompt).toContain("researchGapCards[].displayQuestion")
      expect(prompt).toContain("For every claim in a non-English target language, provide displayTitle")
      expect(prompt).toContain("For every evidence/detail field that has canonical user-facing text")
      expect(prompt).toContain("vaultDiagnostics")
      expect(prompt).toContain("summaryLine")
      expect(prompt).toContain("riskOrGapSummary")
      expect(prompt).toContain("selectedEvidence")
      expect(prompt).toContain("evidenceList")
      expect(prompt).toContain("sourceTrace")
      expect(prompt).toContain("whyThisSupports")
      expect(prompt).toContain("linkedGaps")
      expect(prompt).toContain("noLinkedGaps")
      expect(prompt).toContain("evidenceBindingIds")
      expect(prompt).toContain("Story UI is evidence-first")
      expect(prompt).toContain("evidence cards must carry the evidence description")
      expect(prompt).toContain("clicking evidence shows only canonical gaps linked to that evidence")
      expect(prompt).toContain("Do not make evidence detail a schema dump")
      expect(prompt).toContain("Do not invent, infer, or soften new gaps in display copy")
      expect(prompt).toContain("Show research gaps only when they exist in compactMap.researchGaps")
      expect(prompt).toContain("selected-claim panel is only an evidence/research-gap card list")
      expect(prompt).toContain("Claim cards should not explain gaps or risks through riskOrGapSummary")
      expect(prompt).toContain("file/nodeId/code/message/suggestedAction")
      expect(prompt).toContain("do not invent missing evidence, source trace, quotes, or caveats")
      expect(prompt).not.toContain("Story workbench labels")
      expect(prompt).toContain("Preserve every claimId exactly")
      expect(prompt).toContain("relation displayRationale may only localize or clarify an existing canonical relation rationale")
      expect(prompt).toContain("when the target language request is Chinese")
      expect(prompt).toContain("translate \"autonomy\" as \"自主化\", \"自主能力\", or \"自主系统\"")
      expect(prompt).toContain("Do not translate it as \"自治\"")
      expect(prompt).toContain("autonomy-is-architectural")
      expect(prompt).toContain("自主化是架构问题")
      expect(prompt).toContain("claim:supported")
      expect(prompt).toContain("rel-claim-supported-supports-claim-partial")
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

  it("shows /revela init guidance when the narrative vault is missing", async () => {
    const workspaceRoot = tempWorkspace("revela-narrative-map-missing-")
    const messages: string[] = []
    try {
      await handleNarrative({ workspaceRoot }, async (text) => { messages.push(text) })
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }

    expect(messages.join("\n")).toContain("/revela init")
    expect(messages.join("\n")).toContain("revela-narrative/")
  })

  it("renders Story from a vault-only workspace without creating DECKS.json", async () => {
    const workspaceRoot = tempWorkspace("revela-narrative-map-readonly-")
    const messages: string[] = []
    try {
      writeStoryVault(workspaceRoot)

      await handleNarrative({ workspaceRoot }, async (text) => { messages.push(text) })

      expect(messages.join("\n")).toContain("Narrative Snapshot")
      expect(messages.join("\n")).toContain("Phased pilot approval is the safer path.")
      expect(existsSync(join(workspaceRoot, DECKS_STATE_FILE))).toBe(false)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it("builds the Story prompt from a vault-only workspace", () => {
    const workspaceRoot = tempWorkspace("revela-narrative-map-vault-prompt-")
    try {
      writeStoryVault(workspaceRoot)

      const prompt = buildNarrativeViewPrompt({ workspaceRoot, language: "fr" })

      expect(prompt).toContain("revela-narrative-view")
      expect(prompt).toContain("claim:supported")
      expect(prompt).toContain("Operations study")
      expect(prompt).not.toContain("No `DECKS.json` found")
      expect(existsSync(join(workspaceRoot, DECKS_STATE_FILE))).toBe(false)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it("loads the Story map from a vault-only workspace", () => {
    const workspaceRoot = tempWorkspace("revela-narrative-map-load-vault-")
    try {
      writeStoryVault(workspaceRoot)

      const loaded = loadStoryMap(workspaceRoot)

      expect(loaded.ok).toBe(true)
      if (loaded.ok) expect(loaded.map.claimFlow.map((claim) => claim.id)).toContain("claim:supported")
      expect(existsSync(join(workspaceRoot, DECKS_STATE_FILE))).toBe(false)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it("opens the generated HTML view when requested without mutating state", async () => {
    const workspaceRoot = tempWorkspace("revela-narrative-map-open-")
    const messages: string[] = []
    const opened: string[] = []
    try {
      writeStoryVault(workspaceRoot)

      await handleNarrative({ workspaceRoot, openBrowser: true, openUrl: (url) => { opened.push(url) } }, async (text) => { messages.push(text) })

      expect(opened).toHaveLength(1)
      expect(opened[0]).toStartWith("file://")
      const htmlPath = opened[0].replace(/^file:\/\//, "")
      expect(existsSync(htmlPath)).toBe(true)
      expect(readFileSync(htmlPath, "utf-8")).toContain("Read-only claim flow board")
      expect(messages.join("\n")).toContain("Opened read-only narrative workspace")
      expect(existsSync(join(workspaceRoot, DECKS_STATE_FILE))).toBe(false)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })
})

function writeStoryVault(root: string): void {
  const vault = join(root, "revela-narrative")
  mkdirSync(join(vault, "claims"), { recursive: true })
  mkdirSync(join(vault, "evidence"), { recursive: true })
  mkdirSync(join(vault, "objections"), { recursive: true })
  mkdirSync(join(vault, "risks"), { recursive: true })
  writeFileSync(join(vault, "index.md"), "---\ntype: index\nid: narrative:story-demo\nstatus: ready_for_approval\n---\n", "utf-8")
  writeFileSync(join(vault, "audience.md"), "---\ntype: audience\nprimary: Board\nbeliefBefore: AI operations feel speculative.\nbeliefAfter: A staged pilot feels bounded.\n---\n", "utf-8")
  writeFileSync(join(vault, "decision.md"), "---\ntype: decision\naction: Approve the phased pilot.\ndecisionType: approve\n---\n", "utf-8")
  writeFileSync(join(vault, "thesis.md"), "---\ntype: thesis\nid: thesis:pilot\nconfidence: medium\n---\nA phased pilot captures upside while bounding execution risk.\n", "utf-8")
  writeFileSync(join(vault, "claims", "supported.md"), "---\ntype: claim\nid: claim:supported\nkind: recommendation\nimportance: central\nevidenceRequired: true\nsupportedScope: Pilot scope only.\n---\nPhased pilot approval is the safer path.\n\n## Caveats\n\n- Only covers pilot scope.\n\n## Relations\n\n- supports: [[claim:partial]] - Line evidence supports the recommendation.\n", "utf-8")
  writeFileSync(join(vault, "claims", "partial.md"), "---\ntype: claim\nid: claim:partial\nkind: evidence\nimportance: supporting\nevidenceRequired: false\n---\nCurrent line data supports initial automation gains.\n", "utf-8")
  writeFileSync(join(vault, "evidence", "supported.md"), "---\ntype: evidence\nid: evidence:supported:ops\nsource: Operations study\nfindingsFile: researches/map-demo/ops.md\nquote: Pilot scope fits current operating constraints.\nlocation: section 2\nsupportScope: Pilot scope only.\nunsupportedScope: Does not prove full rollout.\ncaveat: Pilot-only evidence.\nstrength: strong\n---\n\n## Relations\n\n- supports: [[claim:supported]]\n", "utf-8")
  writeFileSync(join(vault, "objections", "roi.md"), "---\ntype: objection\nid: objection:roi\nclaimId: claim:supported\npriority: high\nresponse: Stage gates bound ROI uncertainty.\n---\nROI may be too uncertain.\n", "utf-8")
  writeFileSync(join(vault, "risks", "supplier.md"), "---\ntype: risk\nid: risk:supplier\nclaimId: claim:supported\nseverity: medium\nmitigation: Use a supplier readiness checkpoint.\n---\nSupplier readiness may lag.\n", "utf-8")
}
