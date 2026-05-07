/**
 * revela — Core OpenCode Plugin
 *
 * Architecture: enable/disable mode + single /revela command (DCP style)
 *
 * Responsibilities:
 * 1. On load: seed built-in designs/domains + build initial _active-prompt.md
 * 2. config hook: register /revela command (empty template, no .md file needed)
 * 3. command.execute.before: route all sub-commands to lib/commands/ handlers
 * 4. tool: expose revela-designs + revela-domains tools to LLM
 * 5. experimental.chat.system.transform: inject three-layer prompt when enabled
 * 6. chat.message: intercept @-referenced / pasted binary files → extract text → replace FilePart with TextPart
 * 7. tool.execute.before: intercept read on DOCX/PPTX/XLSX → preRead()
 * 8. tool.execute.after: intercept read on PDF/images → postRead(); run static compliance after deck writes/patches/edits
 */

import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { extname, basename, join } from "path"
import { tmpdir } from "os"
import { seedBuiltinDesigns } from "./lib/design/designs"
import { seedBuiltinDomains } from "./lib/domain/domains"
import { buildPrompt } from "./lib/prompt-builder"
import { ACTIVE_PROMPT_FILE } from "./lib/config"
import { ctx } from "./lib/ctx"
import { preRead } from "./lib/read-hooks"
import { postRead } from "./lib/read-hooks"
import { extractPdfText } from "./lib/read-hooks/extractors/pdf"
import { createOfficeReadView } from "./lib/read-hooks/office-read-view"
import { OFFICE_EXTENSIONS, IMAGE_EXTENSIONS, formatExtractedText } from "./lib/read-hooks/dispatch"
import { handleHelp } from "./lib/commands/help"
import { handleEnable } from "./lib/commands/enable"
import { handleDisable } from "./lib/commands/disable"
import {
  handleDesignsList,
  handleDesignsActivate,
  handleDesignsAdd,
  handleDesignsRemove,
} from "./lib/commands/designs"
import {
  handleDomainsList,
  handleDomainsActivate,
  handleDomainsAdd,
  handleDomainsRemove,
} from "./lib/commands/domains"
import { handlePdf } from "./lib/commands/pdf"
import { buildPptxNotesPrompt, handlePptx, parsePptxArgs, resolvePptxDeck } from "./lib/commands/pptx"
import { handleEdit } from "./lib/commands/edit"
import { handleInspect } from "./lib/commands/inspect"
import { handleRefine } from "./lib/commands/refine"
import { formatDeckHtmlContractReport, validateDeckHtmlContract } from "./lib/deck-html/contract"
import { ensureEditableDeckOpenForChange } from "./lib/edit/open"
import { hasLiveEditorSessionForFile } from "./lib/edit/server"
import { handleDesignsPreview } from "./lib/commands/designs-preview"
import {
  parseDesignsNewArgs,
  buildDesignsNewPrompt,
  parseDesignsEditArgs,
  buildDesignsEditPrompt,
} from "./lib/commands/designs-new"
import { buildInitPrompt } from "./lib/commands/init"
import { handleNarrative } from "./lib/commands/narrative"
import { parseRememberArgs, buildRememberPrompt } from "./lib/commands/remember"
import { buildDeckPrompt, buildDeckReviewPrompt, buildReviewPrompt } from "./lib/commands/review"
import {
  extractDeckHtmlTargetsFromPatch,
  extractPatchTextArg,
  isDeckHtmlPath,
  setPatchTextArg,
} from "./lib/decks-memory"
import {
  buildDecksStatePromptLayer,
  checkDeckStateWriteReadiness,
  DECKS_STATE_FILE,
  extractDecksStateTargetsFromPatch,
  hasDecksState,
  isDecksStatePath,
} from "./lib/decks-state"
import decksTool from "./tools/decks"
import designsAuthorTool from "./tools/designs-author"
import designsTool from "./tools/designs"
import domainsTool from "./tools/domains"
import mediaBatchSaveTool from "./tools/media-batch-save"
import mediaSaveTool from "./tools/media-save"
import researchImagesListTool from "./tools/research-images-list"
import researchSaveTool from "./tools/research-save"
import inspectionContextTool from "./tools/inspection-context"
import inspectionResultTool from "./tools/inspection-result"
import workspaceScanTool from "./tools/workspace-scan"
import extractDocumentMaterialsTool from "./tools/extract-document-materials"
import qaTool from "./tools/qa"
import pdfTool from "./tools/pdf"
import pptxTool from "./tools/pptx"
import createEditTool from "./tools/edit"
import { RESEARCH_PROMPT, RESEARCH_AGENT_SIGNATURE } from "./lib/agents/research-prompt"
import { NARRATIVE_REVIEWER_PROMPT, NARRATIVE_REVIEWER_SIGNATURE } from "./lib/agents/narrative-reviewer-prompt"
import { formatReport, runComplianceQA } from "./lib/qa"
import { extractDesignClasses } from "./lib/design/designs"
import { log, childLog } from "./lib/log"

// OpenCode internal agent signatures — used to skip system prompt injection
// for built-in system agents (title, summary, compaction).
const INTERNAL_AGENT_SIGNATURES = [
  "You are a title generator",
  "You are a helpful AI assistant tasked with summarizing conversations",
  "Summarize what was done in this conversation",
]

function appendToolResult(output: any, text: string): void {
  if (typeof output.output === "string") {
    output.output = (output.output ? output.output + "\n\n" : "") + text
    return
  }

  const existing = output.result ?? ""
  output.result = (existing ? existing + "\n\n" : "") + text
}

function extractEditFilePath(args: any): string {
  return args?.filePath ?? args?.file_path ?? args?.path ?? args?.file ?? ""
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Display a message in the conversation UI without triggering LLM
 * and without polluting future context. Pattern from DCP.
 */
async function sendIgnoredMessage(
  client: any,
  sessionID: string,
  text: string,
): Promise<void> {
  try {
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text, ignored: true }],
      },
    })
  } catch (e) {
    log.error("sendIgnoredMessage failed", { error: e instanceof Error ? e.message : String(e) })
  }
}

// ── Plugin ─────────────────────────────────────────────────────────────────

const server: Plugin = (async (pluginCtx) => {
  const client = pluginCtx.client
  const workspaceRoot = pluginCtx.directory
  const blockedDeckWrites = new Map<string, string>()
  const blockedDeckPatches = new Map<string, string>()

  async function appendComplianceReport(filePath: string, output: any): Promise<void> {
    if (!isDeckHtmlPath(filePath)) return

    try {
      let vocabulary
      try {
        vocabulary = extractDesignClasses()
      } catch {
        // Design may not be installed or may have no markers — skip compliance.
      }

      const report = runComplianceQA(filePath, vocabulary)
      if (report.totalIssues === 0) return

      appendToolResult(
        output,
        "---\n\n**[revela design compliance]** Static check completed:\n\n" +
        formatReport(report)
      )
    } catch (e) {
      childLog("compliance").warn("static compliance failed", {
        filePath,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  async function appendDeckHtmlContractReport(filePath: string, output: any): Promise<void> {
    if (!isDeckHtmlPath(filePath)) return

    try {
      const report = validateDeckHtmlContract(workspaceRoot, filePath)
      if (report.status === "valid" || report.status === "skipped") return

      appendToolResult(
        output,
        "---\n\n**[revela deck HTML contract]** Slide identity check failed:\n\n" +
        formatDeckHtmlContractReport(report) +
        "\n\nFix every `<section class=\"slide\">` to use the matching 1-based `data-slide-index` from DECKS.json before inspection or export."
      )
    } catch (e) {
      childLog("deck-contract").warn("deck HTML contract report failed", {
        filePath,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function extractSessionID(input: any): string {
    return input?.sessionID ?? input?.session?.id ?? input?.context?.sessionID ?? ""
  }

  function ensureEditorOpenAfterDeckChange(filePath: string, sessionID: string): void {
    if (!isDeckHtmlPath(filePath) || !sessionID) return

    try {
      ensureEditableDeckOpenForChange("", {
        client,
        sessionID,
        workspaceRoot,
      })
    } catch (e) {
      childLog("edit").warn("failed to ensure visual editor after deck change", {
        filePath,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // ── Startup: seed + build initial prompt ────────────────────────────────
  try {
    seedBuiltinDesigns()
    seedBuiltinDomains()
    buildPrompt()
    log.info("revela initialized", { promptFile: ACTIVE_PROMPT_FILE })
  } catch (e) {
    log.error("startup failed — prompt may not be injected", { error: e instanceof Error ? e.message : String(e) })
  }

  return {
    // ── Register /revela command + Revela subagents ───────────────────────
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {}
      opencodeConfig.command["revela"] = {
        template: "",
        description: "Revela — AI slide deck generator (enable/disable, manage designs & domains)",
      }

      // Register the research subagent.
      // mode: "subagent" — not shown in Tab cycle, invoked via @revela-research or Task tool.
      // Permissions: read-only on edit/bash; write allowed to create researches/ files.
      // No model override — inherits from the calling primary agent.
      opencodeConfig.agent ??= {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opencodeConfig.agent["revela-research"] = {
        description: "Revela research agent — searches and collects raw materials for presentations",
        mode: "subagent",
        prompt: RESEARCH_PROMPT,
        permission: {
          edit: "deny",
          bash: {
            "*": "deny",
            "ls *": "allow",
            "ls": "allow",
          },
          webfetch: "allow",
        } as any,
      }
      // Give revela-research explicit websearch allow (overrides global deny below)
      ;(opencodeConfig.agent["revela-research"].permission as any).websearch = "allow"

      // Register the read-only narrative reviewer subagent.
      // It can inspect workspace state and referenced files, but cannot write or browse.
      opencodeConfig.agent["revela-narrative-reviewer"] = {
        description: "Revela narrative reviewer — read-only critique of narrative brief and slide-plan alignment",
        mode: "subagent",
        prompt: NARRATIVE_REVIEWER_PROMPT,
        permission: {
          edit: "deny",
          bash: {
            "*": "deny",
            "ls *": "allow",
            "ls": "allow",
          },
          webfetch: "deny",
          websearch: "deny",
        } as any,
      }

      // Block websearch for the primary agent globally.
      // permission.ask hook is not triggered by OpenCode (no R.trigger call in binary).
      // tool.execute.before throw is swallowed (trigger().catch(()=>{})).
      // The only working mechanism is the config-level permission ruleset.
      // revela-research agent overrides this with websearch: "allow" above.
      opencodeConfig.permission ??= {}
      if (!(opencodeConfig.permission as Record<string, unknown>)["websearch"]) {
        ;(opencodeConfig.permission as Record<string, unknown>)["websearch"] = "deny"
      }

      // Allow read access to OS tmp dir for revela-extracted temp files.
      // pre-read.ts writes DOCX/PPTX/XLSX extracted text to os.tmpdir(), then redirects
      // args.filePath to that temp file. Without this, the read tool triggers an
      // external_directory permission prompt (default: "ask") on every binary file extraction.
      const tmp = tmpdir()
      const perm = opencodeConfig.permission as Record<string, unknown>
      if (typeof perm["external_directory"] !== "string") {
        perm["external_directory"] ??= {}
        ;(perm["external_directory"] as Record<string, unknown>)[`${tmp}/**`] = "allow"
      }
    },

    // ── Route all sub-commands to lib/commands/ handlers ──────────────────
    "command.execute.before": async (input, output) => {
      if (input.command !== "revela") return

      const sessionID: string = input.sessionID ?? ""
      const args = (input.arguments ?? "").trim().split(/\s+/).filter(Boolean) as string[]
      const sub = args[0]?.toLowerCase() ?? ""
      const param = args.slice(1).join(" ")

      const send = (text: string) => sendIgnoredMessage(client, sessionID, text)

      if (!sub) {
        await handleHelp(send)
        throw new Error("__REVELA_STATUS_HANDLED__")
      }
      if (sub === "enable") {
        await handleEnable(send)
        throw new Error("__REVELA_ENABLE_HANDLED__")
      }
      if (sub === "disable") {
        await handleDisable(send)
        throw new Error("__REVELA_DISABLE_HANDLED__")
      }
      if (sub === "init") {
        buildPrompt({ mode: "narrative" })
        output.parts.length = 0
        output.parts.push({
          type: "text",
          text: buildInitPrompt({ exists: hasDecksState(workspaceRoot), workspaceRoot }),
        } as any)
        return
      }
      if (sub === "remember") {
        const parsed = parseRememberArgs(param)
        if (!parsed.ok) {
          await send(parsed.error)
          throw new Error("__REVELA_REMEMBER_USAGE_HANDLED__")
        }
        buildPrompt({ mode: "narrative" })
        output.parts.length = 0
        output.parts.push({
          type: "text",
          text: buildRememberPrompt({ memory: parsed.memory, exists: hasDecksState(workspaceRoot) }),
        } as any)
        return
      }
      if (sub === "review") {
        if (param) {
          await send("`/revela review` no longer accepts a deck name. It reviews the current workspace narrative. Use `/revela deck --review` for deck/artifact readiness.")
          throw new Error("__REVELA_REVIEW_USAGE_HANDLED__")
        }
        buildPrompt({ mode: "narrative" })
        output.parts.length = 0
        output.parts.push({
          type: "text",
          text: buildReviewPrompt({ exists: hasDecksState(workspaceRoot), workspaceRoot }),
        } as any)
        return
      }
      if (sub === "narrative") {
        if (param) {
          await send("`/revela narrative` does not accept arguments. It shows the current read-only narrative map.")
          throw new Error("__REVELA_NARRATIVE_USAGE_HANDLED__")
        }
        await handleNarrative({ workspaceRoot }, send)
        throw new Error("__REVELA_NARRATIVE_HANDLED__")
      }
      if (sub === "deck") {
        if (param && param !== "--review") {
          await send("Usage: `/revela deck` starts approved-narrative deck handoff; `/revela deck --review` reviews deck/artifact readiness.")
          throw new Error("__REVELA_DECK_USAGE_HANDLED__")
        }
        if (!param) {
          buildPrompt({ mode: "deck-render" })
          output.parts.length = 0
          output.parts.push({
            type: "text",
            text: buildDeckPrompt({ exists: hasDecksState(workspaceRoot), workspaceRoot }),
          } as any)
          return
        }
        buildPrompt({ mode: "deck-render" })
        output.parts.length = 0
        output.parts.push({
          type: "text",
          text: buildDeckReviewPrompt({ exists: hasDecksState(workspaceRoot), workspaceRoot }),
        } as any)
        return
      }
      if (sub === "refine") {
        if (param) {
          await send("`/revela refine` does not accept a target. It opens the only HTML deck in `decks/`.")
          throw new Error("__REVELA_REFINE_USAGE_HANDLED__")
        }
        await handleRefine({ client, sessionID, workspaceRoot }, send)
        throw new Error("__REVELA_REFINE_HANDLED__")
      }
      if (sub === "edit") {
        if (param) {
          await send("`/revela edit` no longer accepts a target. It opens the only HTML deck in `decks/`.")
          throw new Error("__REVELA_EDIT_USAGE_HANDLED__")
        }
        await handleEdit({ client, sessionID, workspaceRoot }, send)
        throw new Error("__REVELA_EDIT_HANDLED__")
      }
      if (sub === "inspect") {
        if (param) {
          await send("`/revela inspect` does not accept a target. It opens the only HTML deck in `decks/`.")
          throw new Error("__REVELA_INSPECT_USAGE_HANDLED__")
        }
        await handleInspect({ client, sessionID, workspaceRoot }, send)
        throw new Error("__REVELA_INSPECT_HANDLED__")
      }
      if (sub === "designs" && !param) {
        await handleDesignsList(send)
        throw new Error("__REVELA_DESIGNS_LIST_HANDLED__")
      }
      if (sub === "designs" && param) {
        await handleDesignsActivate(param, send)
        throw new Error("__REVELA_DESIGNS_ACTIVATE_HANDLED__")
      }
      if (sub === "domains" && !param) {
        await handleDomainsList(send)
        throw new Error("__REVELA_DOMAINS_LIST_HANDLED__")
      }
      if (sub === "domains" && param) {
        await handleDomainsActivate(param, send)
        throw new Error("__REVELA_DOMAINS_ACTIVATE_HANDLED__")
      }
      if (sub === "designs-add") {
        await handleDesignsAdd(param, send)
        throw new Error("__REVELA_DESIGNS_ADD_HANDLED__")
      }
      if (sub === "designs-new") {
        const parsed = parseDesignsNewArgs(param)
        if (!parsed.ok) {
          await send(parsed.error)
          throw new Error("__REVELA_DESIGNS_NEW_USAGE_HANDLED__")
        }
        output.parts.length = 0
        output.parts.push({
          type: "text",
          text: buildDesignsNewPrompt({ name: parsed.name, base: parsed.base }),
        } as any)
        return
      }
      if (sub === "designs-edit") {
        const parsed = parseDesignsEditArgs(param)
        if (!parsed.ok) {
          await send(parsed.error)
          throw new Error("__REVELA_DESIGNS_EDIT_USAGE_HANDLED__")
        }
        output.parts.length = 0
        output.parts.push({
          type: "text",
          text: buildDesignsEditPrompt({ name: parsed.name }),
        } as any)
        return
      }
      if (sub === "designs-preview") {
        await handleDesignsPreview(param, send)
        throw new Error("__REVELA_DESIGNS_PREVIEW_HANDLED__")
      }
      if (sub === "domains-add") {
        await handleDomainsAdd(param, send)
        throw new Error("__REVELA_DOMAINS_ADD_HANDLED__")
      }
      if (sub === "designs-rm") {
        await handleDesignsRemove(param, send)
        throw new Error("__REVELA_DESIGNS_RM_HANDLED__")
      }
      if (sub === "domains-rm") {
        await handleDomainsRemove(param, send)
        throw new Error("__REVELA_DOMAINS_RM_HANDLED__")
      }
      if (sub === "pdf") {
        await handlePdf(param, send, workspaceRoot)
        throw new Error("__REVELA_PDF_HANDLED__")
      }
      if (sub === "pptx") {
        const args = parsePptxArgs(param)
        if (args.notes) {
          try {
            const deck = resolvePptxDeck(workspaceRoot, args.filePath)
            output.parts.length = 0
            output.parts.push({ type: "text", text: buildPptxNotesPrompt(deck) } as any)
            return
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            await send(`**PPTX export failed**\n\n\`\`\`\n${msg}\n\`\`\``)
            throw new Error("__REVELA_PPTX_HANDLED__")
          }
        }
        await handlePptx(param, send, workspaceRoot)
        throw new Error("__REVELA_PPTX_HANDLED__")
      }

      await send(`**Unknown sub-command:** \`${sub}\`\nRun \`/revela\` to see available commands.`)
      throw new Error("__REVELA_UNKNOWN_HANDLED__")
    },

    // ── LLM tools: designs, domains, research, document materials, qa ─────
    tool: {
      "revela-decks": decksTool,
      "revela-designs": designsTool,
      "revela-designs-author": designsAuthorTool,
      "revela-domains": domainsTool,
      "revela-media-batch-save": mediaBatchSaveTool,
      "revela-media-save": mediaSaveTool,
      "revela-research-images-list": researchImagesListTool,
      "revela-research-save": researchSaveTool,
      "revela-inspection-context": inspectionContextTool,
      "revela-inspection-result": inspectionResultTool,
      "revela-workspace-scan": workspaceScanTool,
      "revela-extract-document-materials": extractDocumentMaterialsTool,
      "revela-qa": qaTool,
      "revela-pdf": pdfTool,
      "revela-pptx": pptxTool,
      "revela-edit": createEditTool({ client, workspaceRoot }),
    },

    // ── chat.message: intercept @-referenced / pasted binary files ────────
    // When user uses @ or pastes a file, OpenCode injects it as a FilePart
    // directly — the read tool is never called, so tool.execute.before/after
    // hooks don't fire. This hook intercepts FileParts before LLM sees them.
    //
    // DOCX/PPTX/XLSX/PDF → extract text/read view → replace with TextPart
    // Images              → replace with TextPart hint (LLM can use read tool)
    "chat.message": async (input, output) => {
      if (!ctx.enabled) return

      for (let i = 0; i < output.parts.length; i++) {
        const part = output.parts[i] as any
        if (part.type !== "file") continue
        if (part.source?.type !== "file") continue

        const filePath: string = part.source.path
        const ext = extname(filePath).toLowerCase()
        const name = basename(filePath)

        try {
          if (OFFICE_EXTENSIONS.has(ext)) {
            const text = await createOfficeReadView(filePath, process.cwd())
            output.parts[i] = {
              ...part,
              type: "text",
              text,
            } as any
          } else if (ext === ".pdf") {
            const buf = readFileSync(filePath)
            const text = await extractPdfText(buf)
            output.parts[i] = {
              ...part,
              type: "text",
              text: formatExtractedText(filePath, text),
            } as any
          } else if (IMAGE_EXTENSIONS.has(ext)) {
            output.parts[i] = {
              ...part,
              type: "text",
              text: `[Image: ${name} — use the read tool if you need to view this image]`,
            } as any
          }
        } catch (e) {
          childLog("chat.message").warn("failed to process file", {
            file: name,
            error: e instanceof Error ? e.message : String(e),
          })
          // Keep original FilePart on failure — graceful degradation
        }
      }
    },

    // ── Inject three-layer prompt when enabled ─────────────────────────────
    // Skip injection for:
    //   1. Revela subagents (they have focused prompts)
    //   2. OpenCode internal agents (title, summary, compaction)
    "experimental.chat.system.transform": async (input, output) => {
      if (!ctx.enabled) return
      try {
        // Detect which agent is running by fingerprinting output.system content.
        // The plugin API does not expose agent name on this hook's input.
        const systemText = output.system.join("\n")

        // Skip revela-research subagent — it has its own research prompt.
        // Also mark ctx so tool.execute.before can allow websearch for research agents.
        if (systemText.includes(RESEARCH_AGENT_SIGNATURE)) {
          ctx.isResearchAgent = true
          return
        }
        ctx.isResearchAgent = false

        // Skip revela-narrative-reviewer subagent — it is read-only critique,
        // not a deck-writing agent and not a research agent.
        if (systemText.includes(NARRATIVE_REVIEWER_SIGNATURE)) return

        // Skip OpenCode internal system agents (title generator, summary, compaction)
        if (INTERNAL_AGENT_SIGNATURES.some((sig) => systemText.includes(sig))) return

        let prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")
        try {
          const stateLayer = buildDecksStatePromptLayer(workspaceRoot)
          if (stateLayer) prompt += "\n\n" + stateLayer
        } catch (e) {
          childLog("decks-state").warn("failed to load DECKS.json state", {
            error: e instanceof Error ? e.message : String(e),
          })
        }
        if (output.system.length > 0) {
          output.system[output.system.length - 1] += "\n\n" + prompt
        } else {
          output.system.push(prompt)
        }
      } catch (e) {
        log.error("failed to inject system prompt", { error: e instanceof Error ? e.message : String(e) })
        // Surface the failure in the system prompt so the LLM and user are aware.
        // This prevents a silent "revela enabled but not working" scenario.
        output.system.push(
          "\n\n[REVELA ERROR: Failed to load the slide generation prompt. " +
          "Run /revela disable then /revela enable to reinitialize.]"
        )
      }
    },

    // ── Pre-tool processing ────────────────────────────────────────────────
    // - read: intercept DOCX/PPTX/XLSX before read executes.
    // - write/apply_patch: gate decks/*.html on DECKS.json readiness.
    "tool.execute.before": async (input, output) => {
      log.info("[hook] tool.execute.before fired", { tool: input.tool, enabled: ctx.enabled, isResearch: ctx.isResearchAgent })
      if (!ctx.enabled) return

      if (input.tool === "write") {
        const filePath: string = (output.args as any)?.filePath ?? ""
        if (isDecksStatePath(filePath)) {
          const blockedDir = join(workspaceRoot, ".opencode", "revela", "blocked-writes")
          mkdirSync(blockedDir, { recursive: true })
          const blockedPath = join(blockedDir, "DECKS-json-direct-write.blocked.md")
          const blocker = `${DECKS_STATE_FILE} is a controlled Revela state file. Use the revela-decks tool instead of write/apply_patch.`
          ;(output.args as any).filePath = blockedPath
          ;(output.args as any).content = `# Revela Blocked State Write

The attempted write to \`${filePath}\` was blocked.

Reason: ${blocker}

Next step: use \`revela-decks\` with action \`init\`, \`upsertDeck\`, \`upsertSlides\`, or \`review\`.
`
          blockedDeckWrites.set(filePath, blocker)
          childLog("decks-state").warn("blocked direct DECKS.json write", { filePath, blockedPath })
          return
        }
        if (!isDeckHtmlPath(filePath)) return
        if (hasLiveEditorSessionForFile(workspaceRoot, filePath)) return

        const readiness = checkDeckStateWriteReadiness(workspaceRoot, filePath) ?? {
          ready: false,
          slug: basename(filePath, ".html") || "deck",
          blocker: `No ${DECKS_STATE_FILE} exists. Use revela-decks init/upsertDeck/upsertSlides/review before writing deck HTML.`,
          blockers: [`No ${DECKS_STATE_FILE} exists.`],
        }
        if (readiness.ready) return

        const blockedDir = join(workspaceRoot, ".opencode", "revela", "blocked-writes")
        mkdirSync(blockedDir, { recursive: true })
        const blockedPath = join(blockedDir, `${readiness.slug}.blocked.md`)
        ;(output.args as any).filePath = blockedPath
        ;(output.args as any).content = `# Revela Blocked Deck Write

The attempted write to \`${filePath}\` was blocked.

Reason: ${readiness.blocker}

Next step: use \`revela-decks\` or \`/revela review\` to update ${DECKS_STATE_FILE}, then write only after the matching deck has \`writeReadiness.status\` set to \`ready\` and no blockers.
`
        blockedDeckWrites.set(filePath, readiness.blocker)
        childLog("decks-memory").warn("blocked deck write", { filePath, blockedPath, blocker: readiness.blocker })
        return
      }

      if (input.tool === "apply_patch") {
        const args = output.args as Record<string, unknown>
        const patchText = extractPatchTextArg(args)
        if (!patchText) return

        const stateTargets = extractDecksStateTargetsFromPatch(patchText)
        if (stateTargets.length > 0) {
          const blockedDir = join(workspaceRoot, ".opencode", "revela", "blocked-writes")
          mkdirSync(blockedDir, { recursive: true })
          const blockedRelativePath = `.opencode/revela/blocked-writes/DECKS-json-direct-patch-${Date.now()}.blocked.md`
          const blocker = `${DECKS_STATE_FILE} is a controlled Revela state file. Use the revela-decks tool instead of write/apply_patch.`
          const blockedPatch = `*** Begin Patch
*** Add File: ${blockedRelativePath}
+# Revela Blocked State Patch
+
+The attempted patch touching \`${stateTargets.join(", ")}\` was blocked.
+
+Reason: ${blocker}
+
+Next step: use \`revela-decks\` with action \`init\`, \`upsertDeck\`, \`upsertSlides\`, or \`review\`.
*** End Patch`
          setPatchTextArg(args, blockedPatch)
          blockedDeckPatches.set(blockedRelativePath, blocker)
          childLog("decks-state").warn("blocked direct DECKS.json patch", { targets: stateTargets, blockedPath: blockedRelativePath })
          return
        }

        const targets = extractDeckHtmlTargetsFromPatch(patchText)
        if (targets.length === 0) return
        if (targets.every((target) => hasLiveEditorSessionForFile(workspaceRoot, target))) return

        const blocked = targets
          .map((target) => ({
            target,
            readiness: checkDeckStateWriteReadiness(workspaceRoot, target) ?? {
              ready: false,
              slug: basename(target, ".html") || "deck",
              blocker: `No ${DECKS_STATE_FILE} exists. Use revela-decks init/upsertDeck/upsertSlides/review before patching deck HTML.`,
              blockers: [`No ${DECKS_STATE_FILE} exists.`],
            },
          }))
          .find((item) => !item.readiness.ready)
        if (!blocked) return

        const blockedDir = join(workspaceRoot, ".opencode", "revela", "blocked-writes")
        mkdirSync(blockedDir, { recursive: true })
        const blockedRelativePath = `.opencode/revela/blocked-writes/${blocked.readiness.slug}-${Date.now()}.blocked.md`
        const blockedPatch = `*** Begin Patch
*** Add File: ${blockedRelativePath}
+# Revela Blocked Deck Patch
+
+The attempted patch touching \`${blocked.target}\` was blocked.
+
+Reason: ${blocked.readiness.blocker}
+
+Next step: use \`revela-decks\` or \`/revela review\` to update ${DECKS_STATE_FILE}, then patch only after the matching deck has \`writeReadiness.status\` set to \`ready\` and no blockers.
*** End Patch`
        setPatchTextArg(args, blockedPatch)
        blockedDeckPatches.set(blockedRelativePath, blocked.readiness.blocker)
        childLog("decks-memory").warn("blocked deck patch", {
          target: blocked.target,
          blockedPath: blockedRelativePath,
          blocker: blocked.readiness.blocker,
        })
        return
      }

      if (input.tool === "read") {
        try {
          await preRead(output.args)
        } catch (e) {
          childLog("preRead").warn("extraction failed", {
            filePath: (output.args as any)?.filePath,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    },

    // ── Post-read: transform PDF text + compress images ────────────────────
    // Handles PDF and images — read tool succeeds with base64 attachment.
    // PDF: extract text, remove base64. Images: jimp compress.
    //
    // Also reports writes/patches blocked by the DECKS.json prewrite gate and
    // runs lightweight static design compliance after successful deck changes.
    "tool.execute.after": async (input, output) => {
      if (!ctx.enabled) return

      // ── Post-read processing ───────────────────────────────────────────
      if (input.tool === "read") {
        try {
          await postRead(input.args, output)
        } catch (e) {
          childLog("postRead").warn("processing failed", {
            filePath: (input.args as any)?.filePath,
            error: e instanceof Error ? e.message : String(e),
          })
        }
        return
      }

      // ── Report blocked deck writes and run static compliance ──────────
      if (input.tool === "write") {
        const filePath: string = input.args?.filePath ?? ""
        const blockedReason = blockedDeckWrites.get(filePath)
        if (blockedReason) {
          blockedDeckWrites.delete(filePath)
          appendToolResult(
            output,
            "---\n\n**[revela state gate]** Write was blocked.\n\n" +
            `${blockedReason}\n\n` +
            "Use the `revela-decks` tool or complete the DECKS.json review workflow instead."
          )
          return
        }
        await appendComplianceReport(filePath, output)
        await appendDeckHtmlContractReport(filePath, output)
        ensureEditorOpenAfterDeckChange(filePath, extractSessionID(input))
        return
      }

      if (input.tool === "apply_patch" && blockedDeckPatches.size > 0) {
        const [blockedPath, blockedReason] = blockedDeckPatches.entries().next().value ?? []
        if (blockedPath) blockedDeckPatches.delete(blockedPath)
        appendToolResult(
          output,
          "---\n\n**[revela prewrite gate]** Deck HTML patch was blocked.\n\n" +
          `${blockedReason}\n\n` +
          "Run `/revela review` or complete the same DECKS.json review workflow before patching the deck."
        )
        return
      }

      if (input.tool === "apply_patch") {
        const patchText = extractPatchTextArg(input.args as Record<string, unknown>)
        const targets = patchText ? extractDeckHtmlTargetsFromPatch(patchText) : []
        for (const target of targets) {
          await appendComplianceReport(target, output)
          await appendDeckHtmlContractReport(target, output)
          ensureEditorOpenAfterDeckChange(target, extractSessionID(input))
        }
        return
      }

      if (input.tool === "edit") {
        const filePath = extractEditFilePath(input.args)
        await appendComplianceReport(filePath, output)
        await appendDeckHtmlContractReport(filePath, output)
        ensureEditorOpenAfterDeckChange(filePath, extractSessionID(input))
        return
      }
    },
  }
}) satisfies Plugin

export default { id: "revela", server }
