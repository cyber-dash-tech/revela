import type { NarrativeMap, NarrativeMapClaim, NarrativeMapClaimRelation, NarrativeMapResearchGap } from "./map"
import { emptyDisplayModel, isChineseLanguage, isJapaneseLanguage, relationKey, type ValidatedNarrativeDisplayModel } from "./display"

interface FlowNode {
  id: string
  claim: NarrativeMapClaim
  title: string
  displayCard?: ReturnType<ValidatedNarrativeDisplayModel["claimCards"]["get"]>
  claimHtml: string
  claimPanelTitle: string
  claimPanelSubtitle: string
  initialDetailId?: string
  initialDetailHtml: string
  initialDetailTitle: string
  initialDetailSubtitle: string
  detailTemplates: string
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
  const summaryLine = display.summaryLine ?? "Select a claim to read its evidence and gaps. Evidence cards show what the source says, why it supports the claim, and where it came from."
  return `<!doctype html>
<html lang="${escapeAttr(display.language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme:light; --bg:#f5f1e9; --paper:#fffdf8; --ink:#1c1917; --muted:#766d63; --line:#ded4c7; --accent:#d8612b; --good:#177044; --warn:#a56015; --bad:#a33434; --gap:#6d4aa2; --soft:#f7f0e7; --shadow:0 20px 54px rgba(54,43,31,.13); --reading-font:"EB Garamond","Cormorant Garamond",Garamond,Georgia,serif; --ui-font:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-family:var(--reading-font); }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at 12% 0,#fff7ed 0,transparent 26rem),radial-gradient(circle at 85% 10%,#edf4f0 0,transparent 24rem),var(--bg); color:var(--ink); }
    .shell { max-width:1440px; margin:0 auto; padding:22px; }
    .topbar { background:rgba(255,253,248,.9); border:1px solid var(--line); border-radius:24px; box-shadow:var(--shadow); padding:20px 22px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; align-items:start; }
    .eyebrow { margin:0; color:var(--accent); font-family:var(--ui-font); font-size:12px; font-weight:850; letter-spacing:.15em; text-transform:uppercase; }
    h1 { margin:7px 0 0; max-width:860px; font-size:clamp(24px,3.2vw,42px); line-height:1.02; letter-spacing:-.05em; }
    .summary { margin:10px 0 0; color:var(--muted); font-size:17px; line-height:1.45; max-width:920px; }
    .pills { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
    .pill { display:inline-flex; border-radius:999px; padding:7px 10px; font-family:var(--ui-font); font-size:12px; font-weight:780; border:1px solid var(--line); background:#fff; color:var(--muted); white-space:nowrap; }
    .pill.current,.pill.supported { color:var(--good); background:#e8f4ed; border-color:#b9dcc8; }
    .pill.stale,.pill.missing { color:var(--bad); background:#fbe7e7; border-color:#efb9b9; }
    .pill.partial,.pill.weak,.pill.open { color:var(--warn); background:#fff1dc; border-color:#edd0a5; }
    .layout { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; margin-top:18px; align-items:start; }
    .flow,.claim-panel,.detail-panel { background:rgba(255,253,248,.92); border:1px solid var(--line); border-radius:24px; box-shadow:var(--shadow); }
    .flow { padding:20px; }
    .flow-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; margin-bottom:18px; }
    .flow-head h2 { margin:0; font-size:18px; letter-spacing:-.025em; }
    .flow-note { margin:4px 0 0; color:var(--muted); font-size:15px; line-height:1.45; }
    .claim-list { display:flex; flex-direction:column; gap:0; }
    .claim-step { display:grid; grid-template-columns:42px minmax(0,1fr); gap:14px; }
    .step-rail { display:flex; flex-direction:column; align-items:center; }
    .step-dot { width:32px; height:32px; border-radius:999px; display:grid; place-items:center; background:#fff; border:1px solid var(--line); color:var(--muted); font-size:12px; font-weight:850; }
    .step-line { flex:1; width:2px; min-height:30px; background:linear-gradient(var(--line),rgba(222,212,199,.25)); margin:8px 0; }
    .claim-step:last-child .step-line { display:none; }
    .claim-card { width:100%; min-width:0; text-align:left; cursor:pointer; border:0; border-left:6px solid var(--good); background:transparent; color:var(--ink); border-radius:0; padding:15px 16px; margin-bottom:16px; box-shadow:none; font-family:var(--reading-font); transition:none; }
    .claim-card:hover .claim-title,.claim-card.active .claim-title { color:var(--accent); }
    .claim-card.supported { border-left-color:var(--good); }
    .claim-card.partial,.claim-card.weak { border-left-color:var(--warn); }
    .claim-card.missing { border-left-color:var(--bad); }
    .claim-card.not_required { border-left-color:var(--line); }
    .claim-title { display:block; min-width:0; font-size:20px; font-weight:850; line-height:1.18; letter-spacing:-.018em; overflow-wrap:anywhere; }
    .claim-meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; min-width:0; }
    .tag { display:inline-flex; min-width:0; max-width:100%; border-radius:999px; padding:4px 8px; background:var(--soft); color:var(--muted); font-family:var(--ui-font); font-size:11px; font-weight:800; white-space:normal; overflow-wrap:anywhere; word-break:break-word; }
    .claim-sections { margin-top:13px; display:grid; gap:9px; }
    .claim-section { border-top:1px solid #eee4d8; padding-top:9px; }
    .section-label { display:block; margin-bottom:3px; color:var(--accent); font-family:var(--ui-font); font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .section-text { display:block; min-width:0; color:#51483f; font-family:var(--reading-font); font-size:15px; line-height:1.46; white-space:pre-line; overflow-wrap:anywhere; }
    .relation-strip { margin-top:12px; display:grid; gap:7px; }
    .relation { display:grid; grid-template-columns:1fr; gap:6px; align-items:flex-start; color:var(--muted); font-size:14px; line-height:1.35; min-width:0; }
    .relation-badge { width:fit-content; max-width:100%; border-radius:999px; padding:3px 7px; background:#fff4e8; color:#9c4d1d; border:1px solid #efcfb8; font-family:var(--ui-font); font-size:10px; font-weight:850; letter-spacing:.04em; white-space:normal; overflow-wrap:anywhere; }
    .relation-target { display:block; color:#51483f; font-weight:720; overflow-wrap:anywhere; }
    .relation-note { display:block; margin-top:3px; color:var(--muted); overflow-wrap:anywhere; }
    .relation.inferred .relation-badge { background:#f4f0ea; border-color:var(--line); color:var(--muted); }
    .claim-panel,.detail-panel { position:sticky; top:18px; max-height:calc(100vh - 36px); overflow:hidden; display:flex; flex-direction:column; }
    .detail-head { padding:20px 20px 14px; border-bottom:1px solid var(--line); }
    .detail-title { margin:7px 0 0; font-size:24px; line-height:1.12; letter-spacing:-.035em; }
    .detail-sub { margin-top:8px; color:var(--muted); font-size:15px; line-height:1.4; }
    .detail-body { padding:16px 20px 22px; overflow:auto; }
    .detail-card { min-width:0; border:0; border-left:5px solid var(--line); border-radius:0; padding:13px; background:transparent; margin-bottom:10px; box-shadow:none; font-family:var(--reading-font); }
    .detail-card h3 { margin:0 0 8px; font-family:var(--ui-font); font-size:13px; letter-spacing:-.01em; }
    .detail-card p { margin:0; color:var(--muted); font-family:var(--reading-font); line-height:1.45; font-size:15px; overflow-wrap:anywhere; }
    .evidence-list { display:grid; gap:10px; min-width:0; }
    .evidence-group-title { margin:12px 0 7px; color:var(--accent); font-family:var(--ui-font); font-size:11px; font-weight:900; letter-spacing:.09em; text-transform:uppercase; }
    .evidence-item { width:100%; min-width:0; text-align:left; cursor:pointer; border:0; border-left:5px solid var(--good); border-radius:0; background:transparent; padding:14px; color:var(--ink); box-shadow:none; font-family:var(--reading-font); overflow-wrap:anywhere; word-break:break-word; transition:none; }
    .evidence-item:hover .evidence-title,.evidence-item.active .evidence-title,.evidence-item:hover .evidence-source,.evidence-item.active .evidence-source { color:var(--accent); }
    .evidence-item.strong { border-left-color:var(--good); }
    .evidence-item.partial,.evidence-item.weak { border-left-color:var(--warn); }
    .evidence-item.gap { border-left-color:var(--gap); background:transparent; }
    .evidence-kind { display:inline-flex; width:fit-content; margin-bottom:9px; border-radius:999px; padding:3px 8px; font-family:var(--ui-font); font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; background:#e8f4ed; color:var(--good); }
    .evidence-item.partial .evidence-kind,.evidence-item.weak .evidence-kind { background:#fff1dc; color:var(--warn); }
    .evidence-item.gap .evidence-kind { background:#eee6ff; color:var(--gap); }
    .evidence-title { display:block; min-width:0; font-family:var(--reading-font); font-size:20px; font-weight:850; line-height:1.18; letter-spacing:-.012em; overflow-wrap:anywhere; word-break:break-word; }
    .evidence-source { display:block; min-width:0; font-family:var(--reading-font); font-size:20px; font-weight:850; line-height:1.18; letter-spacing:-.012em; overflow-wrap:anywhere; word-break:break-word; }
    .evidence-preview { display:block; margin-top:7px; color:var(--muted); font-size:15px; line-height:1.4; }
    .evidence-field { display:block; min-width:0; margin-top:12px; }
    .evidence-field-title { display:block; margin:0 0 4px; color:var(--accent); font-family:var(--ui-font); font-size:11px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }
    .evidence-bullets { min-width:0; margin:10px 0 0; padding-left:18px; color:#51483f; font-family:var(--reading-font); font-size:15px; line-height:1.45; overflow-wrap:anywhere; word-break:break-word; }
    .evidence-bullets li { margin:5px 0; }
    .evidence-bullets strong { color:var(--accent); font-family:var(--ui-font); font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .evidence-why { display:block; margin-top:10px; padding-top:10px; border-top:1px solid #eee4d8; color:#51483f; font-size:15px; line-height:1.43; }
    .evidence-why-label,.evidence-source-label { display:block; margin-bottom:3px; color:var(--accent); font-family:var(--ui-font); font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .evidence-source-line { display:block; margin-top:10px; color:var(--muted); font-family:var(--ui-font); font-size:12px; line-height:1.35; overflow-wrap:anywhere; }
    .evidence-meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; min-width:0; }
    .empty { color:var(--muted); font-style:italic; }
    .hidden-detail { display:none; }
    @media (max-width:1180px) { .layout { grid-template-columns:1fr; } .claim-panel,.detail-panel { position:static; max-height:none; } .topbar { grid-template-columns:1fr; } .pills { justify-content:flex-start; } }
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
      <aside class="claim-panel selected-claim">
        <div class="detail-head">
          <p class="eyebrow">${escapeHtml(display.labels.selectedClaim)}</p>
          <h2 class="detail-title" id="detail-title">${escapeHtml(initial?.claimPanelTitle ?? display.labels.noClaims)}</h2>
          <div class="detail-sub" id="detail-sub">${escapeHtml(initial?.claimPanelSubtitle ?? "Run /revela init to create narrative claims.")}</div>
        </div>
        <div class="detail-body" id="claim-body">${initial?.claimHtml ?? emptyCard(display.labels.claimFlow, display.labels.noClaims)}</div>
      </aside>
      <aside class="detail-panel selected-evidence">
        <div class="detail-head">
          <p class="eyebrow">${escapeHtml(display.labels.selectedEvidence)}</p>
          <h2 class="detail-title" id="evidence-title">${escapeHtml(initial?.initialDetailTitle ?? display.labels.selectedEvidence)}</h2>
          <div class="detail-sub" id="evidence-sub">${escapeHtml(initial?.initialDetailSubtitle ?? display.labels.selectEvidencePrompt)}</div>
        </div>
        <div class="detail-body" id="evidence-body">${initial?.initialDetailHtml ?? emptyCard(display.labels.selectedEvidence, display.labels.selectEvidencePrompt)}</div>
      </aside>
    </div>
  </main>
  <div class="hidden-detail">
    ${nodes.map((node) => `<template id="claim-panel-${escapeAttr(node.id)}" data-title="${escapeHtml(node.claimPanelTitle)}" data-subtitle="${escapeHtml(node.claimPanelSubtitle)}" data-initial-detail-id="${escapeAttr(node.initialDetailId ?? "")}">${node.claimHtml}</template>${node.detailTemplates}`).join("")}
  </div>
  <script>
    const buttons = Array.from(document.querySelectorAll('.claim-card'));
    const title = document.getElementById('detail-title');
    const sub = document.getElementById('detail-sub');
    const claimBody = document.getElementById('claim-body');
    const evidenceTitle = document.getElementById('evidence-title');
    const evidenceSub = document.getElementById('evidence-sub');
    const evidenceBody = document.getElementById('evidence-body');
    function bindEvidenceItems() {
      const items = Array.from(claimBody.querySelectorAll('.evidence-item'));
      items.forEach((item) => item.addEventListener('click', () => selectDetail(item.dataset.detailId)));
    }
    function bindDetailItems() {
      const items = Array.from(evidenceBody.querySelectorAll('.evidence-item'));
      items.forEach((item) => item.addEventListener('click', () => selectDetail(item.dataset.detailId)));
    }
    function selectDetail(id) {
      if (!id) return;
      const template = document.getElementById('detail-item-' + CSS.escape(id));
      if (!template) return;
      evidenceTitle.textContent = template.dataset.title || '';
      evidenceSub.textContent = template.dataset.subtitle || '';
      evidenceBody.innerHTML = template.innerHTML;
      Array.from(claimBody.querySelectorAll('.evidence-item')).forEach((item) => item.classList.toggle('active', item.dataset.detailId === id));
      bindDetailItems();
    }
    function selectClaim(id) {
      const template = document.getElementById('claim-panel-' + CSS.escape(id));
      if (!template) return;
      title.textContent = template.dataset.title || '';
      sub.textContent = template.dataset.subtitle || '';
      claimBody.innerHTML = template.innerHTML;
      buttons.forEach((button) => button.classList.toggle('active', button.dataset.nodeId === id));
      bindEvidenceItems();
      if (template.dataset.initialDetailId) selectDetail(template.dataset.initialDetailId);
      else {
        evidenceTitle.textContent = '${escapeJs(display.labels.selectedEvidence)}';
        evidenceSub.textContent = '${escapeJs(display.labels.selectEvidencePrompt)}';
        evidenceBody.innerHTML = '${escapeJs(emptyCard(display.labels.selectedEvidence, display.labels.selectEvidencePrompt))}';
      }
    }
    bindEvidenceItems();
    buttons.forEach((button) => button.addEventListener('click', () => selectClaim(button.dataset.nodeId)));
  </script>
</body>
</html>`
}

function buildFlowNodes(map: NarrativeMap, display: ValidatedNarrativeDisplayModel): FlowNode[] {
  return allClaims(map).map((claim) => {
    const panel = claimEvidencePanel(claim, map, display)
    return {
      id: nodeId(claim.id),
      claim,
      title: display.claimCards.get(claim.id)?.displayTitle ?? claim.text,
      displayCard: display.claimCards.get(claim.id),
      claimHtml: panel.html,
      claimPanelTitle: panel.title,
      claimPanelSubtitle: panel.subtitle,
      initialDetailId: panel.initialDetailId,
      initialDetailHtml: panel.initialDetailHtml,
      initialDetailTitle: panel.initialDetailTitle,
      initialDetailSubtitle: panel.initialDetailSubtitle,
      detailTemplates: panel.detailTemplates,
    }
  })
}

function renderStep(node: FlowNode, map: NarrativeMap, display: ValidatedNarrativeDisplayModel, index: number, active: boolean): string {
  const outgoing = map.claimRelations.filter((relation) => relation.fromClaimId === node.claim.id)
  return `<div class="claim-step">
    <div class="step-rail"><div class="step-dot">${index + 1}</div><div class="step-line"></div></div>
    <button class="claim-card ${escapeAttr(node.claim.evidenceStatus)}${active ? " active" : ""}" data-node-id="${escapeAttr(node.id)}" type="button">
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

function claimEvidencePanel(claim: NarrativeMapClaim, map: NarrativeMap, display: ValidatedNarrativeDisplayModel): { title: string; subtitle: string; html: string; initialDetailId?: string; initialDetailHtml: string; initialDetailTitle: string; initialDetailSubtitle: string; detailTemplates: string } {
  const gaps = relatedGaps(claim, map)
  const card = display.claimCards.get(claim.id)
  const evidenceItems = claim.evidence.map((evidence) => ({
    id: itemDomId("evidence", evidence.id),
    kind: "evidence" as const,
    title: display.labels.linkedGaps,
    subtitle: evidence.source || evidence.id,
    html: linkedGapsPanel(evidence, gaps.filter((gap) => gap.evidenceBindingIds?.includes(evidence.id)), display),
    card: evidenceCard(evidence, display, card),
  }))
  const gapItems = gaps.map((gap) => ({
    id: itemDomId("gap", gap.id),
    kind: "gap" as const,
    title: display.labels.selectedGap,
    subtitle: `${localizeValue(gap.status, display)} / ${localizeValue(gap.priority, display)}`,
    html: gapDetail(gap, display),
    card: gapCard(gap, display),
  }))
  const items = [...evidenceItems, ...gapItems]
  const initial = items[0]
  const title = gaps.length ? `${display.labels.evidenceList} / ${display.labels.gaps}` : display.labels.evidenceList
  const statusLine = [`${claim.evidence.length} ${display.labels.evidenceList}`, gaps.length ? `${gaps.length} ${display.labels.gaps}` : undefined].filter(Boolean).join(" / ")
  const html = [
    `<div class="evidence-list">`,
    claim.evidence.length ? `<div class="evidence-group-title">${escapeHtml(display.labels.evidenceList)}</div>${evidenceItems.map((item) => item.card).join("")}` : `<div class="detail-card"><h3>${escapeHtml(display.labels.evidenceList)}</h3><p class="empty">${escapeHtml(display.labels.noEvidence)}</p></div>`,
    gaps.length ? `<div class="evidence-group-title">${escapeHtml(display.labels.gaps)}</div>${gapItems.map((item) => item.card).join("")}` : "",
    `</div>`,
  ].join("")
  return {
    title,
    subtitle: statusLine || display.labels.selectEvidencePrompt,
    html,
    initialDetailId: initial?.id,
    initialDetailHtml: initial?.html ?? emptyCard(display.labels.selectedEvidence, display.labels.selectEvidencePrompt),
    initialDetailTitle: initial?.title ?? display.labels.selectedEvidence,
    initialDetailSubtitle: initial?.subtitle ?? display.labels.selectEvidencePrompt,
    detailTemplates: items.map((item) => `<template id="detail-item-${escapeAttr(item.id)}" data-title="${escapeHtml(item.title)}" data-subtitle="${escapeHtml(item.subtitle)}">${item.html}</template>`).join(""),
  }
}

function evidenceCard(evidence: NarrativeMapClaim["evidence"][number], display: ValidatedNarrativeDisplayModel, card: ReturnType<ValidatedNarrativeDisplayModel["claimCards"]["get"]>): string {
  const id = itemDomId("evidence", evidence.id)
  const description = evidence.quote || evidence.source || evidence.location || evidence.supportScope || display.labels.evidence
  const why = card?.supportRationale || card?.supportedScope || evidence.supportScope
  const sources = sourceItems(evidence, display)
  return `<button class="evidence-item ${escapeAttr(evidence.strength)}" type="button" data-evidence-id="${escapeAttr(evidence.id)}" data-detail-id="${escapeAttr(id)}">
    <span class="evidence-kind">${escapeHtml(display.labels.evidence)}</span>
    <span class="evidence-title">${escapeHtml(shorten(description, 180))}</span>
    ${why ? `<span class="evidence-field"><span class="evidence-field-title">${escapeHtml(display.labels.whyThisSupports)}</span><ul class="evidence-bullets"><li>${escapeHtml(shorten(why, 220))}</li></ul></span>` : ""}
    <span class="evidence-field"><span class="evidence-field-title">${escapeHtml(display.labels.evidenceSource)}</span><ul class="evidence-bullets">${sources.map((source) => `<li>${escapeHtml(source)}</li>`).join("")}</ul></span>
    <span class="evidence-meta"><span class="tag">${escapeHtml(localizeValue(evidence.strength, display))}</span>${evidence.location ? `<span class="tag">${escapeHtml(evidence.location)}</span>` : ""}${evidence.findingsFile ? `<span class="tag">${escapeHtml(evidence.findingsFile)}</span>` : ""}</span>
  </button>`
}

function gapCard(gap: NarrativeMapResearchGap, display: ValidatedNarrativeDisplayModel): string {
  const id = itemDomId("gap", gap.id)
  const question = displayGapQuestion(gap, display)
  return `<button class="evidence-item gap" type="button" data-gap-id="${escapeAttr(gap.id)}" data-detail-id="${escapeAttr(id)}">
    <span class="evidence-kind">${escapeHtml(display.labels.gap)}</span>
    <span class="evidence-source">${escapeHtml(question)}</span>
    <ul class="evidence-bullets"><li><strong>${escapeHtml(display.labels.status)}</strong> ${escapeHtml(localizeValue(gap.status, display))}</li><li><strong>${escapeHtml(systemTerm("priority", display))}</strong> ${escapeHtml(localizeValue(gap.priority, display))}</li></ul>
    <span class="evidence-meta"><span class="tag">${escapeHtml(localizeValue(gap.status, display))}</span><span class="tag">${escapeHtml(localizeValue(gap.priority, display))}</span></span>
  </button>`
}

function linkedGapsPanel(evidence: NarrativeMapClaim["evidence"][number], gaps: NarrativeMapResearchGap[], display: ValidatedNarrativeDisplayModel): string {
  if (!gaps.length) return emptyCard(display.labels.linkedGaps, display.labels.noLinkedGaps)
  return `<div class="evidence-list">${gaps.map((gap) => gapCard(gap, display)).join("")}</div>`
}

function gapDetail(gap: NarrativeMapResearchGap, display: ValidatedNarrativeDisplayModel): string {
  return detailCards([
    [display.labels.gap, displayGapQuestion(gap, display)],
    [display.labels.status, `${localizeValue(gap.status, display)} / ${localizeValue(gap.priority, display)}`],
    [systemTerm("target", display), `${gap.targetType}${gap.targetId ? `: ${gap.targetId}` : ""}`],
    ...optionalRows(systemTerm("findingsFile", display), gap.findingsFile),
    ...optionalRows(systemTerm("evidenceBindingIds", display), gap.evidenceBindingIds?.join(", ")),
    ...optionalRows(systemTerm("notes", display), gap.notes),
  ])
}

function relatedGaps(claim: NarrativeMapClaim, map: NarrativeMap): NarrativeMapResearchGap[] {
  const evidenceIds = new Set(claim.evidence.map((evidence) => evidence.id))
  const seen = new Set<string>()
  return map.researchGaps.filter((gap) => {
    const matchesClaim = gap.targetType === "claim" && gap.targetId === claim.id
    const matchesEvidence = (gap.evidenceBindingIds ?? []).some((id) => evidenceIds.has(id))
    if ((!matchesClaim && !matchesEvidence) || seen.has(gap.id)) return false
    seen.add(gap.id)
    return true
  })
}

function optionalRows(label: string, value: string | undefined): Array<[string, string]> {
  return value ? [[label, value]] : []
}

function sourceItems(evidence: NarrativeMapClaim["evidence"][number], display: ValidatedNarrativeDisplayModel): string[] {
  const items = [evidence.source, evidence.location, evidence.findingsFile, evidence.sourcePath, ...splitSourceUrls(evidence.url)]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
  const unique = Array.from(new Set(items))
  return unique.length ? unique : [display.labels.none]
}

function splitSourceUrls(value: string | undefined): string[] {
  if (!value?.trim()) return []
  const urls = value.match(/https?:\/\/[^\s,;]+/g)
  if (urls?.length) return urls
  return value.split(/\s*[;·]\s*/).filter(Boolean)
}

function displayGapQuestion(gap: NarrativeMapResearchGap, display: ValidatedNarrativeDisplayModel): string {
  return display.researchGapCards.get(gap.id)?.displayQuestion ?? gap.question
}

function isLocalizedDisplay(display: ValidatedNarrativeDisplayModel): boolean {
  return display.language !== "en"
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
  if (relation.rationale?.trim() && isLocalizedDisplay(display)) return undefined
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

function allClaims(map: NarrativeMap): NarrativeMapClaim[] {
  return map.claimFlow.length > 0 ? map.claimFlow : map.claims.supported.concat(map.claims.partial, map.claims.weak, map.claims.missing, map.claims.not_required)
}

function sectionLabels(display: ValidatedNarrativeDisplayModel): Record<string, string> {
  if (isChineseLanguage(display.language)) return { role: "角色", narrativeJob: "叙事任务", evidenceSummary: "证据摘要", riskOrGapSummary: "风险/缺口" }
  if (isJapaneseLanguage(display.language)) return { role: "役割", narrativeJob: "ナラティブ上の役割", evidenceSummary: "根拠の要約", riskOrGapSummary: "リスク/ギャップ" }
  return { role: "Role", narrativeJob: "Narrative job", evidenceSummary: "Evidence summary", riskOrGapSummary: "Risk / gap" }
}

function systemTerm(term: string, display: ValidatedNarrativeDisplayModel): string {
  const zh: Record<string, string> = { approval: "审批", claims: "主张", relations: "关系", inferred: "未确认", relation: "关系", from: "来自", to: "指向", rationale: "说明", supportRationale: "支撑逻辑", strength: "强度", priority: "优先级", findingsFile: "研究文件", sourcePath: "来源文件", url: "链接", location: "位置", quote: "引用", caveat: "注意事项", target: "目标", evidenceBindingIds: "论据 ID", notes: "备注", artifacts: "产物", attention: "需关注", none: display.labels.none }
  const ja: Record<string, string> = { approval: "承認", claims: "クレーム", relations: "関係", inferred: "未確認", relation: "関係", from: "起点", to: "終点", rationale: "理由", supportRationale: "裏付けの論理", strength: "強度", priority: "優先度", findingsFile: "調査ファイル", sourcePath: "出典ファイル", url: "URL", location: "場所", quote: "引用", caveat: "留意点", target: "対象", evidenceBindingIds: "根拠ID", notes: "メモ", artifacts: "成果物", attention: "要確認", none: display.labels.none }
  const en: Record<string, string> = { approval: "approval", claims: "claims", relations: "relations", inferred: "unconfirmed", relation: "relation", from: "from", to: "to", rationale: "rationale", supportRationale: "why this supports the claim", strength: "strength", priority: "priority", findingsFile: "findings file", sourcePath: "source path", url: "URL", location: "location", quote: "quote", caveat: "caveat", target: "target", evidenceBindingIds: "evidence binding IDs", notes: "notes", artifacts: "artifacts", attention: "need attention", none: display.labels.none }
  return (isChineseLanguage(display.language) ? zh : isJapaneseLanguage(display.language) ? ja : en)[term] ?? term
}

function localizeValue(value: string, display: ValidatedNarrativeDisplayModel): string {
  if (value === "no_target") return isChineseLanguage(display.language) ? "无 render target" : isJapaneseLanguage(display.language) ? "render target なし" : "no target"
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

function nodeId(id: string): string {
  return `claim-${id}`.replace(/[^a-zA-Z0-9._-]+/g, "-")
}

function itemDomId(prefix: string, id: string): string {
  return `${prefix}-${id}`.replace(/[^a-zA-Z0-9._-]+/g, "-")
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

function escapeJs(value: string | undefined): string {
  return escapeHtml(value).replace(/[\\'`$]/g, (ch) => ({ "\\": "\\\\", "'": "\\'", "`": "\\`", "$": "\\$" }[ch] ?? ch))
}
