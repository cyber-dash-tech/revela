import type { NarrativeMap, NarrativeMapClaimRelation } from "./map"

export type NarrativeViewLanguage = string

export interface NarrativeDisplayModel {
  version: 1
  language: NarrativeViewLanguage
  pageTitle?: string
  summaryLine?: string
  labels?: Partial<NarrativeDisplayLabels>
  claimCards?: NarrativeDisplayClaimCard[]
  relations?: NarrativeDisplayRelation[]
}

export interface NarrativeDisplayLabels {
  eyebrow: string
  claimFlow: string
  flowNote: string
  selectedClaim: string
  claim: string
  claimId: string
  status: string
  supportedScope: string
  unsupportedScope: string
  incomingRelations: string
  outgoingRelations: string
  evidence: string
  objections: string
  risks: string
  researchGaps: string
  coveredSlides: string
  storyWorkbench: string
  workbenchNote: string
  artifactCoverage: string
  noRenderTargets: string
  nextActions: string
  missingClaims: string
  affectedClaims: string
  affectedSlides: string
  notes: string
  recommendedNextCommand: string
  noClaims: string
  none: string
}

export interface NarrativeDisplayClaimCard {
  claimId: string
  displayTitle?: string
  roleLabel?: string
  narrativeJob?: string
  evidenceSummary?: string
  riskOrGapSummary?: string
}

export interface NarrativeDisplayRelation {
  fromClaimId: string
  toClaimId: string
  relation: NarrativeMapClaimRelation["relation"]
  displayLabel?: string
  displayRationale?: string
}

export interface ValidatedNarrativeDisplayModel {
  version: 1
  language: NarrativeViewLanguage
  pageTitle?: string
  summaryLine?: string
  labels: NarrativeDisplayLabels
  claimCards: Map<string, NarrativeDisplayClaimCard>
  relations: Map<string, NarrativeDisplayRelation>
}

export function defaultNarrativeDisplayLabels(language: NarrativeViewLanguage): NarrativeDisplayLabels {
  if (isChineseLanguage(language)) {
    return {
      eyebrow: "只读主张流",
      claimFlow: "主张推进",
      flowNote: "点击主张查看证据、关系、风险、缺口和已覆盖页面。",
      selectedClaim: "当前主张",
      claim: "主张",
      claimId: "主张 ID",
      status: "状态",
      supportedScope: "已支持范围",
      unsupportedScope: "未支持范围",
      incomingRelations: "前置关系",
      outgoingRelations: "后续关系",
      evidence: "证据",
      objections: "反对意见",
      risks: "风险",
      researchGaps: "研究缺口",
      coveredSlides: "已覆盖页面",
      storyWorkbench: "Story 工作台",
      workbenchNote: "按证据缺口、风险、异议和产物覆盖过滤主张；这里只读展示下一步命令，不修改叙事状态。",
      artifactCoverage: "产物覆盖",
      noRenderTargets: "未记录 render target",
      nextActions: "下一步",
      missingClaims: "缺失主张",
      affectedClaims: "受影响主张",
      affectedSlides: "受影响页面",
      notes: "说明",
      recommendedNextCommand: "建议命令",
      noClaims: "没有记录主张",
      none: "无",
    }
  }
  if (isJapaneseLanguage(language)) {
    return {
      eyebrow: "読み取り専用クレームフロー",
      claimFlow: "クレームフロー",
      flowNote: "クレームをクリックすると、根拠、関係、リスク、ギャップ、該当スライドを確認できます。",
      selectedClaim: "選択中のクレーム",
      claim: "クレーム",
      claimId: "クレーム ID",
      status: "ステータス",
      supportedScope: "裏付けられた範囲",
      unsupportedScope: "未裏付けの範囲",
      incomingRelations: "入力関係",
      outgoingRelations: "出力関係",
      evidence: "根拠",
      objections: "反論",
      risks: "リスク",
      researchGaps: "調査ギャップ",
      coveredSlides: "対応スライド",
      storyWorkbench: "Story ワークベンチ",
      workbenchNote: "根拠ギャップ、リスク、反論、成果物カバレッジでクレームを絞り込みます。ここでは次のコマンドだけを読み取り専用で示し、ナラティブ状態は変更しません。",
      artifactCoverage: "成果物カバレッジ",
      noRenderTargets: "render target は記録されていません",
      nextActions: "次のアクション",
      missingClaims: "不足クレーム",
      affectedClaims: "影響クレーム",
      affectedSlides: "影響スライド",
      notes: "メモ",
      recommendedNextCommand: "推奨コマンド",
      noClaims: "クレームは記録されていません",
      none: "なし",
    }
  }
  return {
    eyebrow: "Read-only claim flow board",
    claimFlow: "Claim Flow",
    flowNote: "Click a claim to inspect support, relation context, gaps, and covered slides.",
    selectedClaim: "Selected claim",
    claim: "Claim",
    claimId: "Claim ID",
    status: "Status",
    supportedScope: "Supported scope",
    unsupportedScope: "Unsupported scope",
    incomingRelations: "Incoming relations",
    outgoingRelations: "Outgoing relations",
    evidence: "Evidence",
    objections: "Objections",
    risks: "Risks",
    researchGaps: "Research gaps",
    coveredSlides: "Covered slides",
    storyWorkbench: "Story workbench",
    workbenchNote: "Filter claims by evidence gaps, risks, objections, and artifact coverage. This view only suggests next commands; it does not mutate narrative state.",
    artifactCoverage: "Artifact coverage",
    noRenderTargets: "No render targets recorded",
    nextActions: "Next actions",
    missingClaims: "Missing claims",
    affectedClaims: "Affected claims",
    affectedSlides: "Affected slides",
    notes: "Notes",
    recommendedNextCommand: "Recommended next command",
    noClaims: "No claims recorded",
    none: "None",
  }
}

export function validateNarrativeDisplayModel(map: NarrativeMap, input: NarrativeDisplayModel | undefined, language: NarrativeViewLanguage): ValidatedNarrativeDisplayModel {
  const defaults = defaultNarrativeDisplayLabels(language)
  if (!input) return emptyDisplayModel(language, defaults)
  if (input.version !== 1) throw new Error("Narrative display model version must be 1.")
  if (input.language !== language) throw new Error(`Narrative display model language must be ${language}.`)

  const claimIds = new Set(map.claimFlow.map((claim) => claim.id))
  const relationByKey = new Map(map.claimRelations.map((relation) => [relationKey(relation), relation]))
  const claimCards = new Map<string, NarrativeDisplayClaimCard>()
  for (const card of input.claimCards ?? []) {
    if (!claimIds.has(card.claimId)) throw new Error(`Unknown display claimId: ${card.claimId}`)
    claimCards.set(card.claimId, cleanClaimCard(card))
  }

  const relations = new Map<string, NarrativeDisplayRelation>()
  for (const relation of input.relations ?? []) {
    const key = relationKey(relation)
    const canonical = relationByKey.get(key)
    if (!canonical) throw new Error(`Display relation is not present in the narrative map: ${key}`)
    relations.set(key, cleanRelation(relation, canonical))
  }

  return {
    version: 1,
    language,
    pageTitle: clean(input.pageTitle),
    summaryLine: clean(input.summaryLine),
    labels: mergeLabels(defaults, input.labels),
    claimCards,
    relations,
  }
}

export function emptyDisplayModel(language: NarrativeViewLanguage, labels = defaultNarrativeDisplayLabels(language)): ValidatedNarrativeDisplayModel {
  return { version: 1, language, labels, claimCards: new Map(), relations: new Map() }
}

export function relationKey(relation: Pick<NarrativeDisplayRelation, "fromClaimId" | "toClaimId" | "relation">): string {
  return `${relation.fromClaimId}\u0000${relation.toClaimId}\u0000${relation.relation}`
}

export function isChineseLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase()
  return normalized === "zh" || normalized === "zh-cn" || normalized === "cn" || normalized === "chinese" || normalized.includes("中文") || normalized.includes("简体")
}

export function isJapaneseLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase()
  return normalized === "ja" || normalized === "ja-jp" || normalized === "jp" || normalized === "japanese" || normalized.includes("日本")
}

function mergeLabels(defaults: NarrativeDisplayLabels, overrides: Partial<NarrativeDisplayLabels> | undefined): NarrativeDisplayLabels {
  const merged: NarrativeDisplayLabels = { ...defaults }
  if (!overrides) return merged
  for (const key of Object.keys(defaults) as Array<keyof NarrativeDisplayLabels>) {
    merged[key] = clean(overrides[key]) ?? defaults[key]
  }
  return merged
}

function cleanClaimCard(card: NarrativeDisplayClaimCard): NarrativeDisplayClaimCard {
  return {
    claimId: card.claimId,
    displayTitle: clean(card.displayTitle),
    roleLabel: clean(card.roleLabel),
    narrativeJob: clean(card.narrativeJob),
    evidenceSummary: clean(card.evidenceSummary),
    riskOrGapSummary: clean(card.riskOrGapSummary),
  }
}

function cleanRelation(relation: NarrativeDisplayRelation, canonical: NarrativeMapClaimRelation): NarrativeDisplayRelation {
  const displayLabel = clean(relation.displayLabel)
  const displayRationale = clean(relation.displayRationale)
  if (displayLabel && canonical.inferred) throw new Error("Display label cannot replace inferred, non-canonical claim relation status.")
  if (displayRationale && canonical.inferred) throw new Error("Display rationale cannot replace inferred, non-canonical claim relation rationale.")
  if (displayRationale && !canonical.rationale?.trim()) throw new Error("Display rationale requires canonical claim relation rationale.")
  return {
    fromClaimId: relation.fromClaimId,
    toClaimId: relation.toClaimId,
    relation: relation.relation,
    displayLabel,
    displayRationale,
  }
}

function clean(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text || undefined
}
