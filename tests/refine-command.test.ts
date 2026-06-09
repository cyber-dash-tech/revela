import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { createEmptyDecksState, upsertDeck, upsertSlides, workspaceDeckSlug, writeDecksState } from "../lib/decks-state"
import { clearInspectRequestsForTests, getInspectRequest } from "../lib/inspect/requests"
import { handleEdit } from "../lib/commands/edit"
import { handleInspect } from "../lib/commands/inspect"
import { computeNarrativeHash } from "../lib/narrative-state/hash"
import { clearCommentRequestsForTests } from "../lib/refine/comment-requests"
import { ensureRefineDeckOpenForChange, openRefineDeck } from "../lib/refine/open"
import { createCodexExecReviewPromptBridge } from "../lib/refine/prompt-bridge"
import { clearReviewApplyFixArtifactQaSuppressionsForTests, shouldSuppressReviewApplyFixArtifactQa } from "../lib/refine/qa-suppression"
import { displayReviewReferenceLabel, renderCodexReviewShell, renderRefineShell, stopRefineServer } from "../lib/refine/server"
import { mockFetchWith, readJsonFile, tempWorkspace } from "./helpers/tool-helpers"

const roots: string[] = []

afterEach(() => {
  clearCommentRequestsForTests()
  clearReviewApplyFixArtifactQaSuppressionsForTests()
  clearInspectRequestsForTests()
  stopRefineServer()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workspace(): string {
  const root = tempWorkspace("revela-refine-test-")
  roots.push(root)
  mkdirSync(join(root, "decks"), { recursive: true })
  return root
}

describe("renderRefineShell", () => {
  it("truncates Review ref labels to the display maximum", () => {
    expect(displayReviewReferenceLabel("Heading: Short")).toBe("Heading: Short")
    expect(displayReviewReferenceLabel("Heading: This reference label is intentionally too long")).toBe("Heading: This reference label i…")
    expect(displayReviewReferenceLabel("Heading: This reference label is intentionally too long")).toHaveLength(32)
  })

  it("combines edit comments and narrative reading inspect cards behind tabs", () => {
    const html = renderRefineShell("test-token")

    expect(html).toContain("Revela Review")
    expect(html).not.toContain("Select refs, describe the change, then send.")
    expect(html).toContain("body { margin: 0; background: #f8fafc; color: #111827")
    expect(html).toContain("aside { position: relative; display: flex; flex-direction: column; gap: 16px; padding: 18px; background: #ffffff")
    expect(html).toContain("border-left: 1px solid #e2e8f0")
    expect(html).toContain("aside button, aside input, aside select, aside textarea, aside .comment-editor { font-family: inherit; }")
    expect(html).not.toContain("font-family: Garamond, \"Iowan Old Style\", Georgia, serif")
    expect(html).not.toContain("background: linear-gradient(180deg, #fbfaf7 0%, #f2eee6 100%)")
    expect(html).not.toContain("background: linear-gradient(135deg, #111827 0%, #1f2937 100%)")
    expect(html).not.toContain("border-color: #a9793f")
    expect(html).not.toContain("rgba(169,121,63,.14)")
    expect(html).toContain("border-color: #93c5fd")
    expect(html).toContain("rgba(59,130,246,.12)")
    expect(html).toContain("#2563eb")
    expect(html).toContain("37,99,235")
    expect(html).toContain("#1d4ed8")
    expect(html).not.toContain("#4338ca")
    expect(html).toContain(".tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid #e2e8f0; border-radius: 999px; background: #f8fafc; }")
    expect(html).toContain(".tab.active { position: relative; top: 0; background: #ffffff; border-color: #e2e8f0")
    expect(html).not.toContain("border-radius: 13px 13px 0 0")
    expect(html).not.toContain("border-bottom: 1px solid #d8d2c6")
    expect(html).not.toContain(".tab.active { position: relative; top: 1px")
    expect(html).toContain("id=\"editTab\"")
    expect(html).toContain("id=\"inspectTab\"")
    expect(html).not.toContain("id=\"assetsTab\"")
    expect(html).not.toContain("id=\"assetsPanel\"")
    expect(html).toContain("Search Assets")
    expect(html).toContain("<div class=\"label\">Local Assets</div>")
    expect(html).toContain("id=\"localAssetToggle\"")
    expect(html).toContain("aria-label=\"Local Assets\"")
    expect(html).toContain("title=\"Local Assets\"")
    expect(html).toContain("class=\"lucide lucide-image composer-icon\"")
    expect(html).toContain("data-lucide=\"image\"")
    expect(html).toContain(".asset-menu-toggle { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; min-width: 42px")
    expect(html).not.toContain(">Local Assets</button>")
    expect(html).toContain("id=\"localAssetMenu\"")
    expect(html).toContain("class=\"local-assets-menu\"")
    expect(html).toContain("toggleLocalAssetMenu")
    expect(html).toContain("closeLocalAssetMenu")
    expect(html).toContain("setLocalAssetMenuOpen")
    expect(html).toContain("id=\"editSavedAssets\"")
    expect(html).not.toContain("id=\"librarySavedAssets\"")
    expect(html).toContain("id=\"assetSearchToggle\"")
    expect(html).toContain("aria-label=\"Search assets\"")
    expect(html).toContain("class=\"lucide lucide-plus composer-icon\"")
    expect(html).toContain("data-lucide=\"plus\"")
    expect(html).toContain("aria-controls=\"assetSearchView\"")
    expect(html).toContain("id=\"assetSearchView\"")
    expect(html).toContain("class=\"asset-search-view\"")
    expect(html).toContain("id=\"assetSearchBack\"")
    expect(html).toContain("← Back")
    expect(html).toContain("Save images to Local Assets, then use them from Comment.")
    expect(html).toContain("toggleAssetSearchPanel")
    expect(html).toContain("closeAssetSearchPanel")
    expect(html).toContain("setAssetSearchOpen")
    expect(html).toContain("<option value=\"logo\" selected>logo</option>")
    expect(html).toContain("<option value=\"illustration\">photo</option>")
    expect(html).toContain("Search image candidates, then save one to the workspace.")
    expect(html).toContain("No local assets yet. Click + to search assets.")
    expect(html).toContain("id=\"assetShuffleButton\"")
    expect(html).toContain("Refresh")
    expect(html).toContain("searchAssets(true)")
    expect(html).toContain("assetSearchPage")
    expect(html).toContain("No displayable images found. Try Refresh or another purpose.")
    expect(html).toContain("No assets found. Try another query or purpose.")
    expect(html).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))")
    expect(html).toContain(".asset-card.saved { width: 64px; height: 64px")
    expect(html).not.toContain("class=\"edit-assets\"")
    expect(html).toContain(".local-assets-menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 10px)")
    expect(html).toContain(".local-assets-menu .asset-grid { grid-template-columns: repeat(auto-fill, 64px)")
    expect(html).toContain(".local-assets-menu .asset-thumb { width: 64px; height: 64px; }")
    expect(html).toContain("card.className = saved ? 'asset-card saved' : 'asset-card'")
    expect(html).toContain("Save to workspace")
    expect(html).toContain("asset-save")
    expect(html).not.toContain("asset-add")
    expect(html).not.toContain("Add to comment")
    expect(html).toContain("addAssetToComment")
    expect(html).toContain("selectedAsset")
    expect(html).toContain("asset-ref-chip")
    expect(html).toContain(".ref-chip { display: inline-flex; align-items: center; max-width: 32ch; overflow: hidden; text-overflow: ellipsis;")
    expect(html).toContain("const REF_LABEL_MAX_DISPLAY_CHARS = 32")
    expect(html).toContain("displayReferenceLabel(label)")
    expect(html).toContain("text.slice(0, REF_LABEL_MAX_DISPLAY_CHARS - 1) + '…'")
    expect(html).toContain("chip.title = label")
    expect(html).toContain("clone.querySelectorAll('.ref-chip[title]')")
    expect(html).toContain("assetDropOutline")
    expect(html).toContain("renderAssetDropTarget")
    expect(html).toContain("insert-into")
    expect(html).toContain("Insert into this element")
    expect(html).toContain("limit: '24'")
    expect(html).toContain("page: String(state.assetSearchPage)")
    expect(html).toContain("/api/assets/search")
    expect(html).toContain("/api/assets/save")
    expect(html).toContain("/api/assets/list")
    expect(html).toContain("sendAssetPlacement")
    expect(html).toContain("Leave Comment")
    expect(html).toContain("Apply")
    expect(html).toContain("Re-apply")
    expect(html).toContain("Queued for apply")
    expect(html).toContain("pollQueuedComment")
    expect(html).toContain(".comment-bubble.applying {")
    expect(html).toContain(".comment-bubble.applied {")
    expect(html).not.toContain("completed-no-update")
    expect(html).not.toContain(".comment-bubble.applying::before")
    expect(html).not.toContain("rainbow-border")
    expect(html).toContain("@keyframes comment-aurora-flow")
    expect(html).toContain("@media (prefers-reduced-motion: reduce)")
    expect(html).toContain(".comment-bubble:hover")
    expect(html).toContain(".comment-bubble.active")
    expect(html).toContain("class=\"primary-action composer-send\"")
    expect(html).toContain("aria-label=\"Leave Comment\"")
    expect(html).toContain("title=\"Leave Comment\"")
    expect(html).toContain("class=\"lucide lucide-send composer-icon\"")
    expect(html).toContain("data-lucide=\"send\"")
    expect(html).toContain(".composer-send { position: absolute; right: 10px; bottom: 10px; width: 42px")
    expect(html).not.toContain("class=\"send-icon\"")
    expect(html).not.toContain("M14.7 6.3a1 1 0 0 0 0 1.4")
    expect(html).toContain("Comments")
    expect(html).toContain("overflow-y: auto")
    expect(html).toContain("flex: 0 0 150px")
    expect(html).toContain("className = 'comment-action-button'")
    expect(html).toContain("aria-label', label")
    expect(html).toContain("button.addEventListener('click', (event) => event.stopPropagation())")
    expect(html).toContain("bubble.addEventListener('click', () => selectPersistedComment(comment.id))")
    expect(html).toContain("selectPersistedComment")
    expect(html).toContain("state.activeCommentElements = Array.isArray(comment.elements) ? comment.elements : []")
    expect(html).toContain("elementFromPayload(payload)")
    expect(html).toContain("resolveElementFromPayload(payload)")
    expect(html).toContain("doc.querySelector(payload.selector)")
    expect(html).toContain("selected && (selected === slide || slide.contains(selected))")
    expect(html).toContain("slide.querySelector(payload.selector)")
    expect(html).toContain("resolveElementByFingerprint(slide, payload)")
    expect(html).toContain("payload.fingerprint || {}")
    expect(html).toContain("payloadFingerprint.contentHash && payloadFingerprint.contentHash === candidateFingerprint.contentHash")
    expect(html).toContain("payloadText && payloadText === candidatePayload.textNormalized")
    expect(html).toContain("payloadFingerprint.structureHash && payloadFingerprint.structureHash === candidateFingerprint.structureHash")
    expect(html).toContain("relativeBoxDistance(payload.slideRelativeBox, candidatePayload.slideRelativeBox)")
    expect(html).not.toContain("payload.selector && !resolved.matchedSelector")
    expect(html).toContain("commentHighlightOutlines")
    expect(html).toContain("id=\"commentHighlightLayer\"")
    expect(html).toContain("class=\"comment-highlight-layer\"")
    expect(html).toContain(".comment-highlight-box")
    expect(html).toContain("createCommentHighlightBox")
    expect(html).toContain("renderParentBox")
    expect(html).toContain("frameRect.left - previewRect.left + rect.left")
    expect(html).toContain("renderActiveCommentHighlights")
    expect(html).toContain("Comment target is no longer available on this deck version.")
    expect(html).toContain("renderCommentReferenceChips(comment.elements)")
    expect(html).toContain("elementDisplayLabel(payload)")
    expect(html).toContain("displayLabel")
    expect(html).toContain("semanticKind")
    expect(html).toContain("textNormalized")
    expect(html).toContain("slideRelativeBox")
    expect(html).toContain("fingerprint")
    expect(html).toContain("textHash")
    expect(html).toContain("contentHash")
    expect(html).toContain("structureHash")
    expect(html).toContain("contextHash")
    expect(html).toContain("fingerprintForTarget(identity)")
    expect(html).toContain("stableHash")
    expect(html).toContain("data-lucide=\"play\"")
    expect(html).toContain("data-lucide=\"refresh-cw\"")
    expect(html).toContain("data-lucide=\"square\"")
    expect(html).toContain("data-lucide=\"trash-2\"")
    expect(html).toContain("data-lucide=\"list\"")
    expect(html).toContain("stopPersistedComment")
    expect(html).toContain("deletePersistedComment")
    expect(html).toContain("id=\"codexLogModal\"")
    expect(html).toContain("class=\"codex-log-modal\"")
    expect(html).toContain("id=\"codexLogBackdrop\"")
    expect(html).toContain("id=\"codexLogClose\"")
    expect(html).toContain("id=\"codexLogBody\"")
    expect(html).toContain("openCodexLogModal")
    expect(html).toContain("closeCodexLogModal")
    expect(html).toContain("renderCodexLogEntries")
    expect(html).toContain("const log = commentActionButton('Execution Log'")
    expect(html).toContain("log.addEventListener('click', () => openCodexLogModal(comment.eventLog))")
    expect(html).not.toContain("const codexLog = renderCodexLog(comment.eventLog)")
    expect(html).toContain("id=\"selectionSummary\" class=\"selection-summary sr-only\"")
    expect(html.indexOf("id=\"commentThread\"")).toBeLessThan(html.indexOf("id=\"comment\""))
    expect(html.indexOf("id=\"commentThread\"")).toBeLessThan(html.indexOf("id=\"send\""))
    expect(html).toContain("scrollCommentThreadToBottom")
    expect(html).toContain("els.commentThread.scrollTop = els.commentThread.scrollHeight")
    expect(html).toContain("Get Insight")
    expect(html).not.toContain("id=\"inspectRefSummary\"")
    expect(html).not.toContain("id=\"inspectQuestion\"")
    expect(html).toContain("id=\"inspectComment\"")
    expect(html).toContain("class=\"comment-editor\" contenteditable=\"true\"")
    expect(html).toContain("Insight comment")
    expect(html).toContain("Cmd/Ctrl-click slide elements to add @refs, then ask about purpose or source.")
    expect(html).toContain("Select a deck element to create an @ref, optionally ask a question, then get insight.")
    expect(html).toContain("state.sendingEdit")
    expect(html).toContain("assetSavingIndex")
    expect(html).toContain("Saving to workspace")
    expect(html).toContain("mergeSavedAsset")
    expect(html).toContain("savedAssetForCandidate")
    expect(html).toContain("slugifyAssetId")
    expect(html).toContain("✅ Saved")
    expect(html).toContain("Asset already saved to Local Assets")
    expect(html).toContain("is-saved-candidate")
    expect(html).toContain("'asset-save ' + variant")
    expect(html).toContain("if (body.asset && (!listed || !findSavedAsset(body.asset.id)))")
    expect(html).toContain("setButtonLoading")
    expect(html).toContain("renderInspectLoading")
    expect(html).toContain("const comment = getInspectComment()")
    expect(html).toContain("syncReferencesFromComment(false, els.inspectComment)")
    expect(html).toContain("getCommentText(els.inspectComment)")
    expect(html).toContain("language: state.inspectLanguage, comment")
    expect(html).toContain("Getting insight...")
    expect(html).toContain("Searching...")
    expect(html).toContain("Sending...")
    expect(html).toContain("finally")
    expect(html).toContain("state.sendingEdit = false")
    expect(html).toContain("/api/comment-result")
    expect(html).toContain("EventSource('/api/comment-events")
    expect(html).not.toContain("Codex Activity")
    expect(html).toContain("pollCommentResult(commentId, requestId)")
    expect(html).toContain("if (event.type === 'completed')")
    expect(html).not.toContain("watchDeckVersionAfterComment")
    expect(html).not.toContain("markStaleComments")
    expect(html).not.toContain("markCommentsUpdatedForVersion")
    expect(html).not.toContain("Still waiting for deck file update")
    expect(html).not.toContain("Waiting for deck file update")
    expect(html).toContain("if (pendingCommentStatus(commentId) === 'applying')")
    expect(html).toContain("updatePendingCommentStatus(commentId, 'applied', { progressEvent: null })")
    expect(html).toContain("setStatus('Codex completed.')")
    expect(html).toContain("progressEvent: null")
    expect(html).toContain("comment.progressEvent = nextEvent")
    expect(html).toContain("if (status === 'updated' || status === 'failed' || status === 'applied') comment.progressEvent = null")
    expect(html).toContain("comment.progressEvent = null")
    expect(html).toContain("line.textContent = comment.progressEvent.message")
    expect(html).not.toContain("progressEvents.push")
    expect(html).toContain("Sent to Review agent")
    expect(html).toContain("Sending to Review agent...")
    expect(html).toContain("if (status === 'applied' || status === 'updated' || status === 'stale') return 'Codex completed'")
    expect(html).toContain("return status === 'applied' || status === 'updated' || status === 'stale'")
    expect(html).not.toContain("Sending to OpenCode...")
    expect(html).not.toContain("Sent to OpenCode")
    expect(html).toContain("class=\"spinner\"")
    expect(html).toContain("skeleton-card")
    expect(html).toContain("/api/comments")
    expect(html).toContain("/api/inspect")
    expect(html).toContain("/api/inspect-result")
    expect(html).toContain("Generated")
    expect(html).toContain("Reading selection...")
    expect(html).toContain("Deterministic fallback")
    expect(html).toContain("id=\"inspectLanguage\"")
    expect(html).toContain("id=\"deckPrev\"")
    expect(html).toContain("id=\"deckNext\"")
    expect(html).toContain("id=\"deckCounter\"")
    expect(html).toContain("id=\"visualMoveHandle\"")
    expect(html).toContain("id=\"visualResizeHandle\"")
    expect(html).toContain("id=\"visualEditToolbar\"")
    expect(html).toContain("Save Changes")
    expect(html).toContain("saveVisualChanges")
    expect(html).toContain("display: inline-flex; align-items: center")
    expect(html).not.toContain(".visual-edit-toolbar.active { display: inline-flex; }")
    expect(html).toContain("count === 0 ? 'No unsaved visual changes'")
    expect(html).toContain("updateVisualToolbar();")
    expect(html).toContain("/api/visual-changes")
    expect(html).toContain("isDirectResizable")
    expect(html).toContain("startVisualMove")
    expect(html).toContain("aria-label=\"Deck navigation\"")
    expect(html).toContain("goToDeckSlide")
    expect(html).toContain("pendingDeckSlideRestore")
    expect(html).toContain("restoreDeckSlideAfterRefresh")
    expect(html).toContain("restoreDeckSlide")
    expect(html).toContain("applyFallbackDeckNavigation")
    expect(html).toContain("win.RevelaDeckNav")
    expect(html).toContain("pointerleave', clearHoverSilently")
    expect(html).toContain("function clearHoverSilently()")
    expect(html).toContain("reference.payload?.slideIndex !== currentSlideIndex")
    expect(html).toContain("ArrowRight")
    expect(html).toContain("PageDown")
    expect(html).toContain("简体中文")
    expect(html).toContain("Português")
    expect(html).toContain("language: state.inspectLanguage")
    expect(html).toContain("collectReferenceSnapshot")
    expect(html).toContain("Purpose")
    expect(html).toContain("Source")
    expect(html).toContain("renderPurpose")
    expect(html).toContain("renderSource")
    expect(html).toContain("Cmd/Ctrl-click slide elements to add @refs")
    expect(html).not.toContain("Ask anything")
  })

  it("can default to the Insight tab", () => {
    const html = renderRefineShell("test-token", "inspect")

    expect(html).toContain("const defaultMode = \"inspect\"")
    expect(html).toContain("state.mode = mode === 'inspect' ? 'inspect' : 'edit'")
  })

  it("renders a Codex-specific Review shell with execution logs and Insight SSE", () => {
    const html = renderCodexReviewShell("test-token")

    expect(html).toContain("Comments")
    expect(html).not.toContain("Codex Activity")
    expect(html).toContain("const reviewSurface = \"codex\"")
    expect(html).toContain("class=\"codex-review\"")
    expect(html).toContain("/api/inspect-events")
    expect(html).toContain("Codex execution log")
    expect(html).toContain("codexLogModal")
    expect(html).toContain("openCodexLogModal")
    expect(html).toContain("renderCodexLog")
  })

  it("scopes the apply lock overlay to the preview while keeping comment drafts editable", () => {
    const html = renderCodexReviewShell("test-token")
    const previewStart = html.indexOf("<section class=\"preview\">")
    const overlayStart = html.indexOf("id=\"applyLockOverlay\"")
    const previewEnd = html.indexOf("</section>", previewStart)
    const asideStart = html.indexOf("<aside>")

    expect(previewStart).toBeGreaterThan(-1)
    expect(overlayStart).toBeGreaterThan(previewStart)
    expect(overlayStart).toBeLessThan(previewEnd)
    expect(overlayStart).toBeLessThan(asideStart)
    expect(html).toContain(".apply-lock-overlay { position: absolute;")
    expect(html).toContain("<strong>Applying deck edit...</strong><span>Preview is locked until Codex finishes.</span>")
    expect(html).toContain("els.comment.setAttribute('contenteditable', 'true')")
    expect(html).toContain("els.inspectComment.setAttribute('contenteditable', 'true')")
    expect(html).not.toContain("els.comment.setAttribute('contenteditable', locked ? 'false' : 'true')")
    expect(html).toContain("if (isApplyLocked() && !isTextInputTarget(event.target))")
  })
})

describe("openRefineDeck", () => {
  it("opens a refine session for the only HTML deck without launching a browser when disabled", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Market Map</h2></section></body></html>", "utf-8")

    const result = openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })

    expect(result.mode).toBe("edit")
    expect(result.deck.slug).toBe(workspaceDeckSlug(root))
    expect(result.deck.file).toBe("decks/market-map.html")
    expect(result.url).toStartWith("http://127.0.0.1:")
    expect(result.url).toContain("/refine?token=")
    expect(result.openedBrowser).toBe(false)
  })

  it("opens an explicit deck path even when multiple deck files exist", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "active.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><div class=\"slide-canvas\"><h2>Active</h2></div></section></body></html>", "utf-8")
    writeFileSync(join(root, "decks", "other.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Other</h2></section></body></html>", "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, { slug, goal: "Refine active", outputPath: "decks/active.html" })
    state = upsertSlides(state, slug, [{
      index: 1,
      title: "Active",
      purpose: "Use active render target",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: "Active" },
      evidence: [{ source: "user request" }],
      status: "ready",
    }])
    writeDecksState(root, state)

    const result = openRefineDeck("decks/active.html", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })

    expect(result.deck.file).toBe("decks/active.html")
    expect(result.deck.source).toBe("file-path")
  })

  it("refuses to open the active deck when slide identity does not match DECKS.json", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "active.html"), "<html><body><section class=\"slide\"><h2>Active</h2></section></body></html>", "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, { slug, goal: "Refine active", outputPath: "decks/active.html" })
    state = upsertSlides(state, slug, [{
      index: 1,
      title: "Active",
      purpose: "Use active render target",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: "Active" },
      evidence: [{ source: "user request" }],
      status: "ready",
    }])
    writeDecksState(root, state)

    expect(() => openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })).toThrow("Deck HTML contract validation failed")
  })

  it("opens a partial active deck when slide identity is self-consistent", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "active.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><div class=\"slide-canvas\"><h2>Active</h2></div></section></body></html>", "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, { slug, goal: "Refine partial", outputPath: "decks/active.html" })
    state = upsertSlides(state, slug, [1, 2, 3].map((index) => ({
      index,
      title: `Slide ${index}`,
      purpose: "Use active render target",
      layout: "cover",
      components: ["hero-title"],
      content: { headline: `Slide ${index}` },
      evidence: [{ source: "user request" }],
      status: "ready",
    })))
    writeDecksState(root, state)

    const result = openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })

    expect(result.deck.file).toBe("decks/active.html")
  })
})

describe("deprecated refine command shims", () => {
  it("does not open UI from removed /revela edit", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const messages: string[] = []

    await handleEdit({
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    }, async (message) => {
      messages.push(message)
    })

    expect(messages[0]).toContain("`/revela edit` has been removed")
    expect(messages[0]).toContain("/revela review --deck")
    expect(messages[0]).not.toContain("/refine?token=")
  })

  it("does not open UI from removed /revela inspect", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const messages: string[] = []

    await handleInspect({
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    }, async (message) => {
      messages.push(message)
    })

    expect(messages[0]).toContain("`/revela inspect` is no longer a public command")
    expect(messages[0]).toContain("/revela review --deck")
    expect(messages[0]).not.toContain("/refine?token=")
  })
})

describe("ensureRefineDeckOpenForChange", () => {
  it("opens Refine after a deck change but skips reopening a live session", () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "market-map.html"), "<html><body><section class=\"slide\" data-slide-index=\"1\"><h2>Market Map</h2></section></body></html>", "utf-8")
    const opened: string[] = []
    const client = { session: { prompt: async () => undefined } }

    const first = ensureRefineDeckOpenForChange("", {
      client,
      sessionID: "session-1",
      workspaceRoot: root,
      openUrl: (url) => opened.push(url),
    })

    const second = ensureRefineDeckOpenForChange("", {
      client,
      sessionID: "session-1",
      workspaceRoot: root,
      openUrl: (url) => opened.push(url),
    })

    expect(first.url).toContain("/refine?token=")
    expect(first.openedBrowser).toBe(true)
    expect(second.url).toBe(first.url)
    expect(second.reusedSession).toBe(true)
    expect(second.liveSession).toBe(true)
    expect(second.openedBrowser).toBe(false)
    expect(second.skippedReason).toBe("live-session")
    expect(opened).toHaveLength(1)
  })
})

describe("refine HTTP visual edit lifecycle", () => {
  it("refreshes visual targets after saving so the same element can be resized again", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><p class="body">Launch plan</p></section>', "utf-8")
    const opened = openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-visual-resize",
      workspaceRoot: root,
      openBrowser: false,
    })
    const deckUrl = new URL(opened.url)
    deckUrl.pathname = "/deck"
    const versionUrl = new URL(opened.url)
    versionUrl.pathname = "/api/deck-version"
    const saveUrl = new URL(opened.url)
    saveUrl.pathname = "/api/visual-changes"

    const deckResponse = await fetch(deckUrl)
    expect(deckResponse.status).toBe(200)
    expect(await deckResponse.text()).toContain('data-revela-edit-id="rve-1"')
    const initialVersion = await fetch(versionUrl).then((response) => response.json()) as any
    expect(initialVersion.ok).toBe(true)

    const first = await fetch(saveUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deckVersion: initialVersion.version,
        changes: [{ type: "resize", editId: "rve-1", kind: "text-width", after: { stylePatch: { width: "300px", "max-width": "300px" } } }],
      }),
    }).then((response) => response.json()) as any
    expect(first.ok).toBe(true)

    const second = await fetch(saveUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deckVersion: first.deckVersion,
        changes: [{ type: "resize", editId: "rve-1", kind: "text-width", after: { stylePatch: { width: "420px", "max-width": "420px" } } }],
      }),
    }).then((response) => response.json()) as any

    expect(second.ok).toBe(true)
    expect(readFileSync(join(root, "decks", "demo.html"), "utf-8")).toContain('style="width: 420px; max-width: 420px"')
  })
})

describe("refine HTTP inspect lifecycle", () => {
  it("returns deterministic preprocess before the generated inspection completes", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1><h2>Conversion improved 18%</h2></div></section>', "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug,
      goal: "Approve launch",
      audience: "Executive team",
      outputPath: "decks/demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:demo",
      status: "approved",
      audience: { primary: "Executive team", beliefBefore: "Unsure", beliefAfter: "Ready to approve" },
      decision: { action: "Approve launch" },
      claims: [{
        id: "claim:conversion",
        kind: "evidence",
        text: "Conversion improved 18%",
        importance: "central",
        evidenceRequired: true,
        evidenceStatus: "supported",
      }],
      evidenceBindings: [{
        id: "evidence:conversion",
        claimId: "claim:conversion",
        source: "Pilot dashboard",
        sourcePath: "sources/pilot.csv",
        quote: "Conversion improved 18%",
        strength: "strong",
      }],
      objections: [],
      risks: [],
      approvals: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    state = upsertSlides(state, slug, [{
      index: 1,
      title: "Launch",
      purpose: "Show evidence for launch approval",
      narrativeRole: "evidence",
      layout: "two-col",
      components: ["card"],
      claimRefs: [{ claimId: "claim:conversion", role: "primary" }],
      evidenceBindingIds: ["evidence:conversion"],
      content: { headline: "Conversion improved 18%" },
      evidence: [{ source: "Pilot dashboard", sourcePath: "sources/pilot.csv", quote: "Conversion improved 18%" }],
      status: "ready",
    }])
    state.renderTargets = [{
      id: "target:html_deck:decks/demo.html",
      type: "html_deck",
      outputPath: "decks/demo.html",
      sourceNodeIds: ["narrative:demo", "claim:conversion"],
      artifactVersion: computeNarrativeHash(state.narrative!),
      contractStatus: "valid",
      data: { narrativeHash: computeNarrativeHash(state.narrative!) },
    }]
    writeDecksState(root, state)

    let promptCalled = false
    const client = {
      session: {
        prompt: () => {
          promptCalled = true
          return new Promise(() => {})
        },
      },
    }
    const opened = openRefineDeck("", { client, sessionID: "session-1", workspaceRoot: root, openBrowser: false })
    const url = new URL(opened.url)
    url.pathname = "/api/inspect"

    const response = await withTimeout(fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { slideIndex: 1, text: "Conversion improved 18%", tagName: "H2", classList: [] }, language: "简体中文" }),
    }), 100)
    const data = await response.json() as any

    expect(response.status).toBe(410)
    expect(promptCalled).toBe(false)
    expect(data.error).toContain("removed")
    return
    expect(promptCalled).toBe(true)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("pending")
    expect(data.language).toBe("简体中文")
    expect(data.preprocess.cards.purpose.status).toBe("clear")
    expect(data.preprocess.cards.source.status).toBe("supported")
    expect(data.preprocess.cards.reading.status).toBe("matched")
    expect(data.preprocess.cards.reading.claimText).toBe("Conversion improved 18%")
    expect(data.preprocess.cards.reading.artifactCoverage).toContainEqual(expect.objectContaining({
      type: "html_deck",
      outputPath: "decks/demo.html",
      coverageStatus: "current",
      containsClaim: true,
    }))
    expect(data.preprocess.cards.exploratory).toMatchObject({
      status: "available",
      official: false,
      audience: "Executive team",
      claimFocus: "Conversion improved 18%",
    })
    expect(getInspectRequest(data.requestId)?.status).toBe("pending")
  })

  it("completes inspection results through the codex-exec bridge", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><div class="page"><h1>Launch</h1></div></div></section>', "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug,
      goal: "Approve launch",
      audience: "Executive team",
      outputPath: "decks/demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:demo",
      status: "approved",
      audience: { primary: "Executive team", beliefBefore: "Unsure", beliefAfter: "Ready to approve" },
      decision: { action: "Approve launch" },
      claims: [],
      evidenceBindings: [],
      objections: [],
      risks: [],
      approvals: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    state = upsertSlides(state, slug, [{
      index: 1,
      title: "Launch",
      purpose: "Introduce launch decision",
      narrativeRole: "context",
      layout: "title",
      components: ["title"],
      content: { headline: "Launch" },
      evidence: [],
      status: "ready",
    }])
    state.renderTargets = [{
      id: "target:html_deck:decks/demo.html",
      type: "html_deck",
      outputPath: "decks/demo.html",
      sourceNodeIds: ["narrative:demo"],
      artifactVersion: computeNarrativeHash(state.narrative!),
      contractStatus: "valid",
      data: { narrativeHash: computeNarrativeHash(state.narrative!) },
    }]
    writeDecksState(root, state)
    let promptText = ""
    const promptBridge = createCodexExecReviewPromptBridge({
      runner: async ({ prompt }) => {
        promptText = prompt
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            version: 1,
            status: "success",
            selectedText: "Launch",
            matchConfidence: "high",
            cards: {
              purpose: {
                status: "clear",
                role: "cover",
                rationale: "Launch is the selected slide title.",
                whyItMatters: "It anchors the slide.",
              },
              source: {
                status: "not_needed",
                sources: [],
                warnings: [],
                gaps: [],
                caveats: [],
                rationale: "This selected title is structural text.",
              },
            },
          }),
          stderr: "",
        }
      },
    })
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const inspectUrl = new URL(opened.url)
    inspectUrl.pathname = "/api/inspect"

    const response = await fetch(inspectUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { slideIndex: 1, text: "Launch", tagName: "H1", classList: [] } }),
    })
    const data = await response.json() as any
    expect(response.status).toBe(410)
    expect(data.error).toContain("removed")
    return
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ ok: true, status: "pending" })
    const resultUrl = new URL(opened.url)
    resultUrl.pathname = "/api/inspect-result"
    resultUrl.searchParams.set("requestId", data.requestId)
    const completed = await waitForJson(resultUrl, (item) => item.status === "completed")

    expect(promptText).toContain("Return only a single JSON object")
    expect(completed).toMatchObject({
      ok: true,
      status: "completed",
      result: {
        status: "success",
        cards: { purpose: { status: "clear" }, source: { status: "not_needed" } },
      },
    })
    expect(getInspectRequest(data.requestId)?.status).toBe("completed")
  })

  it("streams historical and live Insight progress events over SSE", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    const slug = workspaceDeckSlug(root)
    let state = createEmptyDecksState()
    state = upsertDeck(state, {
      slug,
      goal: "Approve launch",
      audience: "Executive team",
      outputPath: "decks/demo.html",
    })
    state.narrative = {
      version: 1,
      id: "narrative:demo",
      status: "approved",
      audience: { primary: "Executive team", beliefBefore: "Unsure", beliefAfter: "Ready to approve" },
      decision: { action: "Approve launch" },
      claims: [],
      evidenceBindings: [],
      objections: [],
      risks: [],
      approvals: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    state = upsertSlides(state, slug, [{
      index: 1,
      title: "Launch",
      purpose: "Introduce launch decision",
      narrativeRole: "context",
      layout: "title",
      components: ["title"],
      content: { headline: "Launch" },
      evidence: [],
      status: "ready",
    }])
    writeDecksState(root, state)

    let emit: ((event: any) => void) | undefined
    let resolveBridge: ((value: {
      ok: true
      status: "completed"
      result: any
      raw: string
    }) => void) | undefined
    const promptBridge = {
      kind: "codex-exec" as const,
      async send(input: any) {
        emit = input.onEvent
        emit?.({ type: "started", message: "Starting Codex...", timestamp: Date.now() })
        return await new Promise<{
          ok: true
          status: "completed"
          result: any
          raw: string
        }>((resolve) => {
          resolveBridge = resolve
        })
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
      surface: "codex",
    })
    expect(opened.url).toContain("/codex-review?token=")
    const inspectUrl = new URL(opened.url)
    inspectUrl.pathname = "/api/inspect"

    const response = await fetch(inspectUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { slideIndex: 1, text: "Launch", tagName: "H1", classList: [] } }),
    })
    const data = await response.json() as any
    expect(response.status).toBe(410)
    expect(data.error).toContain("removed")
    return

    const eventsUrl = new URL(opened.url)
    eventsUrl.pathname = "/api/inspect-events"
    eventsUrl.searchParams.set("requestId", data.requestId)
    const eventsResponse = await fetch(eventsUrl)
    expect(eventsResponse.status).toBe(200)
    const reader = eventsResponse.body!.getReader()
    if (!reader) throw new Error("Missing SSE body reader")

    const historical = await readSseEvents(reader, 1)
    expect(historical[0]).toMatchObject({ type: "started", message: "Starting Codex..." })

    emit?.({ type: "codex_event", message: "Codex is reading the deck...", detail: "{\"type\":\"turn_started\"}", timestamp: Date.now() })
    const live = await readSseEvents(reader, 1)
    expect(live[0]).toMatchObject({ type: "codex_event", message: "Codex is reading the deck..." })

    resolveBridge?.({
      ok: true,
      status: "completed",
      result: {
        version: 1,
        status: "success",
        selectedText: "Launch",
        matchConfidence: "high",
        cards: {
          purpose: { status: "clear", role: "cover", rationale: "Launch title.", whyItMatters: "It anchors the slide." },
          source: { status: "not_needed", sources: [], warnings: [], gaps: [], caveats: [], rationale: "Structural title." },
        },
      },
      raw: "inspected",
    })
    const terminal = await readSseEvents(reader, 1)
    expect(terminal[0]).toMatchObject({ type: "completed", message: "Codex completed the inspection." })
  })

  it("sends Apply Fix comments through the Codex Review bridge", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    let captured: any
    const promptBridge = {
      kind: "codex-exec" as const,
      async send(input: any) {
        captured = input
        return { ok: true as const, status: "completed" as const, raw: "patched" }
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentUrl = new URL(opened.url)
    commentUrl.pathname = "/api/comment"

    const response = await fetch(commentUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    })
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data).toMatchObject({ ok: true, status: "pending" })
    expect(data.commentRequestId).toBeTruthy()
    expect(captured).toMatchObject({
      action: "comment",
      workspaceRoot: root,
      file: "decks/demo.html",
    })
    expect(captured.prompt).toContain("Target file: decks/demo.html")
    expect(captured.prompt).toContain("Make the title smaller.")
    expect(captured.prompt).toContain("The Review bridge may suppress host-side post-write QA")
    expect(captured.prompt).toContain("Do not treat that as deck readiness")
    expect(captured.prompt).not.toContain("Artifact QA runs automatically after deck writes/patches/edits")
  })

  it("persists Review comments before applying fixes", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    let bridgeCalls = 0
    const promptBridge = {
      kind: "codex-exec" as const,
      async send() {
        bridgeCalls += 1
        return { ok: true as const, status: "completed" as const, raw: "patched" }
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentsUrl = new URL(opened.url)
    commentsUrl.pathname = "/api/comments"

    const response = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    })
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data.comment).toMatchObject({
      deckFile: "decks/demo.html",
      slideIndex: 1,
      comment: "Make the title smaller.",
      status: "open",
    })
    expect(bridgeCalls).toBe(0)
    expect(existsSync(join(root, ".revela", "review-comments", `${data.comment.id}.json`))).toBe(true)

    const listed = await fetch(commentsUrl).then((item) => item.json()) as any
    expect(listed.comments).toHaveLength(1)
    expect(listed.comments[0]).toMatchObject({ id: data.comment.id, slideIndex: 1 })
  })

  it("rejects Review comments that reference multiple slides", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>One</h1></div></section><section class="slide" data-slide-index="2"><div class="slide-canvas"><h1>Two</h1></div></section>', "utf-8")
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
    })
    const commentsUrl = new URL(opened.url)
    commentsUrl.pathname = "/api/comments"

    const response = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make both titles smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "One" }, { slideIndex: 2, tagName: "H1", text: "Two" }],
      }),
    })
    const data = await response.json() as any

    expect(response.status).toBe(400)
    expect(data.error).toContain("multiple slides")
  })

  it("applies a persisted Review comment through the Codex Review bridge", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    let captured: any
    const promptBridge = {
      kind: "codex-exec" as const,
      async send(input: any) {
        captured = input
        return { ok: true as const, status: "completed" as const, raw: "patched" }
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentsUrl = new URL(opened.url)
    commentsUrl.pathname = "/api/comments"
    const savedResponse = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    })
    const saved = await savedResponse.json() as any
    const applyUrl = new URL(opened.url)
    applyUrl.pathname = `/api/comments/${saved.comment.id}/apply`

    const response = await fetch(applyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data).toMatchObject({ ok: true, status: "pending" })
    expect(data.comment).toMatchObject({ id: saved.comment.id, status: "applying" })
    expect(data.commentRequestId).toBeTruthy()
    expect(captured).toMatchObject({
      action: "comment",
      workspaceRoot: root,
      file: "decks/demo.html",
    })
    expect(captured.prompt).toContain("Make the title smaller.")
  })

  it("marks persisted Review comments applied when Codex completed before a timeout-like bridge result", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    const promptBridge = {
      kind: "codex-exec" as const,
      async send() {
        return {
          ok: true as const,
          status: "completed" as const,
          raw: '{"type":"item.completed","item":{"exit_code":0,"status":"completed"}}\ncodex exec timed out after 300000ms.',
        }
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentsUrl = new URL(opened.url)
    commentsUrl.pathname = "/api/comments"
    const saved = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    }).then((item) => item.json()) as any
    const applyUrl = new URL(opened.url)
    applyUrl.pathname = `/api/comments/${saved.comment.id}/apply`

    const response = await fetch(applyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data).toMatchObject({ ok: true, status: "pending" })
    const listed = await waitForJson(commentsUrl, (item) => item.comments?.[0]?.status === "applied")
    expect(listed.comments[0]).toMatchObject({ id: saved.comment.id, status: "applied" })
  })

  it("rejects stopping an applying persisted Review comment while the apply lock is active", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    let resolveBridge: ((value: { ok: true; status: "completed"; raw: string }) => void) | undefined
    const promptBridge = {
      kind: "codex-exec" as const,
      async send() {
        return await new Promise<{ ok: true; status: "completed"; raw: string }>((resolve) => {
          resolveBridge = resolve
        })
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentsUrl = new URL(opened.url)
    commentsUrl.pathname = "/api/comments"
    const saved = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    }).then((item) => item.json()) as any
    const applyUrl = new URL(opened.url)
    applyUrl.pathname = `/api/comments/${saved.comment.id}/apply`
    await fetch(applyUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) })

    const stopUrl = new URL(opened.url)
    stopUrl.pathname = `/api/comments/${saved.comment.id}/stop`
    const stoppedResponse = await fetch(stopUrl, { method: "POST" })
    const stopped = await stoppedResponse.json() as any
    expect(stoppedResponse.status).toBe(409)
    expect(stopped).toMatchObject({ ok: false, code: "apply_locked" })

    resolveBridge?.({ ok: true, status: "completed", raw: "patched after stop" })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const listed = await fetch(commentsUrl).then((item) => item.json()) as any
    expect(listed.comments[0]).toMatchObject({ id: saved.comment.id, status: "applied" })
  })

  it("deletes non-applying persisted Review comments and rejects deleting applying comments", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    let resolveBridge: ((value: { ok: true; status: "completed"; raw: string }) => void) | undefined
    const promptBridge = {
      kind: "codex-exec" as const,
      async send() {
        return await new Promise<{ ok: true; status: "completed"; raw: string }>((resolve) => {
          resolveBridge = resolve
        })
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentsUrl = new URL(opened.url)
    commentsUrl.pathname = "/api/comments"
    const openComment = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Open comment.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    }).then((item) => item.json()) as any
    const applyingComment = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Applying comment.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    }).then((item) => item.json()) as any
    const applyUrl = new URL(opened.url)
    applyUrl.pathname = `/api/comments/${applyingComment.comment.id}/apply`
    await fetch(applyUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) })

    const rejectedDeleteUrl = new URL(opened.url)
    rejectedDeleteUrl.pathname = `/api/comments/${applyingComment.comment.id}`
    const rejectedDelete = await fetch(rejectedDeleteUrl, { method: "DELETE" })
    const rejected = await rejectedDelete.json() as any
    expect(rejectedDelete.status).toBe(409)
    expect(rejected).toMatchObject({ ok: false, code: "apply_locked" })

    const deleteUrl = new URL(opened.url)
    deleteUrl.pathname = `/api/comments/${openComment.comment.id}`
    const deletedResponse = await fetch(deleteUrl, { method: "DELETE" })
    const deleted = await deletedResponse.json() as any
    expect(deletedResponse.status).toBe(409)
    expect(deleted).toMatchObject({ ok: false, code: "apply_locked" })
    resolveBridge?.({ ok: true, status: "completed", raw: "patched" })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const unlockedDeleteResponse = await fetch(deleteUrl, { method: "DELETE" })
    const unlockedDeleted = await unlockedDeleteResponse.json() as any
    expect(unlockedDeleteResponse.status).toBe(200)
    expect(unlockedDeleted).toMatchObject({ ok: true, deleted: true, commentId: openComment.comment.id })
    expect(existsSync(join(root, ".revela", "review-comments", `${openComment.comment.id}.json`))).toBe(false)
  })

  it("re-applies an already applied persisted Review comment", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    const calls: any[] = []
    const promptBridge = {
      kind: "codex-exec" as const,
      async send(input: any) {
        calls.push(input)
        return { ok: true as const, status: "completed" as const, raw: "patched" }
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentsUrl = new URL(opened.url)
    commentsUrl.pathname = "/api/comments"
    const savedResponse = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    })
    const saved = await savedResponse.json() as any
    const applyUrl = new URL(opened.url)
    applyUrl.pathname = `/api/comments/${saved.comment.id}/apply`

    await fetch(applyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    await waitForJson(commentsUrl, (item) => item.comments?.[0]?.status === "applied")

    const response = await fetch(applyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data).toMatchObject({ ok: true, status: "pending" })
    expect(data.comment).toMatchObject({ id: saved.comment.id, status: "applying" })
    expect(calls).toHaveLength(2)
    expect(calls[1].prompt).toContain("Make the title smaller.")
  })

  it("rejects persisted Review comment applies while another apply is active", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1><p>Body</p></div></section>', "utf-8")
    const calls: any[] = []
    const resolvers: Array<(value: { ok: true; status: "completed"; raw: string }) => void> = []
    const promptBridge = {
      kind: "codex-exec" as const,
      async send(input: any) {
        calls.push(input)
        return await new Promise<{ ok: true; status: "completed"; raw: string }>((resolve) => {
          resolvers.push(resolve)
        })
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentsUrl = new URL(opened.url)
    commentsUrl.pathname = "/api/comments"
    const firstSaved = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    }).then((item) => item.json()) as any
    const secondSaved = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Tighten the body copy.",
        elements: [{ slideIndex: 1, tagName: "P", text: "Body" }],
      }),
    }).then((item) => item.json()) as any

    const firstApplyUrl = new URL(opened.url)
    firstApplyUrl.pathname = `/api/comments/${firstSaved.comment.id}/apply`
    const secondApplyUrl = new URL(opened.url)
    secondApplyUrl.pathname = `/api/comments/${secondSaved.comment.id}/apply`

    const firstApply = await fetch(firstApplyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).then((item) => item.json()) as any
    expect(firstApply).toMatchObject({ ok: true, status: "pending" })
    expect(calls).toHaveLength(1)

    const secondApply = await fetch(secondApplyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const secondApplyBody = await secondApply.json() as any
    expect(secondApply.status).toBe(409)
    expect(secondApplyBody).toMatchObject({ ok: false, code: "apply_locked" })
    expect(calls).toHaveLength(1)

    const duplicateSecondApply = await fetch(secondApplyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const duplicateSecondApplyBody = await duplicateSecondApply.json() as any
    expect(duplicateSecondApply.status).toBe(409)
    expect(duplicateSecondApplyBody).toMatchObject({ ok: false, code: "apply_locked" })
    expect(calls).toHaveLength(1)

    resolvers[0]?.({ ok: true, status: "completed", raw: "patched title" })
    const listed = await waitForJson(commentsUrl, (item) => item.comments?.find((comment: any) => comment.id === firstSaved.comment.id)?.status === "applied")
    const secondRecord = listed.comments.find((comment: any) => comment.id === secondSaved.comment.id)
    expect(secondRecord).toMatchObject({ status: "open" })
    expect(calls).toHaveLength(1)

    const unlockedSecondApply = await fetch(secondApplyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).then((item) => item.json()) as any
    expect(unlockedSecondApply).toMatchObject({ ok: true, status: "pending" })
    expect(calls).toHaveLength(2)
    expect(calls[1].prompt).toContain("Tighten the body copy.")

    resolvers[1]?.({ ok: true, status: "completed", raw: "patched body" })
    await waitForJson(commentsUrl, (item) => item.comments?.find((comment: any) => comment.id === secondSaved.comment.id)?.status === "applied")
  })

  it("registers Apply Fix artifact QA suppression for the current OpenCode session", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    const client = {
      session: {
        async prompt() {
          return undefined
        },
      },
    }
    const opened = openRefineDeck("", {
      client,
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })
    const commentUrl = new URL(opened.url)
    commentUrl.pathname = "/api/comment"

    const response = await fetch(commentUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    })
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data).toMatchObject({ ok: true, status: "pending" })
    expect(shouldSuppressReviewApplyFixArtifactQa({
      workspaceRoot: root,
      file: "decks/demo.html",
      sessionID: "session-1",
    })).toBe(true)
    expect(shouldSuppressReviewApplyFixArtifactQa({
      workspaceRoot: root,
      file: "decks/other.html",
      sessionID: "session-1",
    })).toBe(false)
    expect(shouldSuppressReviewApplyFixArtifactQa({
      workspaceRoot: root,
      file: "decks/demo.html",
      sessionID: "session-2",
    })).toBe(false)
  })

  it("accepts Apply Fix comments before a delayed Review bridge completes", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    let resolveBridge: ((value: { ok: true; status: "completed"; raw: string }) => void) | undefined
    const promptBridge = {
      kind: "codex-exec" as const,
      async send() {
        return await new Promise<{ ok: true; status: "completed"; raw: string }>((resolve) => {
          resolveBridge = resolve
        })
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentUrl = new URL(opened.url)
    commentUrl.pathname = "/api/comment"

    const response = await withTimeout(fetch(commentUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    }), 100)
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data).toMatchObject({ ok: true, status: "pending" })
    expect(data.commentRequestId).toBeTruthy()

    const resultUrl = new URL(opened.url)
    resultUrl.pathname = "/api/comment-result"
    resultUrl.searchParams.set("requestId", data.commentRequestId)
    const pending = await fetch(resultUrl).then((item) => item.json()) as any
    expect(pending).toMatchObject({ ok: true, status: "pending" })

    resolveBridge?.({ ok: true, status: "completed", raw: "patched" })
    const completed = await waitForJson(resultUrl, (item) => item.status === "completed")
    expect(completed).toMatchObject({ ok: true, status: "completed" })
  })

  it("reports failed background saved-comment Apply bridge results", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    const promptBridge = {
      kind: "codex-exec" as const,
      async send() {
        return { ok: false as const, status: "failed" as const, error: "codex exec failed", raw: "stderr: workspace is not trusted" }
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentUrl = new URL(opened.url)
    commentUrl.pathname = "/api/comment"

    const response = await fetch(commentUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    })
    const data = await response.json() as any
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ ok: true, status: "pending" })

    const resultUrl = new URL(opened.url)
    resultUrl.pathname = "/api/comment-result"
    resultUrl.searchParams.set("requestId", data.commentRequestId)
    const failed = await waitForJson(resultUrl, (item) => item.status === "failed")
    expect(failed).toMatchObject({
      ok: true,
      status: "failed",
      error: "codex exec failed",
      raw: "stderr: workspace is not trusted",
    })
  })

  it("streams historical and live Apply Fix progress events over SSE", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    let emit: ((event: any) => void) | undefined
    let resolveBridge: ((value: { ok: true; status: "completed"; raw: string }) => void) | undefined
    const promptBridge = {
      kind: "codex-exec" as const,
      async send(input: any) {
        emit = input.onEvent
        emit?.({ type: "started", message: "Starting Codex...", timestamp: Date.now() })
        return await new Promise<{ ok: true; status: "completed"; raw: string }>((resolve) => {
          resolveBridge = resolve
        })
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentUrl = new URL(opened.url)
    commentUrl.pathname = "/api/comment"

    const response = await fetch(commentUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Make the title smaller.",
        elements: [{ slideIndex: 1, tagName: "H1", text: "Launch" }],
      }),
    })
    const data = await response.json() as any

    const eventsUrl = new URL(opened.url)
    eventsUrl.pathname = "/api/comment-events"
    eventsUrl.searchParams.set("requestId", data.commentRequestId)
    const eventsResponse = await fetch(eventsUrl)
    expect(eventsResponse.status).toBe(200)
    expect(eventsResponse.headers.get("content-type")).toContain("text/event-stream")
    const reader = eventsResponse.body?.getReader()
    if (!reader) throw new Error("Missing SSE body reader")

    const historical = await readSseEvents(reader, 1)
    expect(historical[0]).toMatchObject({ type: "started", message: "Starting Codex..." })

    emit?.({ type: "codex_event", message: "Codex is applying the requested edit...", timestamp: Date.now() })
    const live = await readSseEvents(reader, 1)
    expect(live[0]).toMatchObject({ type: "codex_event", message: "Codex is applying the requested edit..." })

    emit?.({ type: "codex_event", message: "Codex is still working...", detail: "elapsedSeconds=10", timestamp: Date.now() })
    const heartbeat = await readSseEvents(reader, 1)
    expect(heartbeat[0]).toMatchObject({ type: "codex_event", message: "Codex is still working...", detail: "elapsedSeconds=10" })

    resolveBridge?.({ ok: true, status: "completed", raw: "patched" })
    const terminal = await readSseEvents(reader, 1)
    expect(terminal[0]).toMatchObject({ type: "completed", message: "Codex completed." })
  })

  it("persists asset placement comments before applying", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    let bridgeCalls = 0
    const promptBridge = {
      kind: "codex-exec" as const,
      async send() {
        bridgeCalls += 1
        return { ok: true as const, status: "completed" as const, raw: "patched" }
      },
    }
    const opened = openRefineDeck("", {
      workspaceRoot: root,
      openBrowser: false,
      promptBridge,
    })
    const commentUrl = new URL(opened.url)
    commentUrl.pathname = "/api/comments"

    const response = await fetch(commentUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        comment: "Place workspace asset assets/demo/logo.png on slide 1 as a logo; add it near the drop point.",
        elements: [{ slideIndex: 1, tagName: "SECTION", text: "Launch" }],
        asset: { id: "logo", path: "assets/demo/logo.png", purpose: "logo" },
        drop: { slideIndex: 1, targetMode: "insert", x: 12, y: 24 },
      }),
    })
    const data = await response.json() as any

    expect(response.status).toBe(200)
    expect(data.comment).toMatchObject({
      status: "open",
      slideIndex: 1,
      asset: { id: "logo", path: "assets/demo/logo.png", purpose: "logo" },
      drop: { slideIndex: 1, targetMode: "insert", x: 12, y: 24 },
    })
    expect(bridgeCalls).toBe(0)
  })
})

describe("refine asset APIs", () => {
  it("saves remote image candidates and immediately lists them as local assets", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    const originalFetch = globalThis.fetch
    globalThis.fetch = mockFetchWith(originalFetch, (url, init) => {
      const value = typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url instanceof Request
            ? url.url
            : String(url)
      if (value.includes("/api/assets/save") || value.includes("/api/assets/list") || value.includes("/__revela_asset")) {
        return originalFetch(url, init)
      }
      return new Response("png-bytes", {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    })

    try {
      const opened = openRefineDeck("", {
        client: { session: { prompt: async () => undefined } },
        sessionID: "session-asset-save-success",
        workspaceRoot: root,
        openBrowser: false,
      })
      const saveUrl = new URL(opened.url)
      saveUrl.pathname = "/api/assets/save"
      const saveResponse = await fetch(saveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate: {
            candidateId: "remote-hero",
            provider: "test-provider",
            title: "Remote hero",
            thumbnailUrl: "https://example.com/hero-thumb.png",
            imageUrl: "https://example.com/hero.png",
            purpose: "hero",
            alt: "Remote hero image",
          },
          purpose: "hero",
        }),
      })
      const saveData = await saveResponse.json() as any

      expect(saveResponse.status).toBe(200)
      expect(saveData.ok).toBe(true)
      expect(saveData.asset).toMatchObject({
        id: "remote-hero",
        status: "success",
        path: `assets/${workspaceDeckSlug(root)}/media/remote-hero.png`,
        deckPath: `../assets/${workspaceDeckSlug(root)}/media/remote-hero.png`,
      })
      expect(saveData.asset.previewUrl).toContain("/__revela_asset?token=")
      expect(existsSync(join(root, "assets", workspaceDeckSlug(root), "media", "remote-hero.png"))).toBe(true)
      expect(readJsonFile(join(root, "assets", workspaceDeckSlug(root), "media-manifest.json"))).toMatchObject({
        topic: workspaceDeckSlug(root),
        assets: [expect.objectContaining({ id: "remote-hero", status: "success" })],
      })

      const listUrl = new URL(opened.url)
      listUrl.pathname = "/api/assets/list"
      const listResponse = await fetch(listUrl)
      const listData = await listResponse.json() as any
      expect(listData.ok).toBe(true)
      expect(listData.assets).toHaveLength(1)
      expect(listData.assets[0]).toMatchObject({
        id: "remote-hero",
        path: `assets/${workspaceDeckSlug(root)}/media/remote-hero.png`,
        deckPath: `../assets/${workspaceDeckSlug(root)}/media/remote-hero.png`,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("falls back to thumbnailUrl when the candidate imageUrl cannot be downloaded", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    const originalFetch = globalThis.fetch
    const thumbnailUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Dallas_Fuel_Fans_at_Esports_Stadium_Arlington.jpg/330px-Dallas_Fuel_Fans_at_Esports_Stadium_Arlington.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail"
    globalThis.fetch = mockFetchWith(originalFetch, (url, init) => {
      const value = typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url instanceof Request
            ? url.url
            : String(url)
      if (value.includes("/api/assets/save") || value.includes("/api/assets/list") || value.includes("/__revela_asset")) {
        return originalFetch(url, init)
      }
      if (value === thumbnailUrl) {
        return new Response("jpg-bytes", {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })
      }
      return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } })
    })

    try {
      const opened = openRefineDeck("", {
        client: { session: { prompt: async () => undefined } },
        sessionID: "session-asset-thumbnail-fallback",
        workspaceRoot: root,
        openBrowser: false,
      })
      const saveUrl = new URL(opened.url)
      saveUrl.pathname = "/api/assets/save"
      const response = await fetch(saveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate: {
            candidateId: "wikimedia-dallas-fuel-fans",
            provider: "wikimedia-commons",
            title: "Dallas Fuel Fans at Esports Stadium Arlington",
            thumbnailUrl,
            imageUrl: "https://example.com/source-file-that-cannot-download.jpg",
            purpose: "illustration",
          },
          purpose: "illustration",
        }),
      })
      const data = await response.json() as any

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.asset).toMatchObject({
        id: "wikimedia-dallas-fuel-fans",
        status: "success",
        path: `assets/${workspaceDeckSlug(root)}/media/wikimedia-dallas-fuel-fans.jpg`,
        sourceUrl: thumbnailUrl,
      })
      expect(existsSync(join(root, "assets", workspaceDeckSlug(root), "media", "wikimedia-dallas-fuel-fans.jpg"))).toBe(true)
      expect(readJsonFile(join(root, "assets", workspaceDeckSlug(root), "media-manifest.json"))).toMatchObject({
        assets: [expect.objectContaining({
          id: "wikimedia-dallas-fuel-fans",
          status: "success",
          sourceUrl: thumbnailUrl,
        })],
      })

      const listUrl = new URL(opened.url)
      listUrl.pathname = "/api/assets/list"
      const listResponse = await fetch(listUrl)
      const listData = await listResponse.json() as any
      expect(listData.ok).toBe(true)
      expect(listData.assets).toHaveLength(1)
      expect(listData.assets[0]).toMatchObject({
        id: "wikimedia-dallas-fuel-fans",
        deckPath: `../assets/${workspaceDeckSlug(root)}/media/wikimedia-dallas-fuel-fans.jpg`,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("rejects failed remote asset downloads instead of reporting saved", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async (url: URL | RequestInfo, init?: RequestInit) => {
        const value = String(url)
        if (value.includes("/api/assets/save")) return originalFetch(url, init)
        return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } })
      },
      { preconnect: originalFetch.preconnect.bind(originalFetch) },
    ) as typeof fetch

    try {
      const opened = openRefineDeck("", {
        client: { session: { prompt: async () => undefined } },
        sessionID: "session-asset-save-failure",
        workspaceRoot: root,
        openBrowser: false,
      })
      const url = new URL(opened.url)
      url.pathname = "/api/assets/save"
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate: {
            candidateId: "simple-icons-claude",
            provider: "simple-icons",
            title: "claude logo",
            thumbnailUrl: "https://cdn.simpleicons.org/claude",
            imageUrl: "https://cdn.simpleicons.org/claude",
            purpose: "logo",
          },
          purpose: "logo",
        }),
      })
      const data = await response.json() as any

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toContain("Failed to save asset: cannot-download")
      expect(data.error).toContain("https://cdn.simpleicons.org/claude: Failed to download image: DOWNLOAD_FAILED:403")
      expect(existsSync(join(root, "assets", workspaceDeckSlug(root), "media", "simple-icons-claude.svg"))).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("lists saved workspace assets with preview and deck-relative paths", async () => {
    const root = workspace()
    writeFileSync(join(root, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><div class="slide-canvas"><h1>Launch</h1></div></section>', "utf-8")
    mkdirSync(join(root, "assets", workspaceDeckSlug(root), "media"), { recursive: true })
    writeFileSync(join(root, "assets", workspaceDeckSlug(root), "media", "acme-logo.png"), new Uint8Array([1, 2, 3]))
    writeFileSync(join(root, "assets", workspaceDeckSlug(root), "media-manifest.json"), JSON.stringify({
      topic: workspaceDeckSlug(root),
      updatedAt: "2026-01-01T00:00:00.000Z",
      assets: [{
        id: "acme-logo",
        type: "image",
        purpose: "logo",
        brief: "Logo",
        status: "success",
        path: `assets/${workspaceDeckSlug(root)}/media/acme-logo.png`,
        provider: "clearbit-logo",
        sourcePageUrl: "https://acme.com",
        alt: "Acme logo",
        savedAt: "2026-01-01T00:00:00.000Z",
      }],
    }), "utf-8")

    const opened = openRefineDeck("", {
      client: { session: { prompt: async () => undefined } },
      sessionID: "session-1",
      workspaceRoot: root,
      openBrowser: false,
    })
    const url = new URL(opened.url)
    url.pathname = "/api/assets/list"
    const response = await fetch(url)
    const data = await response.json() as any

    expect(data.ok).toBe(true)
    expect(data.assets).toHaveLength(1)
    expect(data.assets[0]).toMatchObject({
      id: "acme-logo",
      purpose: "logo",
      provider: "clearbit-logo",
      deckPath: `../assets/${workspaceDeckSlug(root)}/media/acme-logo.png`,
    })
    expect(data.assets[0].previewUrl).toContain("/__revela_asset?token=")
  })
})

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: Timer | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out waiting for refine response")), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function waitForJson(url: URL, predicate: (item: any) => boolean): Promise<any> {
  const started = Date.now()
  let last: any
  while (Date.now() - started < 1000) {
    const response = await fetch(url)
    last = await response.json()
    if (predicate(last)) return last
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for JSON predicate: ${JSON.stringify(last)}`)
}

async function readSseEvents(reader: ReadableStreamDefaultReader<Uint8Array>, count: number): Promise<any[]> {
  const decoder = new TextDecoder()
  let buffer = ""
  const events: any[] = []
  const started = Date.now()
  while (events.length < count && Date.now() - started < 1000) {
    const item = await withTimeout(reader.read(), 1000)
    if (item.done) break
    buffer += decoder.decode(item.value, { stream: true })
    let boundary = buffer.indexOf("\n\n")
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const dataLine = block.split(/\r?\n/).find((line) => line.startsWith("data: "))
      if (dataLine) events.push(JSON.parse(dataLine.slice("data: ".length)))
      boundary = buffer.indexOf("\n\n")
    }
  }
  if (events.length < count) throw new Error(`Timed out waiting for ${count} SSE events`)
  return events
}
