import { readFileSync } from "fs"
import { activeDesign } from "../design/designs"
import { activeDomain } from "../domain/domains"
import {
  defaultRequiredInputs,
  DECKS_STATE_FILE,
  normalizeWorkspaceDeckState,
  readOrCreateDecksState,
  upsertDeck,
  upsertSlides,
  writeDecksState,
  type SlideSpec,
} from "../decks-state"
import type { EditableDeck } from "./resolve-deck"

export interface EditDeckStatePreflightResult {
  changed: boolean
}

export function ensureEditableDeckState(workspaceRoot: string, deck: EditableDeck): EditDeckStatePreflightResult {
  let state = normalizeWorkspaceDeckState(readOrCreateDecksState(workspaceRoot), workspaceRoot)
  const active = state.activeDeck ? state.decks[state.activeDeck] : undefined
  if (active && active.slug !== deck.slug && active.outputPath !== deck.file) {
    throw new Error(`${DECKS_STATE_FILE} already points to ${active.outputPath}. Revela 0.8 expects one deck per workspace; move extra decks to a separate workspace.`)
  }
  const existing = state.decks[deck.slug]
  let changed = !existing || existing.outputPath !== deck.file

  state = upsertDeck(state, {
    ...existing,
    slug: deck.slug,
    goal: existing?.goal || `Edit existing Revela deck ${deck.slug}.`,
    audience: existing?.audience || "Existing deck viewers",
    language: existing?.language || "en",
    outputPath: deck.file,
    theme: {
      design: existing?.theme?.design || safeActiveDesign(),
      domain: existing?.theme?.domain || safeActiveDomain(),
    },
    requiredInputs: defaultRequiredInputs({
      ...existing?.requiredInputs,
      topicClarified: true,
      audienceClarified: true,
      languageDecided: true,
      visualStyleSelected: true,
      sourceMaterialsIdentified: true,
      researchNeedAssessed: true,
      researchFindingsRead: true,
      slidePlanConfirmed: true,
      designLayoutsFetched: true,
    }),
    researchPlan: existing?.researchPlan || [],
  })

  const current = state.decks[deck.slug]
  if (current.slides.length === 0) {
    state = upsertSlides(state, deck.slug, inferSlides(deck.absoluteFile))
    changed = true
  }

  writeDecksState(workspaceRoot, state)

  return {
    changed,
  }
}

function inferSlides(filePath: string): SlideSpec[] {
  const html = readFileSync(filePath, "utf-8")
  const chunks = html.match(/<section\b[\s\S]*?<\/section>/gi) || [html]
  return chunks.map((chunk, index) => {
    const title = extractTitle(chunk) || `Slide ${index + 1}`
    return {
      index: index + 1,
      title,
      purpose: "Existing HTML slide prepared for targeted visual edits.",
      layout: "existing-html",
      qa: /slide-qa=["']true["']/i.test(chunk),
      components: ["existing-html"],
      content: {
        headline: title,
        body: [extractText(chunk) || "Existing HTML slide content."],
      },
      evidence: [],
      visuals: [],
      status: "ready",
      notes: "Inferred automatically by /revela edit preflight.",
    }
  })
}

function extractTitle(html: string): string {
  const match = /<(?:h1|h2|h3|title)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|title)>/i.exec(html)
  return normalizeText(match?.[1] || "").slice(0, 160)
}

function extractText(html: string): string {
  return normalizeText(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).slice(0, 600)
}

function normalizeText(value: string): string {
  return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim()
}

function safeActiveDesign(): string {
  try {
    return activeDesign()
  } catch {
    return "aurora"
  }
}

function safeActiveDomain(): string {
  try {
    return activeDomain()
  } catch {
    return "general"
  }
}
