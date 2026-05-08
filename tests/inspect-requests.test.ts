import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createEmptyDecksState, upsertDeck, upsertSlides, workspaceDeckSlug, writeDecksState } from "../lib/decks-state"
import { openInspectDeck } from "../lib/inspect/open"
import {
  clearInspectRequestsForTests,
  completeInspectRequest,
  createInspectRequest,
  getInspectRequest,
} from "../lib/inspect/requests"
import { renderInspectorShell, stopInspectServer } from "../lib/inspect/server"
import { canonicalInspectSlideIndex } from "../lib/inspect/slide-index"
import type { InspectionPromptProjection } from "../lib/inspection-context/project"
import type { InspectionResult } from "../lib/inspection-context/result"

describe("inspect pending request store", () => {
  afterEach(() => {
    clearInspectRequestsForTests()
    stopInspectServer()
  })

  it("tracks pending requests and accepts one structured result", () => {
    createInspectRequest({ requestId: "inspect-1", projection: projection(), deckVersion: "v1" })

    expect(getInspectRequest("inspect-1")?.status).toBe("pending")
    const completed = completeInspectRequest("inspect-1", result("wrong-id"))

    expect(completed.status).toBe("completed")
    expect(completed.result?.requestId).toBe("inspect-1")
    expect(getInspectRequest("inspect-1")?.result?.cards.source.status).toBe("supported")
  })

  it("rejects unknown or already completed requests", () => {
    expect(() => completeInspectRequest("missing", result("missing"))).toThrow("Unknown inspection request")

    createInspectRequest({ requestId: "inspect-2", projection: projection(), deckVersion: "v1" })
    completeInspectRequest("inspect-2", result("inspect-2"))

    expect(() => completeInspectRequest("inspect-2", result("inspect-2"))).toThrow("not pending")
  })

  it("expires stale pending requests", () => {
    createInspectRequest({ requestId: "inspect-3", projection: projection(), deckVersion: "v1" })
    const request = getInspectRequest("inspect-3")!
    request.createdAt = Date.now() - 91_000

    expect(getInspectRequest("inspect-3")?.status).toBe("expired")
  })
})

describe("inspect browser shell", () => {
  it("uses edit-style references with async two-stage Source/Purpose cards", () => {
    const html = renderInspectorShell("token")

    expect(html).toContain("/api/inspect-result")
    expect(html).toContain("Preprocessed")
    expect(html).toContain("Generated")
    expect(html).toContain("setLocked(true)")
    expect(html).toContain("Selection binding: starting")
    expect(html).toContain("Ctrl/Cmd-click to reference elements")
    expect(html).toContain("Purpose")
    expect(html).toContain("Source")
    expect(html).toContain("renderSource")
    expect(html).toContain("Inspect Selection")
    expect(html).toContain("class=\"hitbox\"")
    expect(html).toContain("REFERENCE_COLORS")
    expect(html).toContain("targetFromPointer")
    expect(html).toContain("toggleReference")
    expect(html).toContain("renderReferenceOutlines")
    expect(html).not.toContain("Text/Block/Card/Slide")
    expect(html).toContain("renderSelectionPreview")
    expect(html).toContain("renderSelectionOutline")
    expect(html).not.toContain("event.key === '['")
    expect(html).not.toContain("event.key === ']'")
    expect(html).not.toContain("event.key === 'Enter'")
    expect(html).toContain("event.key === 'Escape'")
    expect(html).toContain("Selection binding failed")
    expect(html).toContain("initInspectErrorPrelude")
    expect(html).toContain("Inspect shell error")
    expect(html).toContain("unhandledrejection")
    expect(html).toContain("initializeInspectShell")
    expect(html).toContain("bindingState")
    expect(html).toContain("window.__revelaInspectDebug")
    expect(html).toContain("startBindingLoop")
    expect(html).toContain("retryAttachDeckHandlers")
    expect(html).toContain("data-revela-inspect-bound")
    expect(html).toContain("setInterval")
    expect(html).toContain("pointerdown")
    expect(html).toContain("event.ctrlKey && !event.metaKey")
    expect(html).toContain("join(String.fromCharCode(10))")
    expect(html).not.toContain("join('\n')")
    expect(html).toContain("replace(/\\s+/g, ' ')")
    expect(html).toContain("collectReferenceSnapshot")
    expect(html).toContain("collectPayload")
    expect(html).toContain("canonicalSlideRoot")
    expect(html).toContain("slideRoots")
    expect(html).toContain("getAttribute('data-slide-index')")
    expect(html).toContain("Legacy decks may still carry 0-based data-index")
    expect(html).not.toContain("getAttribute('data-slide-index') || slide.getAttribute('data-index')")
    expect(html).not.toContain("closest('[data-slide-index], [data-index]')")
  })
})

describe("inspect HTTP request lifecycle", () => {
  afterEach(() => {
    clearInspectRequestsForTests()
    stopInspectServer()
  })

  it("returns deterministic preprocess before the LLM prompt resolves", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "revela-inspect-"))
    try {
      mkdirSync(join(workspaceRoot, "decks"), { recursive: true })
      writeFileSync(join(workspaceRoot, "decks", "demo.html"), '<section class="slide" data-slide-index="1"><h1>Launch</h1><h2>Conversion improved 18%</h2></section>')

      const slug = workspaceDeckSlug(workspaceRoot)
      let state = createEmptyDecksState()
      state = upsertDeck(state, {
        slug,
        goal: "Approve launch",
        audience: "Executive team",
        outputPath: "decks/demo.html",
      })
      state = upsertSlides(state, slug, [{
        index: 1,
        title: "Launch",
        purpose: "Show evidence for launch approval",
        narrativeRole: "evidence",
        layout: "two-col",
        components: ["card"],
        content: { headline: "Conversion improved 18%" },
        evidence: [{ source: "Pilot dashboard", sourcePath: "sources/pilot.csv", quote: "Conversion improved 18%" }],
        status: "ready",
      }])
      writeDecksState(workspaceRoot, state)

      let promptCalled = false
      const client = {
        session: {
          prompt: () => {
            promptCalled = true
            return new Promise(() => {})
          },
        },
      }
      const opened = openInspectDeck("", { client, sessionID: "session-1", workspaceRoot, openBrowser: false })
      const url = new URL(opened.url)
      url.pathname = "/api/inspect"

      const response = await withTimeout(fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot: { slideIndex: 1, text: "Conversion improved 18%", tagName: "H2", classList: [] } }),
      }), 100)
      const data = await response.json() as any

      expect(promptCalled).toBe(true)
      expect(data.ok).toBe(true)
      expect(data.status).toBe("pending")
      expect(data.preprocess.cards.purpose.status).toBe("clear")
      expect(data.preprocess.cards.source.status).toBe("supported")
      expect(getInspectRequest(data.requestId)?.status).toBe("pending")
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })
})

describe("inspect slide index contract", () => {
  it("uses 1-based data-slide-index as the canonical slide identity", () => {
    expect(canonicalInspectSlideIndex({ dataSlideIndex: "4", domOrdinal: 2 })).toBe(4)
  })

  it("falls back to 1-based DOM order for legacy data-index decks", () => {
    expect(canonicalInspectSlideIndex({ dataSlideIndex: null, domOrdinal: 3 })).toBe(4)
  })
})

function projection(): InspectionPromptProjection {
  return {
    version: 1,
    deck: { slug: "demo", goal: "Approve launch" },
    selectedElement: { slideIndex: 1, text: "Conversion improved 18%", tagName: "H2", classList: [] },
    match: {
      confidence: "high",
      reason: "exact text match",
      slide: { index: 1, title: "Launch", purpose: "Show evidence", narrativeRole: "evidence" },
      claim: { id: "slide-1-headline", text: "Conversion improved 18%", origin: "headline", evidenceSensitive: true, evidenceSupport: "supported", evidenceBindingIds: [], caveats: [] },
    },
    cards: {
      source: { evidence: [], missingSourceGaps: [], weakSourceGaps: [] },
      evidence: { matchedClaim: "Conversion improved 18%", evidenceSupport: "supported", traces: [], gaps: [] },
      caveats: { caveats: [] },
      objective: { slidePurpose: "Show evidence", narrativeRole: "evidence", deckGoal: "Approve launch" },
      appendix: { candidates: [], relatedRisks: [], relatedObjections: [] },
      artifacts: { selectedClaimId: "slide-1-headline", artifacts: [] },
    },
  }
}

function result(requestId: string): InspectionResult {
  return {
    version: 1,
    requestId,
    status: "success",
    selectedText: "Conversion improved 18%",
    slide: { index: 1, title: "Launch" },
    matchConfidence: "high",
    cards: {
      purpose: { status: "clear", role: "evidence", rationale: "This supports the launch decision.", whyItMatters: "It matters to the approval decision." },
      source: { status: "supported", matchedClaim: "Conversion improved 18%", sources: [{ source: "Pilot dashboard" }], warnings: [], gaps: [], caveats: [], rationale: "Evidence supports the selected claim." },
    },
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: Timer | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out waiting for inspect response")), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
