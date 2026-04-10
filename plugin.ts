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
import { readFileSync } from "fs"
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
    console.error("[revela] sendIgnoredMessage failed:", e)
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
  } catch (e) {
    console.error("[revela] Failed to initialize:", e)
  }

  return {
    // ── Register /revela command (no .md file needed) ──────────────────────
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {}
      opencodeConfig.command["revela"] = {
        template: "",
        description: "Revela — AI slide deck generator (enable/disable, manage designs & domains)",
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

    // ── LLM tools: designs and domains management ─────────────────────────
    tool: {
      "revela-designs": designsTool,
      "revela-domains": domainsTool,
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
          console.error(`[revela] chat.message: failed to process ${name}:`, e)
          // Keep original FilePart on failure — graceful degradation
        }
      }
    },

    // ── Inject three-layer prompt when enabled ─────────────────────────────
    "experimental.chat.system.transform": async (input, output) => {
      if (!ctx.enabled) return
      try {
        const prompt = readFileSync(ACTIVE_PROMPT_FILE, "utf-8")
        if (output.system.length > 0) {
          output.system[output.system.length - 1] += "\n\n" + prompt
        } else {
          output.system.push(prompt)
        }
      } catch (e) {
        console.error("[revela] Failed to inject system prompt:", e)
      }
    },

    // ── Pre-read: intercept binary files before read executes ──────────────
    // Handles DOCX/PPTX/XLSX — read tool would Effect.fail on these.
    // Extracts text → writes temp .txt → redirects args.filePath.
    "tool.execute.before": async (input, output) => {
      if (!ctx.enabled) return
      if (input.tool !== "read") return
      try {
        await preRead(output.args)
      } catch (e) {
        console.error("[revela] preRead failed:", e)
      }
    },

    // ── Post-read: transform PDF text + compress images ────────────────────
    // Handles PDF and images — read tool succeeds with base64 attachment.
    // PDF: extract text, remove base64. Images: jimp compress.
    "tool.execute.after": async (input, output) => {
      if (!ctx.enabled) return
      if (input.tool !== "read") return
      try {
        await postRead(input.args, output)
      } catch (e) {
        console.error("[revela] postRead failed:", e)
      }
    },
  }
}) satisfies Plugin

export default { id: "revela", server }
