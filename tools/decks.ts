import { tool } from "@opencode-ai/plugin"
import {
  createDeckSpec,
  DECKS_STATE_FILE,
  readOrCreateDecksState,
  reviewDeckState,
  upsertDeck,
  upsertSlides,
  writeDecksState,
  type DeckSpec,
  type RequiredInputs,
  type ResearchAxis,
  type SlideSpec,
} from "../lib/decks-state"

export default tool({
  description:
    `Read and update ${DECKS_STATE_FILE}, Revela's workspace deck state file. ` +
    "Use this tool instead of writing or patching the state file directly. " +
    "It stores active deck specs, per-slide content/layout/components, and computes write readiness.",
  args: {
    action: tool.schema
      .enum(["read", "init", "upsertDeck", "upsertSlides", "review", "remember"])
      .describe("Action to perform on DECKS.json."),
    slug: tool.schema.string().optional().describe("Deck slug for read/upsert/review actions."),
    summary: tool.schema.boolean().optional().describe("For read: return a compact summary instead of full state."),
    goal: tool.schema.string().optional().describe("For upsertDeck: deck goal."),
    audience: tool.schema.string().optional().describe("For upsertDeck: deck audience."),
    language: tool.schema.string().optional().describe("For upsertDeck: deck language."),
    slideCount: tool.schema.number().optional().describe("For upsertDeck: expected slide count."),
    outputPath: tool.schema.string().optional().describe("For upsertDeck: target output path, normally decks/{slug}.html."),
    design: tool.schema.string().optional().describe("For upsertDeck: active design name."),
    domain: tool.schema.string().optional().describe("For upsertDeck: active domain name."),
    memory: tool.schema.string().optional().describe("For remember: explicit user or workflow preference to store."),
    preferenceType: tool.schema.enum(["user", "workflow"]).optional().describe("For remember: which preference list to update."),
    requiredInputs: tool.schema.object({
      topicClarified: tool.schema.boolean().optional(),
      audienceClarified: tool.schema.boolean().optional(),
      slideCountDecided: tool.schema.boolean().optional(),
      languageDecided: tool.schema.boolean().optional(),
      visualStyleSelected: tool.schema.boolean().optional(),
      sourceMaterialsIdentified: tool.schema.boolean().optional(),
      researchNeedAssessed: tool.schema.boolean().optional(),
      researchFindingsRead: tool.schema.boolean().optional(),
      slidePlanConfirmed: tool.schema.boolean().optional(),
      designLayoutsFetched: tool.schema.boolean().optional(),
    }).optional().describe("For upsertDeck: checklist state. Only set true for explicit completed prerequisites."),
    researchPlan: tool.schema.array(tool.schema.object({
      axis: tool.schema.string().describe("Research axis name."),
      needed: tool.schema.boolean().describe("Whether this research axis is needed for the deck."),
      status: tool.schema.enum(["pending", "in_progress", "done", "read", "skipped"]).describe("Research status."),
      findingsFile: tool.schema.string().optional().describe("Findings file path if available."),
      notes: tool.schema.string().optional().describe("Short notes."),
    })).optional().describe("For upsertDeck: research plan."),
    slides: tool.schema.array(tool.schema.object({
      index: tool.schema.number().describe("1-based slide index."),
      title: tool.schema.string().describe("Slide title."),
      purpose: tool.schema.string().optional().describe("Narrative purpose of this slide."),
      layout: tool.schema.string().describe("Design layout name."),
      qa: tool.schema.boolean().optional().describe("Whether the slide is marked QA-relevant deck metadata."),
      components: tool.schema.array(tool.schema.string()).describe("Design components used by this slide."),
      content: tool.schema.object({
        headline: tool.schema.string().optional(),
        body: tool.schema.array(tool.schema.string()).optional(),
        bullets: tool.schema.array(tool.schema.string()).optional(),
        speakerNotes: tool.schema.string().optional(),
      }).describe("Structured slide content."),
      evidence: tool.schema.array(tool.schema.object({
        source: tool.schema.string().describe("Source file, URL, or research note."),
        quote: tool.schema.string().optional(),
        page: tool.schema.string().optional(),
        url: tool.schema.string().optional(),
      })).optional().describe("Evidence references for this slide."),
      visuals: tool.schema.array(tool.schema.object({
        id: tool.schema.string().optional(),
        purpose: tool.schema.string().optional(),
        brief: tool.schema.string().describe("Visual brief."),
        assetPath: tool.schema.string().optional(),
      })).optional().describe("Visual needs or assets for this slide."),
      status: tool.schema.enum(["planned", "ready", "written", "qa_passed", "qa_failed"]).optional().describe("Slide production status."),
      notes: tool.schema.string().optional().describe("Implementation notes for this slide."),
    })).optional().describe("For upsertSlides: complete or partial slide specs."),
  },
  async execute(args, context) {
    try {
      const workspaceRoot = context.directory ?? process.cwd()
      const state = readOrCreateDecksState(workspaceRoot)

      if (args.action === "init") {
        writeDecksState(workspaceRoot, state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, state }, null, 2)
      }

      if (args.action === "read") {
        const slug = args.slug || state.activeDeck
        if (args.summary) {
          const deck = slug ? state.decks[slug] : undefined
          return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, activeDeck: state.activeDeck, deck }, null, 2)
        }
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, state }, null, 2)
      }

      if (args.action === "upsertDeck") {
        if (!args.slug) return JSON.stringify({ ok: false, error: "slug is required for upsertDeck" })
        const existing = state.decks[args.slug]
        const deckInput: Partial<DeckSpec> & { slug: string } = {
          ...existing,
          slug: args.slug,
          goal: args.goal ?? existing?.goal ?? "",
          audience: args.audience ?? existing?.audience,
          language: args.language ?? existing?.language,
          slideCount: args.slideCount ?? existing?.slideCount,
          outputPath: args.outputPath ?? existing?.outputPath,
          theme: {
            design: args.design ?? existing?.theme?.design,
            domain: args.domain ?? existing?.theme?.domain,
          },
          requiredInputs: {
            ...(existing?.requiredInputs ?? {}),
            ...((args.requiredInputs ?? {}) as Partial<RequiredInputs>),
          } as RequiredInputs,
          researchPlan: (args.researchPlan as ResearchAxis[] | undefined) ?? existing?.researchPlan,
        }
        const next = upsertDeck(state, deckInput)
        writeDecksState(workspaceRoot, next)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, deck: next.activeDeck ? next.decks[next.activeDeck] : undefined }, null, 2)
      }

      if (args.action === "upsertSlides") {
        if (!args.slug) return JSON.stringify({ ok: false, error: "slug is required for upsertSlides" })
        if (!args.slides) return JSON.stringify({ ok: false, error: "slides are required for upsertSlides" })
        const next = upsertSlides(state, args.slug, args.slides as SlideSpec[])
        writeDecksState(workspaceRoot, next)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, deck: next.activeDeck ? next.decks[next.activeDeck] : undefined }, null, 2)
      }

      if (args.action === "review") {
        const reviewed = reviewDeckState(state, args.slug)
        writeDecksState(workspaceRoot, reviewed.state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, result: reviewed.result }, null, 2)
      }

      if (args.action === "remember") {
        const memory = args.memory?.trim()
        if (!memory) return JSON.stringify({ ok: false, error: "memory is required for remember" })
        const preferenceType = args.preferenceType ?? "user"
        const list = state.workspace.preferences[preferenceType]
        if (!list.some((entry) => entry.trim().toLowerCase() === memory.toLowerCase())) list.push(memory)
        writeDecksState(workspaceRoot, state)
        return JSON.stringify({ ok: true, path: DECKS_STATE_FILE, preferenceType, memory }, null, 2)
      }

      return JSON.stringify({ ok: false, error: `Unsupported action: ${args.action}` })
    } catch (e: any) {
      return JSON.stringify({ ok: false, error: e.message || String(e) })
    }
  },
})
