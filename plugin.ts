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
 * 8. tool.execute.after: intercept read on PDF/images → postRead()
 */

import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import { extname, basename } from "path"
import { seedBuiltinDesigns } from "./lib/design/designs"
import { seedBuiltinDomains } from "./lib/domain/domains"
import { buildPrompt } from "./lib/prompt-builder"
import { ACTIVE_PROMPT_FILE } from "./lib/config"
import { ctx } from "./lib/ctx"
import { preRead } from "./lib/read-hooks"
import { postRead } from "./lib/read-hooks"
import { extractDocx } from "./lib/read-hooks/extractors/docx"
import { extractPptx } from "./lib/read-hooks/extractors/pptx"
import { extractXlsx } from "./lib/read-hooks/extractors/xlsx"
import { extractPdfText } from "./lib/read-hooks/extractors/pdf"
import { handleHelp } from "./lib/commands/help"
import { handleEnable } from "./lib/commands/enable"
import { handleDisable } from "./lib/commands/disable"
import {
  handleDesignsList,
  handleDesignsActivate,
  handleDesignsAdd,
} from "./lib/commands/designs"
import {
  handleDomainsList,
  handleDomainsActivate,
  handleDomainsAdd,
} from "./lib/commands/domains"
import designsTool from "./tools/designs"
import domainsTool from "./tools/domains"
import researchSaveTool from "./tools/research-save"
import workspaceScanTool from "./tools/workspace-scan"
import qaTool from "./tools/qa"
import { RESEARCH_PROMPT, RESEARCH_AGENT_SIGNATURE } from "./lib/agents/research-prompt"
import { runQA, formatReport } from "./lib/qa"
import { log, childLog } from "./lib/log"

// OpenCode internal agent signatures — used to skip system prompt injection
// for built-in system agents (title, summary, compaction).
const INTERNAL_AGENT_SIGNATURES = [
  "You are a title generator",
  "You are a helpful AI assistant tasked with summarizing conversations",
  "Summarize what was done in this conversation",
]

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
    // ── Register /revela command + revela-research subagent ───────────────
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

      // Block websearch for the primary agent globally.
      // permission.ask hook is not triggered by OpenCode (no R.trigger call in binary).
      // tool.execute.before throw is swallowed (trigger().catch(()=>{})).
      // The only working mechanism is the config-level permission ruleset.
      // revela-research agent overrides this with websearch: "allow" above.
      opencodeConfig.permission ??= {}
      if (!(opencodeConfig.permission as Record<string, unknown>)["websearch"]) {
        ;(opencodeConfig.permission as Record<string, unknown>)["websearch"] = "deny"
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
      if (sub === "domains-add") {
        await handleDomainsAdd(param, send)
        throw new Error("__REVELA_DOMAINS_ADD_HANDLED__")
      }

      await send(`**Unknown sub-command:** \`${sub}\`\nRun \`/revela\` to see available commands.`)
      throw new Error("__REVELA_UNKNOWN_HANDLED__")
    },

    // ── LLM tools: designs, domains, research, qa ─────────────────────────
    tool: {
      "revela-designs": designsTool,
      "revela-domains": domainsTool,
      "revela-research-save": researchSaveTool,
      "revela-workspace-scan": workspaceScanTool,
      "revela-qa": qaTool,
    },

    // ── chat.message: intercept @-referenced / pasted binary files ────────
    // When user uses @ or pastes a file, OpenCode injects it as a FilePart
    // directly — the read tool is never called, so tool.execute.before/after
    // hooks don't fire. This hook intercepts FileParts before LLM sees them.
    //
    // DOCX/PPTX/XLSX/PDF → extract text → replace with TextPart
    // Images              → replace with TextPart hint (LLM can use read tool)
    "chat.message": async (input, output) => {
      if (!ctx.enabled) return

      const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".gif"])
      const DOC_HANDLERS: Record<string, (buf: Buffer) => Promise<string>> = {
        ".docx": extractDocx,
        ".pptx": extractPptx,
        ".xlsx": extractXlsx,
        ".pdf": extractPdfText,
      }

      for (let i = 0; i < output.parts.length; i++) {
        const part = output.parts[i] as any
        if (part.type !== "file") continue
        if (part.source?.type !== "file") continue

        const filePath: string = part.source.path
        const ext = extname(filePath).toLowerCase()
        const name = basename(filePath)

        try {
          if (DOC_HANDLERS[ext]) {
            const buf = readFileSync(filePath)
            const text = await DOC_HANDLERS[ext](buf)
            output.parts[i] = {
              ...part,
              type: "text",
              text: `[Extracted from: ${name}]\n\n${text}`,
            } as any
          } else if (IMAGE_EXTS.has(ext)) {
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
    //   1. revela-research subagent (has its own research-focused prompt)
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

        // Skip OpenCode internal system agents (title generator, summary, compaction)
        if (INTERNAL_AGENT_SIGNATURES.some((sig) => systemText.includes(sig))) return

        const prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")
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

    // ── Pre-read: intercept binary files before read executes ──────────────
    // Handles DOCX/PPTX/XLSX — read tool would Effect.fail on these.
    // Extracts text → writes temp .txt → redirects args.filePath.
    "tool.execute.before": async (input, output) => {
      log.info("[hook] tool.execute.before fired", { tool: input.tool, enabled: ctx.enabled, isResearch: ctx.isResearchAgent })
      if (!ctx.enabled) return

      if (input.tool !== "read") return
      try {
        await preRead(output.args)
      } catch (e) {
        childLog("preRead").warn("extraction failed", {
          filePath: (output.args as any)?.filePath,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    },

    // ── Post-read: transform PDF text + compress images ────────────────────
    // Handles PDF and images — read tool succeeds with base64 attachment.
    // PDF: extract text, remove base64. Images: jimp compress.
    //
    // Also handles: auto layout QA after writing slides/*.html
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

      // ── Auto layout QA after writing slides/*.html ─────────────────────
      if (input.tool === "write") {
        const filePath: string = input.args?.filePath ?? ""
        // Only trigger for HTML files inside a slides/ directory
        if (!filePath.match(/slides\/[^/]+\.html$/)) return

        try {
          const report = await runQA(filePath)
          // Only append QA report to tool output if there are issues
          if (report.totalIssues > 0) {
            const formatted = formatReport(report)
            // Append to the write tool's output so the LLM sees it immediately
            const existing = (output as any).result ?? ""
            ;(output as any).result =
              (existing ? existing + "\n\n" : "") +
              "---\n\n**[revela layout QA]** Auto-check completed:\n\n" +
              formatted
          }
        } catch (e) {
          childLog("qa").warn("auto QA failed", {
            filePath,
            error: e instanceof Error ? e.message : String(e),
          })
          // Don't surface errors to the LLM — fail silently
        }
        return
      }
    },
  }
}) satisfies Plugin

export default { id: "revela", server }
