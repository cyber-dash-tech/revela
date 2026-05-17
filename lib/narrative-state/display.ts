import type { NarrativeMap, NarrativeMapClaimRelation } from "./map"

export type NarrativeViewLanguage = string

export interface NarrativeDisplayModel {
  version: 1
  language: NarrativeViewLanguage
  pageTitle?: string
  summaryLine?: string
  labels?: Partial<NarrativeDisplayLabels>
  claimCards?: NarrativeDisplayClaimCard[]
  researchGapCards?: NarrativeDisplayResearchGapCard[]
  relations?: NarrativeDisplayRelation[]
}

export interface NarrativeDisplayLabels {
  eyebrow: string
  claimFlow: string
  flowNote: string
  selectedClaim: string
  selectedEvidence: string
  evidenceList: string
  gap: string
  gaps: string
  noEvidence: string
  selectEvidencePrompt: string
  sourceTrace: string
  evidenceSource: string
  whyThisSupports: string
  linkedGaps: string
  selectedGap: string
  noLinkedGaps: string
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
  noClaims: string
  none: string
}

export interface NarrativeDisplayClaimCard {
  claimId: string
  displayTitle?: string
  roleLabel?: string
  narrativeJob?: string
  evidenceSummary?: string
  supportRationale?: string
  supportedScope?: string
  unsupportedScope?: string
  objectionsSummary?: string
  risksSummary?: string
  riskOrGapSummary?: string
  researchGapsSummary?: string
}

export interface NarrativeDisplayResearchGapCard {
  gapId: string
  displayQuestion?: string
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
  researchGapCards: Map<string, NarrativeDisplayResearchGapCard>
  relations: Map<string, NarrativeDisplayRelation>
}

export function defaultNarrativeDisplayLabels(language: NarrativeViewLanguage): NarrativeDisplayLabels {
  if (isChineseLanguage(language)) {
    return {
      eyebrow: "只读主张流",
      claimFlow: "主张推进",
      flowNote: "点击主张查看论据和真实存在的缺口；点击论据查看它关联的缺口。",
      selectedClaim: "当前主张",
      selectedEvidence: "当前论据",
      evidenceList: "论据",
      gap: "缺口",
      gaps: "缺口",
      noEvidence: "没有绑定论据",
      selectEvidencePrompt: "选择一条论据或缺口查看详情",
      sourceTrace: "来源追踪",
      evidenceSource: "来源",
      whyThisSupports: "为什么支撑论点",
      linkedGaps: "这条论据关联的缺口",
      selectedGap: "当前缺口",
      noLinkedGaps: "这条论据没有关联缺口",
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
      noClaims: "没有记录主张",
      none: "无",
    }
  }
  if (isJapaneseLanguage(language)) {
    return {
      eyebrow: "読み取り専用クレームフロー",
      claimFlow: "クレームフロー",
      flowNote: "クレームをクリックして根拠と実在するギャップを確認し、根拠をクリックして紐づくギャップを確認します。",
      selectedClaim: "選択中のクレーム",
      selectedEvidence: "選択中の根拠",
      evidenceList: "根拠",
      gap: "ギャップ",
      gaps: "ギャップ",
      noEvidence: "紐づいた根拠はありません",
      selectEvidencePrompt: "根拠またはギャップを選択して詳細を確認してください",
      sourceTrace: "出典トレース",
      evidenceSource: "出典",
      whyThisSupports: "この根拠がクレームを支える理由",
      linkedGaps: "この根拠に紐づくギャップ",
      selectedGap: "選択中のギャップ",
      noLinkedGaps: "この根拠に紐づくギャップはありません",
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
      noClaims: "クレームは記録されていません",
      none: "なし",
    }
  }
  return {
    eyebrow: "Read-only claim flow board",
    claimFlow: "Claim Flow",
    flowNote: "Click a claim to read its evidence and real gaps; click evidence to see gaps linked to that evidence.",
    selectedClaim: "Selected claim",
    selectedEvidence: "Selected evidence",
    evidenceList: "Evidence",
    gap: "Gap",
    gaps: "Gaps",
    noEvidence: "No evidence bound",
    selectEvidencePrompt: "Select evidence or a gap to inspect details.",
    sourceTrace: "Source trace",
    evidenceSource: "Source",
    whyThisSupports: "Why this supports the claim",
    linkedGaps: "Gaps linked to evidence",
    selectedGap: "Selected gap",
    noLinkedGaps: "No gaps linked to this evidence.",
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
  const gapIds = new Set(map.researchGaps.map((gap) => gap.id))
  const relationByKey = new Map(map.claimRelations.map((relation) => [relationKey(relation), relation]))
  const claimCards = new Map<string, NarrativeDisplayClaimCard>()
  for (const card of input.claimCards ?? []) {
    if (!claimIds.has(card.claimId)) throw new Error(`Unknown display claimId: ${card.claimId}`)
    claimCards.set(card.claimId, cleanClaimCard(card))
  }

  const researchGapCards = new Map<string, NarrativeDisplayResearchGapCard>()
  for (const card of input.researchGapCards ?? []) {
    if (!gapIds.has(card.gapId)) throw new Error(`Unknown display gapId: ${card.gapId}`)
    researchGapCards.set(card.gapId, cleanResearchGapCard(card))
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
    researchGapCards,
    relations,
  }
}

export function emptyDisplayModel(language: NarrativeViewLanguage, labels = defaultNarrativeDisplayLabels(language)): ValidatedNarrativeDisplayModel {
  return { version: 1, language, labels, claimCards: new Map(), researchGapCards: new Map(), relations: new Map() }
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
    supportRationale: clean(card.supportRationale),
    supportedScope: clean(card.supportedScope),
    unsupportedScope: clean(card.unsupportedScope),
    objectionsSummary: clean(card.objectionsSummary),
    risksSummary: clean(card.risksSummary),
    riskOrGapSummary: clean(card.riskOrGapSummary),
    researchGapsSummary: clean(card.researchGapsSummary),
  }
}

function cleanResearchGapCard(card: NarrativeDisplayResearchGapCard): NarrativeDisplayResearchGapCard {
  return {
    gapId: card.gapId,
    displayQuestion: clean(card.displayQuestion),
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
