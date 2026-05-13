import type { NarrativeMap, NarrativeMapClaim, NarrativeMapClaimRelation } from "./map"
import { emptyDisplayModel, isChineseLanguage, isJapaneseLanguage, relationKey, type ValidatedNarrativeDisplayModel } from "./display"

interface FlowNode {
  id: string
  claim: NarrativeMapClaim
  title: string
  displayCard?: ReturnType<ValidatedNarrativeDisplayModel["claimCards"]["get"]>
  detailHtml: string
}

export function renderNarrativeMapHtml(map: NarrativeMap, display?: ValidatedNarrativeDisplayModel): string {
  return renderNarrativeMapHtmlWithDisplay(map, display)
}

export function renderNarrativeMapHtmlWithDisplay(map: NarrativeMap, display: ValidatedNarrativeDisplayModel = emptyDisplayModel("en")): string {
  const title = `Revela Claim Flow - ${map.snapshot.narrativeHash}`
  const nodes = buildFlowNodes(map, display)
  const initial = nodes[0]
  const inferredCount = map.claimRelations.filter((relation) => relation.inferred).length
  const pageTitle = display.pageTitle ?? valueOrFallback(map.snapshot.thesis, map.snapshot.decisionAction || "Narrative claim flow")
  const summaryLine = display.summaryLine ?? "Claims are the main path. Evidence, risks, gaps, objections, and artifact coverage stay in the selected-claim panel."
  const nonCurrentArtifacts = map.artifactCoverage.filter((artifact) => artifact.coverageStatus !== "current").length
  return `<!doctype html>
<html lang="${escapeAttr(display.language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme:light; --bg:#f5f1e9; --paper:#fffdf8; --ink:#1c1917; --muted:#766d63; --line:#ded4c7; --accent:#d8612b; --good:#177044; --warn:#a56015; --bad:#a33434; --soft:#f7f0e7; --shadow:0 20px 54px rgba(54,43,31,.13); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at 12% 0,#fff7ed 0,transparent 26rem),radial-gradient(circle at 85% 10%,#edf4f0 0,transparent 24rem),var(--bg); color:var(--ink); }
    .shell { max-width:1440px; margin:0 auto; padding:22px; }
    .topbar { background:rgba(255,253,248,.9); border:1px solid var(--line); border-radius:24px; box-shadow:var(--shadow); padding:20px 22px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; align-items:start; }
    .eyebrow { margin:0; color:var(--accent); font-size:12px; font-weight:850; letter-spacing:.15em; text-transform:uppercase; }
    h1 { margin:7px 0 0; max-width:860px; font-size:clamp(24px,3.2vw,42px); line-height:1.02; letter-spacing:-.05em; }
    .summary { margin:10px 0 0; color:var(--muted); font-size:14px; line-height:1.45; max-width:920px; }
    .pills { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
    .pill { display:inline-flex; border-radius:999px; padding:7px 10px; font-size:12px; font-weight:780; border:1px solid var(--line); background:#fff; color:var(--muted); white-space:nowrap; }
    .pill.current,.pill.supported { color:var(--good); background:#e8f4ed; border-color:#b9dcc8; }
    .pill.stale,.pill.missing { color:var(--bad); background:#fbe7e7; border-color:#efb9b9; }
    .pill.partial,.pill.weak,.pill.open { color:var(--warn); background:#fff1dc; border-color:#edd0a5; }
    .layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,430px); gap:18px; margin-top:18px; align-items:start; }
    .flow,.detail-panel { background:rgba(255,253,248,.92); border:1px solid var(--line); border-radius:24px; box-shadow:var(--shadow); }
    .flow { padding:20px; }
    .workbench { margin-top:18px; background:rgba(255,253,248,.92); border:1px solid var(--line); border-radius:24px; box-shadow:var(--shadow); padding:18px 20px; }
    .workbench h2 { margin:0; font-size:18px; letter-spacing:-.025em; }
    .filter-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .filter-button { cursor:pointer; border:1px solid var(--line); border-radius:999px; background:#fff; color:var(--muted); padding:8px 11px; font-size:12px; font-weight:850; }
    .filter-button.active { border-color:var(--accent); color:var(--accent); background:#fff4ea; }
    .coverage-grid { margin-top:16px; display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; }
    .coverage-item { border:1px solid var(--line); border-radius:16px; background:#fff; padding:13px; }
    .coverage-item h3 { margin:0; font-size:14px; line-height:1.2; }
    .coverage-meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; }
    .coverage-detail { margin:9px 0 0; color:var(--muted); font-size:12px; line-height:1.45; }
    .coverage-detail strong { color:#51483f; }
    .flow-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; margin-bottom:18px; }
    .flow-head h2 { margin:0; font-size:18px; letter-spacing:-.025em; }
    .flow-note { margin:4px 0 0; color:var(--muted); font-size:13px; line-height:1.45; }
    .claim-list { display:flex; flex-direction:column; gap:0; }
    .claim-step { display:grid; grid-template-columns:42px minmax(0,1fr); gap:14px; }
    .step-rail { display:flex; flex-direction:column; align-items:center; }
    .step-dot { width:32px; height:32px; border-radius:999px; display:grid; place-items:center; background:#fff; border:1px solid var(--line); color:var(--muted); font-size:12px; font-weight:850; }
    .step-line { flex:1; width:2px; min-height:30px; background:linear-gradient(var(--line),rgba(222,212,199,.25)); margin:8px 0; }
    .claim-step:last-child .step-line { display:none; }
    .claim-card { width:100%; text-align:left; cursor:pointer; border:1px solid var(--line); border-left:6px solid var(--good); background:#fff; color:var(--ink); border-radius:18px; padding:15px 16px; margin-bottom:16px; box-shadow:0 10px 26px rgba(67,49,31,.08); transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease; }
    .claim-card:hover,.claim-card.active { border-color:var(--accent); box-shadow:0 14px 32px rgba(143,62,24,.15); transform:translateY(-1px); }
    .claim-card.partial,.claim-card.weak { border-left-color:var(--warn); }
    .claim-card.missing { border-left-color:var(--bad); }
    .claim-title { display:block; font-size:18px; font-weight:850; line-height:1.2; letter-spacing:-.018em; }
    .claim-meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
    .tag { display:inline-flex; border-radius:999px; padding:4px 8px; background:var(--soft); color:var(--muted); font-size:11px; font-weight:800; }
    .claim-sections { margin-top:13px; display:grid; gap:9px; }
    .claim-section { border-top:1px solid #eee4d8; padding-top:9px; }
    .section-label { display:block; margin-bottom:3px; color:var(--accent); font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .section-text { display:block; color:#51483f; font-size:13px; line-height:1.46; white-space:pre-line; }
    .next-actions { display:flex; flex-direction:column; gap:8px; }
    .next-action { border:1px solid #eee4d8; border-radius:12px; padding:9px; background:#fffaf3; }
    .next-action strong { display:block; color:#51483f; font-size:13px; }
    .next-action code { display:inline-block; margin-top:5px; color:#9c4d1d; font-size:12px; }
    .relation-strip { margin-top:12px; display:grid; gap:7px; }
    .relation { display:grid; grid-template-columns:auto minmax(0,1fr); gap:8px; align-items:flex-start; color:var(--muted); font-size:13px; line-height:1.35; }
    .relation-badge { flex:0 0 auto; border-radius:999px; padding:3px 7px; background:#fff4e8; color:#9c4d1d; border:1px solid #efcfb8; font-size:10px; font-weight:850; text-transform:uppercase; letter-spacing:.04em; }
    .relation-target { display:block; color:#51483f; font-weight:720; }
    .relation-note { display:block; margin-top:3px; color:var(--muted); }
    .relation.inferred .relation-badge { background:#f4f0ea; border-color:var(--line); color:var(--muted); }
    .detail-panel { position:sticky; top:18px; max-height:calc(100vh - 36px); overflow:hidden; display:flex; flex-direction:column; }
    .detail-head { padding:20px 20px 14px; border-bottom:1px solid var(--line); }
    .detail-title { margin:7px 0 0; font-size:22px; line-height:1.12; letter-spacing:-.035em; }
    .detail-sub { margin-top:8px; color:var(--muted); font-size:13px; line-height:1.4; }
    .detail-body { padding:16px 20px 22px; overflow:auto; }
    .detail-card { border:1px solid var(--line); border-radius:16px; padding:13px; background:#fff; margin-bottom:10px; }
    .detail-card h3 { margin:0 0 8px; font-size:13px; letter-spacing:-.01em; }
    .detail-card p { margin:0; color:var(--muted); line-height:1.45; font-size:13px; }
    .empty { color:var(--muted); font-style:italic; }
    .hidden-detail { display:none; }
    @media (max-width:1100px) { .layout { grid-template-columns:1fr; } .detail-panel { position:static; max-height:none; } .topbar { grid-template-columns:1fr; } .pills { justify-content:flex-start; } }
    @media (max-width:680px) { .shell { padding:12px; } .topbar,.flow,.detail-panel { border-radius:18px; } .claim-step { grid-template-columns:30px minmax(0,1fr); gap:10px; } .step-dot { width:26px; height:26px; font-size:11px; } .claim-title { font-size:16px; } }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">${escapeHtml(display.labels.eyebrow)}</p>
        <h1>${escapeHtml(pageTitle)}</h1>
        <p class="summary">${escapeHtml(summaryLine)}</p>
      </div>
      <div class="pills">
        <span class="pill ${escapeAttr(map.snapshot.approval)}">${escapeHtml(systemTerm("approval", display))}: ${escapeHtml(localizeValue(map.snapshot.approval, display))}</span>
        <span class="pill">${escapeHtml(display.labels.status)}: ${escapeHtml(localizeValue(map.snapshot.status, display))}</span>
        <span class="pill supported">${escapeHtml(systemTerm("claims", display))}: ${nodes.length}</span>
        <span class="pill ${inferredCount > 0 ? "open" : "current"}">${escapeHtml(systemTerm("relations", display))}: ${map.claimRelations.length}${inferredCount > 0 ? ` (${inferredCount} ${escapeHtml(systemTerm("inferred", display))})` : ""}</span>
        <span class="pill ${nonCurrentArtifacts > 0 ? "partial" : "current"}">${escapeHtml(systemTerm("artifacts", display))}: ${map.artifactCoverage.length}${nonCurrentArtifacts > 0 ? ` (${nonCurrentArtifacts} ${escapeHtml(systemTerm("attention", display))})` : ""}</span>
      </div>
    </header>
    <div class="layout">
      <section class="flow" aria-label="Narrative claim flow board">
        <div class="flow-head">
          <div>
            <h2>${escapeHtml(display.labels.claimFlow)}</h2>
            <p class="flow-note">${escapeHtml(display.labels.flowNote)}</p>
          </div>
        </div>
        <div class="claim-list">
          ${nodes.length ? nodes.map((node, index) => renderStep(node, map, display, index, index === 0)).join("") : emptyCard(display.labels.claimFlow, display.labels.noClaims)}
        </div>
      </section>
      <aside class="detail-panel">
        <div class="detail-head">
          <p class="eyebrow">${escapeHtml(display.labels.selectedClaim)}</p>
          <h2 class="detail-title" id="detail-title">${escapeHtml(initial?.title ?? display.labels.noClaims)}</h2>
          <div class="detail-sub" id="detail-sub">${escapeHtml(initial ? claimSubtitle(initial.claim, display) : "Run /revela init to create narrative claims.")}</div>
        </div>
        <div class="detail-body" id="detail-body">${initial?.detailHtml ?? emptyCard(display.labels.claimFlow, display.labels.noClaims)}</div>
      </aside>
    </div>
    ${renderWorkbench(map, display)}
  </main>
  <div class="hidden-detail">
    ${nodes.map((node) => `<template id="detail-${escapeAttr(node.id)}" data-title="${escapeHtml(node.title)}" data-subtitle="${escapeHtml(claimSubtitle(node.claim, display))}">${node.detailHtml}</template>`).join("")}
  </div>
  <script>
    const buttons = Array.from(document.querySelectorAll('.claim-card'));
    const filters = Array.from(document.querySelectorAll('.filter-button'));
    const title = document.getElementById('detail-title');
    const sub = document.getElementById('detail-sub');
    const body = document.getElementById('detail-body');
    function selectClaim(id) {
      const template = document.getElementById('detail-' + CSS.escape(id));
      if (!template) return;
      title.textContent = template.dataset.title || '';
      sub.textContent = template.dataset.subtitle || '';
      body.innerHTML = template.innerHTML;
      buttons.forEach((button) => button.classList.toggle('active', button.dataset.nodeId === id));
    }
    buttons.forEach((button) => button.addEventListener('click', () => selectClaim(button.dataset.nodeId)));
    filters.forEach((button) => button.addEventListener('click', () => {
      const filter = button.dataset.filterId || 'all';
      filters.forEach((item) => item.classList.toggle('active', item === button));
      buttons.forEach((claimButton) => {
        const flags = (claimButton.dataset.filters || '').split(' ');
        claimButton.closest('.claim-step').style.display = filter === 'all' || flags.includes(filter) ? '' : 'none';
      });
    }));
  </script>
</body>
</html>`
}

function buildFlowNodes(map: NarrativeMap, display: ValidatedNarrativeDisplayModel): FlowNode[] {
  return allClaims(map).map((claim) => ({
    id: nodeId(claim.id),
    claim,
    title: display.claimCards.get(claim.id)?.displayTitle ?? claim.text,
    displayCard: display.claimCards.get(claim.id),
    detailHtml: claimDetail(claim, map, display),
  }))
}

function renderStep(node: FlowNode, map: NarrativeMap, display: ValidatedNarrativeDisplayModel, index: number, active: boolean): string {
  const outgoing = map.claimRelations.filter((relation) => relation.fromClaimId === node.claim.id)
  return `<div class="claim-step">
    <div class="step-rail"><div class="step-dot">${index + 1}</div><div class="step-line"></div></div>
    <button class="claim-card ${escapeAttr(node.claim.evidenceStatus)}${active ? " active" : ""}" data-node-id="${escapeAttr(node.id)}" data-filters="${escapeHtml(node.claim.workbenchFlags.join(" "))}" type="button">
      <span class="claim-title">${escapeHtml(node.title)}</span>
      <span class="claim-meta"><span class="tag">${escapeHtml(localizeValue(node.claim.kind, display))}</span><span class="tag">${escapeHtml(localizeValue(node.claim.importance, display))}</span><span class="tag">${escapeHtml(localizeValue(node.claim.evidenceStatus, display))}</span><span class="tag">${escapeHtml(node.claim.id)}</span></span>
      ${renderDisplayCardSummary(node.displayCard, display)}
      ${outgoing.length ? `<span class="relation-strip">${outgoing.map((relation) => renderOutgoingRelation(relation, display)).join("")}</span>` : ""}
    </button>
  </div>`
}

function renderDisplayCardSummary(card: FlowNode["displayCard"], display: ValidatedNarrativeDisplayModel): string {
  if (!card) return ""
  const labels = sectionLabels(display)
  const rows: Array<[string, string | undefined]> = [
    [labels.role, card.roleLabel],
    [labels.narrativeJob, card.narrativeJob],
    [labels.evidenceSummary, card.evidenceSummary],
    [labels.riskOrGapSummary, card.riskOrGapSummary],
  ]
  if (rows.length === 0) return ""
  return `<span class="claim-sections">${rows.filter(([, value]) => Boolean(value)).map(([label, value]) => `<span class="claim-section"><span class="section-label">${escapeHtml(label)}</span><span class="section-text">${escapeHtml(value)}</span></span>`).join("")}</span>`
}

function renderOutgoingRelation(relation: NarrativeMapClaimRelation, display: ValidatedNarrativeDisplayModel): string {
  const label = relationDisplayLabel(relation, display, true)
  const target = displayClaimText(relation.toClaimId, relation.toClaimText, display)
  const rationale = relationDisplayRationale(relation, display)
  return `<span class="relation${relation.inferred ? " inferred" : ""}"><span class="relation-badge">${escapeHtml(label)}</span><span><span class="relation-target">${escapeHtml(systemTerm("to", display))}: ${escapeHtml(shorten(target, 120))}</span>${rationale ? `<span class="relation-note">${escapeHtml(systemTerm("rationale", display))}: ${escapeHtml(rationale)}</span>` : ""}</span></span>`
}

function claimDetail(claim: NarrativeMapClaim, map: NarrativeMap, display: ValidatedNarrativeDisplayModel): string {
  const incoming = map.claimRelations.filter((relation) => relation.toClaimId === claim.id)
  const outgoing = map.claimRelations.filter((relation) => relation.fromClaimId === claim.id)
  const objections = map.objections.filter((item) => item.claimId === claim.id)
  const risks = map.risks.filter((item) => item.claimId === claim.id)
  const gaps = map.researchGaps.filter((item) => item.targetType === "claim" && item.targetId === claim.id)
  const slideRefs = map.artifactCoverage.flatMap((artifact) => artifact.slideRefs.filter((ref) => ref.claimId === claim.id).map((ref) => `${artifact.type} slide ${ref.slideIndex} (${ref.role}, ${ref.match}/${ref.location}, coverage:${artifact.coverageStatus})`))
  const coverageGaps = map.artifactCoverage.filter((artifact) => artifact.missingClaimIds.includes(claim.id) || artifact.affectedClaimIds.includes(claim.id))
  const card = display.claimCards.get(claim.id)
  return detailCards([
    [display.labels.claim, claim.text],
    ...(card?.narrativeJob ? [[card.roleLabel || display.labels.claim, card.narrativeJob] as [string, string]] : []),
    ...(card?.evidenceSummary ? [[display.labels.evidence, card.evidenceSummary] as [string, string]] : []),
    ...(card?.riskOrGapSummary ? [[display.labels.researchGaps, card.riskOrGapSummary] as [string, string]] : []),
    [display.labels.claimId, claim.id],
    [display.labels.status, `${localizeValue(claim.evidenceStatus, display)} / ${localizeValue(claim.importance, display)} / ${localizeValue(claim.kind, display)}`],
    ...(claim.supportedScope ? [[display.labels.supportedScope, claim.supportedScope] as [string, string]] : []),
    ...(claim.unsupportedScope ? [[display.labels.unsupportedScope, claim.unsupportedScope] as [string, string]] : []),
    [display.labels.incomingRelations, incoming.length ? incoming.map((relation) => relationText(relation, display)).join("<br><br>") : display.labels.none],
    [display.labels.outgoingRelations, outgoing.length ? outgoing.map((relation) => relationText(relation, display)).join("<br><br>") : display.labels.none],
    ...(claim.evidence.length ? claim.evidence.map((evidence) => [`${display.labels.evidence}: ${evidence.source}`, evidenceDetailText(evidence, display)] as [string, string]) : [[display.labels.evidence, display.labels.none] as [string, string]]),
    ...(objections.length ? [[display.labels.objections, objections.map((item) => `${item.text}${item.response ? ` -> ${item.response}` : ""}`).join("<br>")] as [string, string]] : []),
    ...(risks.length ? [[display.labels.risks, risks.map((item) => `${item.text}${item.mitigation ? ` -> ${item.mitigation}` : ""}`).join("<br>")] as [string, string]] : []),
    ...(gaps.length ? [[display.labels.researchGaps, gaps.map((item) => `${item.question} [${item.status}/${item.priority}]`).join("<br>")] as [string, string]] : []),
    ...(slideRefs.length ? [[display.labels.coveredSlides, slideRefs.map((ref) => localizeSlideRef(ref, display)).join("<br>")] as [string, string]] : []),
    ...(coverageGaps.length ? [[systemTerm("artifactCoverage", display), coverageGaps.map((artifact) => `${artifact.type}: ${artifact.coverageStatus}${artifact.staleReasons.length ? ` - ${artifact.staleReasons.join("; ")}` : ""}`).join("<br>")] as [string, string]] : []),
    ...(claim.nextActions.length ? [[systemTerm("nextActions", display), renderNextActions(claim, display), true] as [string, string, boolean]] : []),
  ])
}

function renderWorkbench(map: NarrativeMap, display: ValidatedNarrativeDisplayModel): string {
  return `<section class="workbench" aria-label="Story workbench">
    <h2>${escapeHtml(systemTerm("storyWorkbench", display))}</h2>
    <p class="flow-note">${escapeHtml(workbenchNote(display))}</p>
    <div class="filter-row" aria-label="Story filters">
      ${map.workbench.filters.map((filter, index) => `<button type="button" class="filter-button${index === 0 ? " active" : ""}" data-filter-id="${escapeAttr(filter.id)}">${escapeHtml(localizeFilter(filter.label, display))} (${filter.count})</button>`).join("")}
    </div>
    <div class="coverage-grid">
      ${map.workbench.artifactCoverage.length ? map.workbench.artifactCoverage.map((item) => renderCoverageItem(item, display)).join("") : renderNoRenderTargetCard(map, display)}
    </div>
  </section>`
}

function renderNoRenderTargetCard(map: NarrativeMap, display: ValidatedNarrativeDisplayModel): string {
  const action = map.workbench.renderTargetAction
  if (!action) return emptyCard(systemTerm("artifactCoverage", display), systemTerm("noRenderTargets", display))
  return `<article class="coverage-item">
    <h3>${escapeHtml(systemTerm("artifactCoverage", display))}</h3>
    <p class="coverage-detail">${escapeHtml(systemTerm("noRenderTargets", display))}</p>
    <p class="coverage-detail"><strong>${escapeHtml(systemTerm("notes", display))}:</strong> ${escapeHtml(localizeAction(action.label, display))} - ${escapeHtml(action.reason)}</p>
    <p class="coverage-detail"><strong>${escapeHtml(systemTerm("recommendedNextCommand", display))}:</strong> <code>${escapeHtml(action.command)}</code></p>
  </article>`
}

function renderCoverageItem(item: NarrativeMap["workbench"]["artifactCoverage"][number], display: ValidatedNarrativeDisplayModel): string {
  const title = item.outputPath ?? item.artifactId
  const slides = item.affectedSlides.map((slide) => `${localizeSlideRef(`slide ${slide.slideIndex}`, display)}: ${slide.slideTitle} (${slide.claimId}, ${slide.role}/${slide.location})`).join("<br>")
  return `<article class="coverage-item">
    <h3>${escapeHtml(title)}</h3>
    <div class="coverage-meta"><span class="pill ${escapeAttr(item.coverageStatus)}">${escapeHtml(localizeValue(item.coverageStatus, display))}</span><span class="tag">${escapeHtml(item.type)}</span>${item.contractStatus ? `<span class="tag">${escapeHtml(item.contractStatus)}</span>` : ""}</div>
    <p class="coverage-detail"><strong>${escapeHtml(systemTerm("missingClaims", display))}:</strong> ${escapeHtml(item.missingClaimIds.join(", ") || systemTerm("none", display))}</p>
    <p class="coverage-detail"><strong>${escapeHtml(systemTerm("affectedClaims", display))}:</strong> ${escapeHtml(item.affectedClaimIds.join(", ") || systemTerm("none", display))}</p>
    <p class="coverage-detail"><strong>${escapeHtml(systemTerm("affectedSlides", display))}:</strong> ${slides ? allowBreaks(slides) : escapeHtml(systemTerm("none", display))}</p>
    <p class="coverage-detail"><strong>${escapeHtml(systemTerm("notes", display))}:</strong> ${escapeHtml(item.staleReasons.join("; ") || systemTerm("none", display))}</p>
    <p class="coverage-detail"><strong>${escapeHtml(systemTerm("recommendedNextCommand", display))}:</strong> <code>${escapeHtml(item.recommendedNextCommand)}</code></p>
  </article>`
}

function renderNextActions(claim: NarrativeMapClaim, display: ValidatedNarrativeDisplayModel): string {
  return `<span class="next-actions">${claim.nextActions.map((action) => `<span class="next-action"><strong>${escapeHtml(localizeAction(action.label, display))}</strong>${escapeHtml(action.reason)}<br><code>${escapeHtml(action.command)}</code></span>`).join("")}</span>`
}

function relationText(relation: NarrativeMapClaimRelation, display: ValidatedNarrativeDisplayModel): string {
  const from = displayClaimText(relation.fromClaimId, relation.fromClaimText, display)
  const to = displayClaimText(relation.toClaimId, relation.toClaimText, display)
  const label = relationDisplayLabel(relation, display, false)
  const rationale = relationDisplayRationale(relation, display)
  return `${systemTerm("relation", display)}: ${label}${relation.inferred ? ` (${systemTerm("inferred", display)})` : ""}<br>${systemTerm("from", display)}: ${from}<br>${systemTerm("to", display)}: ${to}${rationale ? `<br>${systemTerm("rationale", display)}: ${rationale}` : ""}`
}

function displayClaimText(claimId: string, fallback: string | undefined, display: ValidatedNarrativeDisplayModel): string {
  return display.claimCards.get(claimId)?.displayTitle ?? fallback ?? claimId
}

function relationDisplayLabel(relation: NarrativeMapClaimRelation, display: ValidatedNarrativeDisplayModel, _includeInferred: boolean): string {
  if (relation.inferred) return inferredRelationLabel(display)
  const label = display.relations.get(relationKey(relation))?.displayLabel ?? localizeValue(relation.relation, display)
  return label
}

function relationDisplayRationale(relation: NarrativeMapClaimRelation, display: ValidatedNarrativeDisplayModel): string | undefined {
  const displayRationale = display.relations.get(relationKey(relation))?.displayRationale
  if (displayRationale) return displayRationale
  if (relation.inferred) return inferredRationale(display)
  return relation.rationale ?? missingRationale(display)
}

function inferredRationale(display: ValidatedNarrativeDisplayModel): string {
  if (isChineseLanguage(display.language)) return "仅表示两个主张在当前叙事顺序中相邻；系统未判断因果、支撑或依赖关系。需要在 claimRelations 中写入客观 rationale 后才算确认。"
  if (isJapaneseLanguage(display.language)) return "現在のナラティブ順序で隣接していることだけを示します。因果、裏付け、依存関係は判断していません。確認するには claimRelations に客観的な rationale を記録してください。"
  return "Only indicates that the two claims are adjacent in the current narrative order; the system has not judged causality, support, or dependency. Record objective rationale in claimRelations to confirm it."
}

function inferredRelationLabel(display: ValidatedNarrativeDisplayModel): string {
  if (isChineseLanguage(display.language)) return "未确认顺序提示"
  if (isJapaneseLanguage(display.language)) return "未確認の順序メモ"
  return "unconfirmed order note"
}

function missingRationale(display: ValidatedNarrativeDisplayModel): string {
  if (isChineseLanguage(display.language)) return "因果依据未记录。"
  if (isJapaneseLanguage(display.language)) return "因果関係の根拠は記録されていません。"
  return "Causal rationale is not recorded."
}

function detailCards(rows: Array<[string, string] | [string, string, boolean]>): string {
  return rows.map(([label, value, raw]) => `<div class="detail-card"><h3>${escapeHtml(label)}</h3><p>${raw ? value : allowBreaks(value)}</p></div>`).join("")
}

function emptyCard(label: string, value: string): string {
  return `<div class="detail-card"><h3>${escapeHtml(label)}</h3><p class="empty">${escapeHtml(value)}</p></div>`
}

function evidenceDetailText(evidence: NarrativeMapClaim["evidence"][number], display: ValidatedNarrativeDisplayModel): string {
  return [
    `${systemTerm("strength", display)}: ${localizeValue(evidence.strength, display)}`,
    evidence.findingsFile ? `${systemTerm("findingsFile", display)}: ${evidence.findingsFile}` : "",
    evidence.location ? `${systemTerm("location", display)}: ${evidence.location}` : "",
    evidence.quote ? `${systemTerm("quote", display)}: ${evidence.quote}` : "",
    evidence.unsupportedScope ? `${display.labels.unsupportedScope}: ${evidence.unsupportedScope}` : "",
    evidence.caveat ? `${systemTerm("caveat", display)}: ${evidence.caveat}` : "",
  ].filter(Boolean).join(" | ")
}

function allClaims(map: NarrativeMap): NarrativeMapClaim[] {
  return map.claimFlow.length > 0 ? map.claimFlow : map.claims.supported.concat(map.claims.partial, map.claims.weak, map.claims.missing, map.claims.not_required)
}

function claimSubtitle(claim: NarrativeMapClaim, display: ValidatedNarrativeDisplayModel): string {
  return `${localizeValue(claim.kind, display)} / ${localizeValue(claim.importance, display)} / ${localizeValue(claim.evidenceStatus, display)}`
}

function sectionLabels(display: ValidatedNarrativeDisplayModel): Record<string, string> {
  if (isChineseLanguage(display.language)) return { role: "角色", narrativeJob: "叙事任务", evidenceSummary: "证据摘要", riskOrGapSummary: "风险/缺口" }
  if (isJapaneseLanguage(display.language)) return { role: "役割", narrativeJob: "ナラティブ上の役割", evidenceSummary: "根拠の要約", riskOrGapSummary: "リスク/ギャップ" }
  return { role: "Role", narrativeJob: "Narrative job", evidenceSummary: "Evidence summary", riskOrGapSummary: "Risk / gap" }
}

function workbenchNote(display: ValidatedNarrativeDisplayModel): string {
  return display.labels.workbenchNote
}

function localizeFilter(value: string, display: ValidatedNarrativeDisplayModel): string {
  const zh: Record<string, string> = { "All claims": "全部主张", "Missing evidence": "证据缺失", "Partial evidence": "部分证据", "Stale artifacts": "过期产物", "Open gaps": "开放缺口", Risks: "风险", "High-priority objections": "高优先级异议" }
  const ja: Record<string, string> = { "All claims": "すべてのクレーム", "Missing evidence": "根拠不足", "Partial evidence": "一部根拠", "Stale artifacts": "古い成果物", "Open gaps": "未解決ギャップ", Risks: "リスク", "High-priority objections": "高優先度の反論" }
  const table = isChineseLanguage(display.language) ? zh : isJapaneseLanguage(display.language) ? ja : {}
  return table[value] ?? value
}

function localizeAction(value: string, display: ValidatedNarrativeDisplayModel): string {
  const zh: Record<string, string> = { "Research this gap": "研究这个缺口", "Attach findings": "附加研究发现", "Narrow claim": "收窄主张", "Approve narrative": "批准叙事", "Make deck": "制作 deck", "Remake stale artifact": "重新生成过期产物" }
  const ja: Record<string, string> = { "Research this gap": "このギャップを調査", "Attach findings": "調査結果を紐付け", "Narrow claim": "クレームを絞る", "Approve narrative": "ナラティブを承認", "Make deck": "デッキを作成", "Remake stale artifact": "古い成果物を再生成" }
  const table = isChineseLanguage(display.language) ? zh : isJapaneseLanguage(display.language) ? ja : {}
  return table[value] ?? value
}

function systemTerm(term: string, display: ValidatedNarrativeDisplayModel): string {
  const zh: Record<string, string> = { approval: "审批", claims: "主张", relations: "关系", inferred: "未确认", relation: "关系", from: "来自", to: "指向", rationale: "说明", strength: "强度", findingsFile: "研究文件", location: "位置", quote: "引用", caveat: "注意事项", artifacts: "产物", attention: "需关注", artifactCoverage: display.labels.artifactCoverage, storyWorkbench: display.labels.storyWorkbench, noRenderTargets: display.labels.noRenderTargets, nextActions: display.labels.nextActions, missingClaims: display.labels.missingClaims, affectedClaims: display.labels.affectedClaims, affectedSlides: display.labels.affectedSlides, notes: display.labels.notes, recommendedNextCommand: display.labels.recommendedNextCommand, none: display.labels.none }
  const ja: Record<string, string> = { approval: "承認", claims: "クレーム", relations: "関係", inferred: "未確認", relation: "関係", from: "起点", to: "終点", rationale: "理由", strength: "強度", findingsFile: "調査ファイル", location: "場所", quote: "引用", caveat: "留意点", artifacts: "成果物", attention: "要確認", artifactCoverage: display.labels.artifactCoverage, storyWorkbench: display.labels.storyWorkbench, noRenderTargets: display.labels.noRenderTargets, nextActions: display.labels.nextActions, missingClaims: display.labels.missingClaims, affectedClaims: display.labels.affectedClaims, affectedSlides: display.labels.affectedSlides, notes: display.labels.notes, recommendedNextCommand: display.labels.recommendedNextCommand, none: display.labels.none }
  const en: Record<string, string> = { approval: "approval", claims: "claims", relations: "relations", inferred: "unconfirmed", relation: "relation", from: "from", to: "to", rationale: "rationale", strength: "strength", findingsFile: "findings file", location: "location", quote: "quote", caveat: "caveat", artifacts: "artifacts", attention: "need attention", artifactCoverage: display.labels.artifactCoverage, storyWorkbench: display.labels.storyWorkbench, noRenderTargets: display.labels.noRenderTargets, nextActions: display.labels.nextActions, missingClaims: display.labels.missingClaims, affectedClaims: display.labels.affectedClaims, affectedSlides: display.labels.affectedSlides, notes: display.labels.notes, recommendedNextCommand: display.labels.recommendedNextCommand, none: display.labels.none }
  return (isChineseLanguage(display.language) ? zh : isJapaneseLanguage(display.language) ? ja : en)[term] ?? term
}

function localizeValue(value: string, display: ValidatedNarrativeDisplayModel): string {
  const zh: Record<string, string> = {
    current: "当前", stale: "已过期", missing: "缺失", approved: "已批准", ready_for_approval: "待批准", needs_research: "需要研究", needs_user_confirmation: "需要用户确认", blocked: "受阻", draft: "草稿",
    supported: "已支持", partial: "部分支持", weak: "弱支持", not_required: "无需证据", central: "核心", supporting: "支撑", background: "背景",
    context: "背景", problem: "问题", opportunity: "机会", evidence: "证据", recommendation: "建议", risk: "风险", assumption: "假设", ask: "请求",
    leads_to: "推进到", supports: "支持", depends_on: "依赖", contrasts_with: "对比", constrains: "约束", answers: "回应", strong: "强", medium: "中", low: "低",
  }
  const ja: Record<string, string> = {
    current: "現行", stale: "古い", missing: "不足", approved: "承認済み", ready_for_approval: "承認待ち", needs_research: "調査が必要", needs_user_confirmation: "ユーザー確認が必要", blocked: "ブロック", draft: "下書き",
    supported: "裏付けあり", partial: "一部裏付け", weak: "弱い裏付け", not_required: "根拠不要", central: "中心", supporting: "補助", background: "背景",
    context: "文脈", problem: "課題", opportunity: "機会", evidence: "根拠", recommendation: "提案", risk: "リスク", assumption: "仮定", ask: "依頼",
    leads_to: "つながる", supports: "支える", depends_on: "依存", contrasts_with: "対比", constrains: "制約", answers: "答える", strong: "強", medium: "中", low: "低",
  }
  const table = isChineseLanguage(display.language) ? zh : isJapaneseLanguage(display.language) ? ja : {}
  return table[value] ?? value
}

function localizeSlideRef(value: string, display: ValidatedNarrativeDisplayModel): string {
  if (isChineseLanguage(display.language)) return value.replace(/slide/g, "页面")
  if (isJapaneseLanguage(display.language)) return value.replace(/slide/g, "スライド")
  return value
}

function nodeId(id: string): string {
  return `claim-${id}`.replace(/[^a-zA-Z0-9._-]+/g, "-")
}

function shorten(value: string | undefined, max: number): string {
  const text = valueOrFallback(value, "-")
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function valueOrFallback(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

function allowBreaks(value: string): string {
  return escapeHtml(value).replace(/&lt;br&gt;/g, "<br>")
}

function escapeHtml(value: string | undefined): string {
  return (value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch] ?? ch))
}

function escapeAttr(value: string | undefined): string {
  return escapeHtml(value).replace(/[^a-zA-Z0-9_-]/g, "_")
}
