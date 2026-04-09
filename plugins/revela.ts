/**
 * revela — Core OpenCode Plugin
 *
 * Architecture: enable/disable mode + single /revela command (DCP style)
 *
 * Responsibilities:
 * 1. On load: seed built-in designs/domains + build initial _active-prompt.md
 * 2. config hook: register /revela command (empty template, no .md file needed)
 * 3. command.execute.before: route all sub-commands locally, zero LLM involvement
 * 4. experimental.chat.system.transform: inject three-layer prompt when enabled
 * 5. command.executed: fallback rebuild after AI calls designs/domains tools
 * 6. tool.execute.before: intercept read on DOCX/PPTX/XLSX → preRead()
 * 7. tool.execute.after: intercept read on PDF/images → postRead()
 */

import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync } from "fs"
import { seedBuiltinDesigns, listDesigns, activeDesign, activateDesign, installDesign } from "../lib/designs"
import { seedBuiltinDomains, listDomains, activeDomain, activateDomain, installDomain } from "../lib/domains"
import { buildPrompt } from "../lib/prompt-builder"
import { ACTIVE_PROMPT_FILE } from "../lib/config"
import { ctx } from "../lib/ctx"
import { preRead } from "../lib/read-hooks"
import { postRead } from "../lib/read-hooks"

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

    // ── Route all sub-commands locally, prevent LLM execution ─────────────
    "command.execute.before": async (input, output) => {
      if (input.command !== "revela") return

      const sessionID: string = (input as any).sessionID ?? ""
      const args = ((input as any).arguments ?? "").trim().split(/\s+/).filter(Boolean) as string[]
      const sub = args[0]?.toLowerCase() ?? ""
      const param = args.slice(1).join(" ")

      const send = (text: string) => sendIgnoredMessage(client, sessionID, text)

      // ── /revela ──────────────────────────────────────────────────────────
      if (!sub) {
        const design = activeDesign()
        const domain = activeDomain()
        const status = ctx.enabled ? "enabled ✓" : "disabled"
        await send(
          `**Revela** [${status}]\n` +
          `Active design: \`${design}\` · Active domain: \`${domain}\`\n\n` +
          `**Commands:**\n` +
          `\`/revela enable\`           — enable slide generation mode\n` +
          `\`/revela disable\`          — disable slide generation mode\n` +
          `\`/revela designs\`          — list installed designs\n` +
          `\`/revela designs <name>\`   — activate a design\n` +
          `\`/revela domains\`          — list installed domains\n` +
          `\`/revela domains <name>\`   — activate a domain\n` +
          `\`/revela designs-add <url>\` — install a design from URL / github:user/repo\n` +
          `\`/revela domains-add <url>\` — install a domain from URL / github:user/repo`
        )
        throw new Error("__REVELA_STATUS_HANDLED__")
      }

      // ── /revela enable ───────────────────────────────────────────────────
      if (sub === "enable") {
        ctx.enabled = true
        const design = activeDesign()
        const domain = activeDomain()
        await send(
          `**Revela enabled.** Slide generation mode is now active.\n` +
          `Design: \`${design}\` · Domain: \`${domain}\`\n\n` +
          `The three-layer slide generation prompt will be injected into every message. ` +
          `Describe your presentation to get started.`
        )
        throw new Error("__REVELA_ENABLE_HANDLED__")
      }

      // ── /revela disable ──────────────────────────────────────────────────
      if (sub === "disable") {
        ctx.enabled = false
        await send(`**Revela disabled.** Slide generation mode is off.`)
        throw new Error("__REVELA_DISABLE_HANDLED__")
      }

      // ── /revela designs ──────────────────────────────────────────────────
      if (sub === "designs" && !param) {
        const designs = listDesigns()
        const current = activeDesign()
        if (!designs.length) {
          await send(`No designs installed. Use \`/revela designs-add <url>\` to install one.`)
        } else {
          const lines = designs.map((d) => {
            const marker = d.name === current ? " ◀ active" : ""
            return `- **${d.name}**${marker}  —  ${d.description || "(no description)"}`
          })
          await send(`**Installed designs:**\n\n${lines.join("\n")}`)
        }
        throw new Error("__REVELA_DESIGNS_LIST_HANDLED__")
      }

      // ── /revela designs <name> ───────────────────────────────────────────
      if (sub === "designs" && param) {
        try {
          activateDesign(param)
          buildPrompt()
          await send(`**Design activated:** \`${param}\`\nPrompt rebuilt. The new visual style will apply to the next message.`)
        } catch (e: any) {
          await send(`**Error:** ${e.message}`)
        }
        throw new Error("__REVELA_DESIGNS_ACTIVATE_HANDLED__")
      }

      // ── /revela domains ──────────────────────────────────────────────────
      if (sub === "domains" && !param) {
        const domains = listDomains()
        const current = activeDomain()
        if (!domains.length) {
          await send(`No domains installed. Use \`/revela domains-add <url>\` to install one.`)
        } else {
          const lines = domains.map((d) => {
            const marker = d.name === current ? " ◀ active" : ""
            return `- **${d.name}**${marker}  —  ${d.description || "(no description)"}`
          })
          await send(`**Installed domains:**\n\n${lines.join("\n")}`)
        }
        throw new Error("__REVELA_DOMAINS_LIST_HANDLED__")
      }

      // ── /revela domains <name> ───────────────────────────────────────────
      if (sub === "domains" && param) {
        try {
          activateDomain(param)
          buildPrompt()
          await send(`**Domain activated:** \`${param}\`\nPrompt rebuilt. The new domain context will apply to the next message.`)
        } catch (e: any) {
          await send(`**Error:** ${e.message}`)
        }
        throw new Error("__REVELA_DOMAINS_ACTIVATE_HANDLED__")
      }

      // ── /revela designs-add <source> ─────────────────────────────────────
      if (sub === "designs-add") {
        if (!param) {
          await send(`**Usage:** \`/revela designs-add <url|github:user/repo|local-path>\``)
          throw new Error("__REVELA_DESIGNS_ADD_HANDLED__")
        }
        try {
          await send(`Installing design from \`${param}\`…`)
          const name = await installDesign(param)
          await send(`**Design installed:** \`${name}\`\nUse \`/revela designs ${name}\` to activate it.`)
        } catch (e: any) {
          await send(`**Install failed:** ${e.message}`)
        }
        throw new Error("__REVELA_DESIGNS_ADD_HANDLED__")
      }

      // ── /revela domains-add <source> ─────────────────────────────────────
      if (sub === "domains-add") {
        if (!param) {
          await send(`**Usage:** \`/revela domains-add <url|github:user/repo|local-path>\``)
          throw new Error("__REVELA_DOMAINS_ADD_HANDLED__")
        }
        try {
          await send(`Installing domain from \`${param}\`…`)
          const name = await installDomain(param)
          await send(`**Domain installed:** \`${name}\`\nUse \`/revela domains ${name}\` to activate it.`)
        } catch (e: any) {
          await send(`**Install failed:** ${e.message}`)
        }
        throw new Error("__REVELA_DOMAINS_ADD_HANDLED__")
      }

      // ── Unknown sub-command ──────────────────────────────────────────────
      await send(`**Unknown sub-command:** \`${sub}\`\nRun \`/revela\` to see available commands.`)
      throw new Error("__REVELA_UNKNOWN_HANDLED__")
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

    // ── Fallback: rebuild prompt if AI uses designs/domains tool directly ──
    "command.executed": async ({ event }) => {
      const cmd: string = event?.properties?.command ?? ""
      if (cmd.startsWith("/design") || cmd.startsWith("/domain")) {
        try {
          buildPrompt()
        } catch {
          // Silent degradation
        }
      }
    },

    // ── Pre-read: intercept binary files before read executes ──────────────
    // Handles DOCX/PPTX/XLSX — read tool would Effect.fail on these.
    // Extracts text → writes temp .txt → redirects args.filePath.
    "tool.execute.before": async (input, output) => {
      if (!ctx.enabled) return
      if ((input as any).tool !== "read") return
      try {
        await preRead(output.args)
      } catch (e) {
        console.error("[revela] preRead failed:", e)
        // Degradation: let read tool run normally (will Effect.fail for binary)
      }
    },

    // ── Post-read: transform PDF text + compress images ────────────────────
    // Handles PDF and images — read tool succeeds with base64 attachment.
    // PDF: extract text, remove base64. Images: jimp compress.
    "tool.execute.after": async (input, output) => {
      if (!ctx.enabled) return
      if ((input as any).tool !== "read") return
      try {
        await postRead((input as any).args, output)
      } catch (e) {
        console.error("[revela] postRead failed:", e)
        // Degradation: LLM receives original read output
      }
    },
  }
}) satisfies Plugin

export default { id: "revela", server }
