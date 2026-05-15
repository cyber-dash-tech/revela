import { mkdirSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { openUrl as defaultOpenUrl } from "../edit/open"
import { hasDecksState, readDecksState } from "../decks-state"
import { buildNarrativeMap, formatNarrativeMap } from "../narrative-state/map"
import { renderNarrativeMapHtmlWithDisplay } from "../narrative-state/map-html"
import { emptyDisplayModel, type NarrativeViewLanguage, type ValidatedNarrativeDisplayModel } from "../narrative-state/display"
import type { NarrativeApproval } from "../narrative-state/types"
import { compileNarrativeVault, formatVaultDiagnosticMarkdown, formatVaultDiagnosticReport, hasNarrativeVault } from "../narrative-vault"

export interface NarrativeArgs {
  language: NarrativeViewLanguage
  raw: boolean
}

export interface StoryArgs {
  language: NarrativeViewLanguage
}

export type ParseNarrativeArgsResult = { ok: true; args: NarrativeArgs } | { ok: false; error: string }
export type ParseStoryArgsResult = { ok: true; args: StoryArgs } | { ok: false; error: string }

export function parseStoryArgs(param: string): ParseStoryArgsResult {
  const tokens = param.trim().split(/\s+/).filter(Boolean)
  let language: NarrativeViewLanguage = "en"

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === "--language" || token === "-l") {
      const value = tokens[++i]
      if (!value) return { ok: false, error: "Usage: `/revela story [--language <language> | -l <language>]`" }
      language = normalizeLanguageRequest(value)
      continue
    }
    if (token.startsWith("--language=")) {
      return { ok: false, error: "Usage: `/revela story --language <language>` or `/revela story -l <language>`. Do not use `--language=<language>`." }
    }
    return { ok: false, error: "Usage: `/revela story [--language <language> | -l <language>]`." }
  }

  return { ok: true, args: { language } }
}

export function parseNarrativeArgs(param: string): ParseNarrativeArgsResult {
  const tokens = param.trim().split(/\s+/).filter(Boolean)
  let language: NarrativeViewLanguage = "en"
  let raw = false
  const languageParts: string[] = []
  for (const token of tokens) {
    const normalized = token.toLowerCase()
    if (normalized === "--raw") {
      raw = true
      continue
    }
    if (token.startsWith("--") && token.length > 2) {
      language = normalizeLanguageRequest(token.slice(2))
      continue
    }
    languageParts.push(token)
  }
  if (languageParts.length > 0) language = normalizeLanguageRequest(languageParts.join(" "))
  return { ok: true, args: { language, raw } }
}

function normalizeLanguageRequest(value: string): NarrativeViewLanguage {
  const trimmed = value.trim()
  const normalized = trimmed.toLowerCase()
  if (["en", "eng", "english"].includes(normalized)) return "en"
  if (["cn", "zh", "zh-cn", "chinese"].includes(normalized)) return "zh-CN"
  if (["jp", "ja", "ja-jp", "japanese"].includes(normalized)) return "ja-JP"
  return trimmed || "en"
}

export async function handleNarrative(
  options: { workspaceRoot: string; openBrowser?: boolean; openUrl?: (url: string) => void; language?: NarrativeViewLanguage; display?: ValidatedNarrativeDisplayModel },
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    if (!hasDecksState(options.workspaceRoot)) {
      await send("No `DECKS.json` found. Run `/revela init` first to initialize the narrative workspace.")
      return
    }

    const state = readDecksState(options.workspaceRoot)
    const map = buildNarrativeMap(state)
    const diagnosticsMarkdown = vaultDiagnosticsMarkdown(options.workspaceRoot, state.narrative?.approvals ?? [])
    const markdown = [diagnosticsMarkdown, formatNarrativeMap(map)].filter(Boolean).join("\n\n")

    if (options.openBrowser) {
      const htmlPath = writeNarrativeMapHtml(map, options.display ?? emptyDisplayModel(options.language ?? "en"))
      const url = `file://${htmlPath}`
      try {
        ;(options.openUrl ?? defaultOpenUrl)(url)
        await send(`Opened read-only narrative workspace: ${url}\n\n${markdown}`)
      } catch (e: any) {
        await send(`Read-only narrative workspace generated but could not open automatically: ${url}\n\n${e.message || String(e)}\n\n${markdown}`)
      }
      return
    }

    await send(markdown)
  } catch (e: any) {
    await send(`**Narrative map failed:** ${e.message || String(e)}`)
  }
}

function vaultDiagnosticsMarkdown(workspaceRoot: string, fallbackApprovals: NarrativeApproval[]): string {
  if (!hasNarrativeVault(workspaceRoot)) return ""
  const result = compileNarrativeVault(workspaceRoot, { fallbackApprovals })
  return formatVaultDiagnosticMarkdown(formatVaultDiagnosticReport(result.diagnostics))
}

export function buildNarrativeViewPrompt(options: { workspaceRoot: string; language: NarrativeViewLanguage }): string {
  if (!hasDecksState(options.workspaceRoot)) {
    return "No `DECKS.json` found. Tell the user to run `/revela init` before opening the narrative view. Do not call any tool."
  }

  const map = buildNarrativeMap(readDecksState(options.workspaceRoot))
  const projection = {
    narrativeHash: map.snapshot.narrativeHash,
    language: options.language,
    snapshot: map.snapshot,
    claims: map.claimFlow.map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      importance: claim.importance,
      evidenceStatus: claim.evidenceStatus,
      text: claim.text,
      supportedScope: claim.supportedScope,
      unsupportedScope: claim.unsupportedScope,
      evidence: claim.evidence.map((evidence) => ({ source: evidence.source, strength: evidence.strength, findingsFile: evidence.findingsFile, location: evidence.location, quote: evidence.quote, caveat: evidence.caveat, unsupportedScope: evidence.unsupportedScope })),
    })),
    relations: map.claimRelations.map((relation) => ({ id: relation.id, fromClaimId: relation.fromClaimId, toClaimId: relation.toClaimId, relation: relation.relation, rationale: relation.rationale, inferred: relation.inferred })),
    objections: map.objections.map((objection) => ({ id: objection.id, claimId: objection.claimId, priority: objection.priority, text: objection.text, response: objection.response })),
    risks: map.risks.map((risk) => ({ id: risk.id, claimId: risk.claimId, severity: risk.severity, text: risk.text, mitigation: risk.mitigation })),
    researchGaps: map.researchGaps.map((gap) => ({ id: gap.id, targetType: gap.targetType, targetId: gap.targetId, status: gap.status, priority: gap.priority, question: gap.question })),
    artifactCoverage: map.artifactCoverage.map((artifact) => ({ type: artifact.type, outputPath: artifact.outputPath, stale: artifact.stale, coverageStatus: artifact.coverageStatus, affectedClaimIds: artifact.affectedClaimIds, missingClaimIds: artifact.missingClaimIds, slideRefs: artifact.slideRefs.map((ref) => ({ claimId: ref.claimId, slideIndex: ref.slideIndex, role: ref.role, match: ref.match, location: ref.location })) })),
  }

  return `Prepare the read-only Revela narrative UI display model.

Target language request: ${options.language}
- The language value is passed from the user's /revela story arguments. Interpret it as the desired UI/display language.
- Examples: --cn maps to zh-CN, --jp maps to ja-JP, while --fr, --de, --es, --ko, --Arabic, --Portuguese-BR, or a written language name should be localized normally into that requested language.
- Default /revela story language is en when the user provides no language request.

You must call the \`revela-narrative-view\` tool exactly once.

Hard rules:
- Do not mutate DECKS.json, deck HTML, evidence, claims, relations, approvals, or artifacts.
- Do not invent new claims, evidence, relations, slide coverage, source paths, findings files, quotes, or caveats.
- Preserve every claimId exactly.
- Preserve every relation endpoint exactly: fromClaimId, toClaimId, relation.
- You may only organize and localize display copy for the UI: pageTitle, summaryLine, section labels, claim card displayTitle, roleLabel, narrativeJob, evidenceSummary, supportRationale, supportedScope, unsupportedScope, objectionsSummary, risksSummary, riskOrGapSummary, researchGapsSummary, relation displayLabel, and relation displayRationale.
- For inferred relations, do not provide relation displayLabel or displayRationale; inferred relations are unconfirmed order notes, not causal/support/dependency judgments.
- relation displayRationale may only localize or clarify an existing canonical relation rationale. If relation.rationale is missing or the relation is inferred, do not provide displayRationale; the UI will show the missing or inferred status.
- Keep source paths, findings files, claim IDs, narrative hash, and numbers unchanged.
- Translate normal UI/display text into the target language request: pageTitle, summaryLine, labels, claim displayTitle, roleLabel, narrativeJob, evidenceSummary, supportRationale, supportedScope, unsupportedScope, objectionsSummary, risksSummary, riskOrGapSummary, researchGapsSummary, relation displayLabel, and relation displayRationale.
- For every claim in a non-English target language, provide displayTitle so the selected-claim panel does not fall back to canonical English claim text.
- For every selected-claim detail field that has canonical user-facing text, provide the matching localized display field when it exists: supportedScope for supported scope, unsupportedScope for evidence boundaries, supportRationale for why the evidence supports the claim, objectionsSummary for objections, risksSummary for risks, and researchGapsSummary for research gaps.
- Do not translate claim IDs, relation endpoints, narrative hash, source paths, findings files, URLs, numbers, or quoted/source facts.
- Use natural business and manufacturing terminology in the target language, not word-by-word machine translation.
- If a fact is missing, describe it as missing instead of filling it in.

Chinese localization rules when the target language request is Chinese, zh, zh-CN, --cn, 中文, or Simplified Chinese:
- Use natural business/manufacturing Chinese, not word-by-word machine translation.
- In manufacturing, industrial AI, automation, and autonomous systems context, translate "autonomy" as "自主化", "自主能力", or "自主系统". Do not translate it as "自治".
- Translate "autonomous" as "自主的" / "自主化的" where appropriate, not "自治的".
- Translate "architectural" as "架构层面的", "架构性", or "架构问题" according to context.
- Slug-like or kebab-case claim text such as "autonomy-is-architectural" should become a readable displayTitle such as "自主化是架构问题" or "自主化必须作为架构问题处理", not a literal token-by-token translation.
- If the canonical claim text is only a slug, preserve the claimId exactly but write displayTitle as a readable claim title.

Call \`revela-narrative-view\` with:
- language: ${options.language}
- narrativeHash: ${map.snapshot.narrativeHash}
- displayModel.version: 1
- displayModel.language: ${options.language}
- displayModel.claimCards only for claim IDs listed below
- displayModel.relations only for relations listed below

Compact deterministic narrative map:

\`\`\`json
${JSON.stringify(projection, null, 2)}
\`\`\``
}

export function writeNarrativeMapHtml(map: ReturnType<typeof buildNarrativeMap>, display: ValidatedNarrativeDisplayModel = emptyDisplayModel("en")): string {
  const dir = join(tmpdir(), "revela-narrative")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${safeFilePart(map.snapshot.narrativeId)}-${map.snapshot.narrativeHash}.html`)
  writeFileSync(file, renderNarrativeMapHtmlWithDisplay(map, display), "utf-8")
  return file
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "narrative"
}
