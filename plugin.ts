/**
 * revela — Core OpenCode Plugin
 *
 * Architecture: single /revela command surface (DCP style)
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
import { formatCommandIntentSystemBlock, setPendingCommandIntent, takePendingCommandIntent } from "./lib/command-intent"
import { preRead } from "./lib/read-hooks"
import { postRead } from "./lib/read-hooks"
import { extractPdfText } from "./lib/read-hooks/extractors/pdf"
import { createOfficeReadView } from "./lib/read-hooks/office-read-view"
import { OFFICE_EXTENSIONS, IMAGE_EXTENSIONS, formatExtractedText } from "./lib/read-hooks/dispatch"
import { handleHelp } from "./lib/commands/help"
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
import { handleRefine } from "./lib/commands/refine"
import { formatArtifactQAReport, runArtifactQA } from "./lib/qa/artifact"
import { ensureRefineDeckOpenForChange } from "./lib/refine/open"
import { handleDesignsPreview } from "./lib/commands/designs-preview"
import {
  parseDesignsNewArgs,
  buildDesignsNewPrompt,
  parseDesignsEditArgs,
  buildDesignsEditPrompt,
} from "./lib/commands/designs-new"
import { buildInitPrompt } from "./lib/commands/init"
import { buildResearchPrompt } from "./lib/commands/research"
import { handleBrief, parseBriefArgs } from "./lib/commands/brief"
import { buildNarrativeViewPrompt, parseStoryArgs } from "./lib/commands/narrative"
import { buildDeckPrompt } from "./lib/commands/review"
import {
  extractDeckHtmlTargetsFromPatch,
  extractPatchTextArg,
  isDeckHtmlPath,
  setPatchTextArg,
} from "./lib/decks-memory"
import {
  buildDecksStatePromptLayer,
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
import narrativeViewTool from "./tools/narrative-view"
import workspaceScanTool from "./tools/workspace-scan"
import extractDocumentMaterialsTool from "./tools/extract-document-materials"
import qaTool from "./tools/qa"
import pdfTool from "./tools/pdf"
import pptxTool from "./tools/pptx"
import createEditTool from "./tools/edit"
import { RESEARCH_PROMPT, RESEARCH_AGENT_SIGNATURE } from "./lib/agents/research-prompt"
import { NARRATIVE_REVIEWER_PROMPT, NARRATIVE_REVIEWER_SIGNATURE } from "./lib/agents/narrative-reviewer-prompt"
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
  const blockedPatches = new Map<string, string>()

  async function runPostWriteArtifactQA(filePath: string, output: any): Promise<boolean> {
    if (!isDeckHtmlPath(filePath)) return true

    try {
      let vocabulary
      try {
        vocabulary = extractDesignClasses()
      } catch {
        // Design may not be installed or may have no markers — skip compliance vocabulary.
      }

      const report = await runArtifactQA({ workspaceRoot, filePath, vocabulary })
      appendToolResult(output, "---\n\n" + formatArtifactQAReport(report))
      return report.passed
    } catch (e) {
      childLog("artifact-qa").warn("post-write artifact QA failed", {
        filePath,
        error: e instanceof Error ? e.message : String(e),
      })
      appendToolResult(output, "---\n\n## Artifact QA: FAILED\n\nError running artifact QA: " + (e instanceof Error ? e.message : String(e)))
      return false
    }
  }

  function extractSessionID(input: any): string {
    return input?.sessionID ?? input?.session?.id ?? input?.context?.sessionID ?? ""
  }

  function queueWorkflowCommand(input: {
    sessionID: string
    name: string
    mode: "narrative" | "deck-render"
    visibleText: string
    hiddenPrompt: string
    output: any
  }): void {
    ctx.enabled = true
    buildPrompt({ mode: input.mode })
    setPendingCommandIntent({
      sessionID: input.sessionID,
      name: input.name,
      mode: input.mode,
      visibleText: input.visibleText,
      hiddenPrompt: input.hiddenPrompt,
    })
    input.output.parts.length = 0
    input.output.parts.push({ type: "text", text: input.visibleText } as any)
  }

  function ensureRefineOpenAfterDeckChange(filePath: string, sessionID: string): void {
    if (!isDeckHtmlPath(filePath) || !sessionID) return

    try {
      ensureRefineDeckOpenForChange("", {
        client,
        sessionID,
        workspaceRoot,
      })
    } catch (e) {
      childLog("refine").warn("failed to ensure Refine after deck change", {
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
        description: "Revela — narrative artifact workspace (init, research, story, make, refine, design)",
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
      if (sub === "make") {
        const target = args[1]?.toLowerCase() ?? ""
        const makeParam = args.slice(2).join(" ")
        if (target === "--deck") {
          if (makeParam) {
            await send("Usage: `/revela make --deck`.")
            throw new Error("__REVELA_MAKE_DECK_USAGE_HANDLED__")
          }
          queueWorkflowCommand({
            sessionID,
            name: "make --deck",
            mode: "deck-render",
            visibleText: "Make Revela deck from approved story.",
            hiddenPrompt: buildDeckPrompt({ exists: hasDecksState(workspaceRoot), workspaceRoot }),
            output,
          })
          return
        }
        if (target === "--brief") {
          const parsed = parseBriefArgs(makeParam)
          if (!parsed.ok) {
            await send(parsed.error.replace("/revela brief", "/revela make --brief"))
            throw new Error("__REVELA_MAKE_BRIEF_USAGE_HANDLED__")
          }
          await handleBrief({ workspaceRoot, outputPath: parsed.args.outputPath }, send)
          throw new Error("__REVELA_MAKE_BRIEF_HANDLED__")
        }
        await send("Usage: `/revela make --deck` or `/revela make --brief [workspace-relative-output.md]`.")
        throw new Error("__REVELA_MAKE_USAGE_HANDLED__")
      }
      if (sub === "refine") {
        if (param !== "--deck") {
          await send("Usage: `/revela refine --deck`.")
          throw new Error("__REVELA_REFINE_USAGE_HANDLED__")
        }
        await handleRefine({ client, sessionID, workspaceRoot }, send)
        throw new Error("__REVELA_REFINE_HANDLED__")
      }
      if (sub === "export") {
        const target = args[1]?.toLowerCase() ?? ""
        const format = args[2]?.toLowerCase() ?? ""
        const exportParam = args.slice(3).join(" ")
        if (target !== "--deck" || (format !== "pdf" && format !== "pptx")) {
          await send("Usage: `/revela export --deck pdf [file.html]` or `/revela export --deck pptx [file.html] [--notes]`.")
          throw new Error("__REVELA_EXPORT_USAGE_HANDLED__")
        }
        if (format === "pdf") {
          await handlePdf(exportParam, send, workspaceRoot)
          throw new Error("__REVELA_EXPORT_PDF_HANDLED__")
        }
        const pptxArgs = parsePptxArgs(exportParam)
        if (pptxArgs.notes) {
          try {
            const deck = resolvePptxDeck(workspaceRoot, pptxArgs.filePath)
            queueWorkflowCommand({
              sessionID,
              name: "export --deck pptx --notes",
              mode: "deck-render",
              visibleText: "Export Revela deck to PPTX with speaker notes.",
              hiddenPrompt: buildPptxNotesPrompt(deck),
              output,
            })
            return
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            await send(`**PPTX export failed**\n\n\`\`\`\n${msg}\n\`\`\``)
            throw new Error("__REVELA_EXPORT_PPTX_HANDLED__")
          }
        }
        await handlePptx(exportParam, send, workspaceRoot)
        throw new Error("__REVELA_EXPORT_PPTX_HANDLED__")
      }
      if (sub === "design") {
        const designAction = args[1]?.toLowerCase() ?? ""
        const designParam = args.slice(2).join(" ")
        if (!designAction) {
          await handleDesignsList(send)
          throw new Error("__REVELA_DESIGN_LIST_HANDLED__")
        }
        if (designAction === "--use") {
          if (!designParam) {
            await send("Usage: `/revela design --use <name>`.")
            throw new Error("__REVELA_DESIGN_USE_USAGE_HANDLED__")
          }
          await handleDesignsActivate(designParam, send)
          throw new Error("__REVELA_DESIGN_USE_HANDLED__")
        }
        if (designAction === "--add") {
          if (!designParam) {
            await send("Usage: `/revela design --add <url|github:user/repo|local-path>`.")
            throw new Error("__REVELA_DESIGN_ADD_USAGE_HANDLED__")
          }
          await handleDesignsAdd(designParam, send)
          throw new Error("__REVELA_DESIGN_ADD_HANDLED__")
        }
        if (designAction === "--rm") {
          if (!designParam) {
            await send("Usage: `/revela design --rm <name>`.")
            throw new Error("__REVELA_DESIGN_RM_USAGE_HANDLED__")
          }
          await handleDesignsRemove(designParam, send)
          throw new Error("__REVELA_DESIGN_RM_HANDLED__")
        }
        if (designAction === "--preview") {
          await handleDesignsPreview(designParam, send)
          throw new Error("__REVELA_DESIGN_PREVIEW_HANDLED__")
        }
        if (designAction === "--new") {
          const parsed = parseDesignsNewArgs(designParam)
          if (!parsed.ok) {
            await send(parsed.error)
            throw new Error("__REVELA_DESIGN_NEW_USAGE_HANDLED__")
          }
          queueWorkflowCommand({
            sessionID,
            name: `design --new ${parsed.name}`,
            mode: "deck-render",
            visibleText: `Create Revela design ${parsed.name}.`,
            hiddenPrompt: buildDesignsNewPrompt({ name: parsed.name, base: parsed.base }),
            output,
          })
          return
        }
        if (designAction === "--edit") {
          const parsed = parseDesignsEditArgs(designParam)
          if (!parsed.ok) {
            await send(parsed.error)
            throw new Error("__REVELA_DESIGN_EDIT_USAGE_HANDLED__")
          }
          queueWorkflowCommand({
            sessionID,
            name: `design --edit ${parsed.name}`,
            mode: "deck-render",
            visibleText: `Edit Revela design ${parsed.name}.`,
            hiddenPrompt: buildDesignsEditPrompt({ name: parsed.name }),
            output,
          })
          return
        }
        await send("Usage: `/revela design [--use <name>|--preview [name]|--new <name>|--edit <name>|--add <source>|--rm <name>]`.")
        throw new Error("__REVELA_DESIGN_USAGE_HANDLED__")
      }
      if (sub === "domain") {
        const domainAction = args[1]?.toLowerCase() ?? ""
        const domainParam = args.slice(2).join(" ")
        if (!domainAction) {
          await handleDomainsList(send)
          throw new Error("__REVELA_DOMAIN_LIST_HANDLED__")
        }
        if (domainAction === "--use") {
          if (!domainParam) {
            await send("Usage: `/revela domain --use <name>`.")
            throw new Error("__REVELA_DOMAIN_USE_USAGE_HANDLED__")
          }
          await handleDomainsActivate(domainParam, send)
          throw new Error("__REVELA_DOMAIN_USE_HANDLED__")
        }
        if (domainAction === "--add") {
          if (!domainParam) {
            await send("Usage: `/revela domain --add <url|github:user/repo|local-path>`.")
            throw new Error("__REVELA_DOMAIN_ADD_USAGE_HANDLED__")
          }
          await handleDomainsAdd(domainParam, send)
          throw new Error("__REVELA_DOMAIN_ADD_HANDLED__")
        }
        if (domainAction === "--rm") {
          if (!domainParam) {
            await send("Usage: `/revela domain --rm <name>`.")
            throw new Error("__REVELA_DOMAIN_RM_USAGE_HANDLED__")
          }
          await handleDomainsRemove(domainParam, send)
          throw new Error("__REVELA_DOMAIN_RM_HANDLED__")
        }
        await send("Usage: `/revela domain [--use <name>|--add <source>|--rm <name>]`.")
        throw new Error("__REVELA_DOMAIN_USAGE_HANDLED__")
      }
      const legacyCommands = new Set([
        "enable", "disable", "review", "narrative", "deck", "brief", "edit", "inspect", "remember",
        "designs", "designs-new", "designs-edit", "designs-preview", "designs-add", "designs-rm",
        "domains", "domains-add", "domains-rm", "pdf", "pptx",
      ])
      if (legacyCommands.has(sub)) {
        await send(`\`/revela ${sub}\` is no longer a public command. Run \`/revela\` to see the current REVELA help.`)
        throw new Error("__REVELA_LEGACY_COMMAND_HANDLED__")
      }
      if (sub === "init") {
        queueWorkflowCommand({
          sessionID,
          name: "init",
          mode: "narrative",
          visibleText: "Initialize Revela workspace.",
          hiddenPrompt: buildInitPrompt({ exists: hasDecksState(workspaceRoot), workspaceRoot }),
          output,
        })
        return
      }
      if (sub === "research") {
        if (param) {
          await send("`/revela research` does not accept arguments yet. Add the research question in normal chat, or run it to work from open story gaps.")
          throw new Error("__REVELA_RESEARCH_USAGE_HANDLED__")
        }
        queueWorkflowCommand({
          sessionID,
          name: "research",
          mode: "narrative",
          visibleText: "Research Revela story gaps.",
          hiddenPrompt: buildResearchPrompt({ exists: hasDecksState(workspaceRoot), workspaceRoot }),
          output,
        })
        return
      }
      if (sub === "story") {
        const parsed = parseStoryArgs(param)
        if (!parsed.ok) {
          await send(parsed.error)
          throw new Error("__REVELA_STORY_USAGE_HANDLED__")
        }
        queueWorkflowCommand({
          sessionID,
          name: "story",
          mode: "narrative",
          visibleText: "Open Revela story workspace.",
          hiddenPrompt: buildNarrativeViewPrompt({ workspaceRoot, language: parsed.args.language }),
          output,
        })
        return
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
      "revela-narrative-view": narrativeViewTool,
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
        const sessionID = extractSessionID(input)
        const commandIntent = takePendingCommandIntent(sessionID)
        if (commandIntent) {
          prompt += "\n\n" + formatCommandIntentSystemBlock(commandIntent)
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
          "Run /revela to confirm the plugin is available, then retry the workflow command.]"
        )
      }
    },

    // ── Pre-tool processing ────────────────────────────────────────────────
    // - read: intercept DOCX/PPTX/XLSX before read executes.
    // - write/apply_patch: protect DECKS.json, but do not block deck HTML edits.
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
          blockedPatches.set(blockedRelativePath, blocker)
          childLog("decks-state").warn("blocked direct DECKS.json patch", { targets: stateTargets, blockedPath: blockedRelativePath })
          return
        }
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
    // runs artifact QA before opening Refine after successful deck changes.
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

      // ── Report blocked state writes and run artifact QA ───────────────
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
        const qaPassed = await runPostWriteArtifactQA(filePath, output)
        if (qaPassed) ensureRefineOpenAfterDeckChange(filePath, extractSessionID(input))
        return
      }

      if (input.tool === "apply_patch" && blockedPatches.size > 0) {
        const [blockedPath, blockedReason] = blockedPatches.entries().next().value ?? []
        if (blockedPath) blockedPatches.delete(blockedPath)
        appendToolResult(
          output,
          "---\n\n**[revela prewrite gate]** Patch was blocked.\n\n" +
          `${blockedReason}\n\n` +
          "Use the `revela-decks` tool for controlled workspace state changes."
        )
        return
      }

      if (input.tool === "apply_patch") {
        const patchText = extractPatchTextArg(input.args as Record<string, unknown>)
        const targets = patchText ? extractDeckHtmlTargetsFromPatch(patchText) : []
        for (const target of targets) {
          const qaPassed = await runPostWriteArtifactQA(target, output)
          if (qaPassed) ensureRefineOpenAfterDeckChange(target, extractSessionID(input))
        }
        return
      }

      if (input.tool === "edit") {
        const filePath = extractEditFilePath(input.args)
        const qaPassed = await runPostWriteArtifactQA(filePath, output)
        if (qaPassed) ensureRefineOpenAfterDeckChange(filePath, extractSessionID(input))
        return
      }
    },
  }
}) satisfies Plugin

export default { id: "revela", server }
