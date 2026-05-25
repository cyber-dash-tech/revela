import { spawn } from "child_process"
import type { InspectionResult } from "../inspection-context/result"

export type ReviewPromptAction = "comment" | "inspect"
export type ReviewPromptBridgeKind = "opencode" | "codex-exec"

export type ReviewBridgeEvent = {
  type: "started" | "codex_event" | "stdout" | "stderr" | "completed" | "failed" | "timeout"
  message: string
  timestamp: number
  detail?: string
}

export interface ReviewPromptInput {
  action: ReviewPromptAction
  prompt: string
  workspaceRoot: string
  file: string
  requestId?: string
  timeoutMs?: number
  onEvent?: (event: ReviewBridgeEvent) => void
}

export type ReviewPromptResult =
  | { ok: true; status: "sent" | "completed"; result?: InspectionResult; raw?: string }
  | { ok: false; status: "failed" | "unsupported"; error: string; raw?: string }

export interface ReviewPromptBridge {
  kind: ReviewPromptBridgeKind
  send(input: ReviewPromptInput): Promise<ReviewPromptResult>
}

export interface CodexExecRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

export type CodexExecRunner = (input: {
  action: ReviewPromptAction
  prompt: string
  workspaceRoot: string
  timeoutMs: number
  sandboxMode: "read-only" | "workspace-write"
  skipGitRepoCheck: boolean
  onEvent?: (event: ReviewBridgeEvent) => void
}) => Promise<CodexExecRunResult>

export function createOpenCodeReviewPromptBridge(client: any, sessionID: string): ReviewPromptBridge {
  return {
    kind: "opencode",
    async send(input) {
      if (!client?.session?.prompt || !sessionID) {
        return {
          ok: false,
          status: "failed",
          error: "OpenCode Review bridge requires client.session.prompt and sessionID.",
        }
      }
      await client.session.prompt({
        path: { id: sessionID },
        body: {
          parts: [{ type: "text", text: input.prompt }],
        },
      })
      return { ok: true, status: "sent" }
    },
  }
}

export function createCodexExecReviewPromptBridge(options: {
  runner?: CodexExecRunner
  timeoutMs?: number
} = {}): ReviewPromptBridge {
  const runner = options.runner ?? runCodexExec
  const timeoutMs = options.timeoutMs ?? 120_000
  return {
    kind: "codex-exec",
    async send(input) {
      const sandboxMode = input.action === "comment" ? "workspace-write" : "read-only"
      input.onEvent?.(bridgeEvent("started", "Starting Codex..."))
      const output = await runner({
        action: input.action,
        prompt: input.prompt,
        workspaceRoot: input.workspaceRoot,
        timeoutMs: input.timeoutMs ?? timeoutMs,
        sandboxMode,
        skipGitRepoCheck: true,
        onEvent: input.onEvent,
      })
      const raw = [output.stdout, output.stderr].filter(Boolean).join("\n")
      if (output.exitCode !== 0) {
        input.onEvent?.(bridgeEvent("failed", `codex exec failed with exit code ${output.exitCode ?? "unknown"}.`, boundedTail(raw)))
        return {
          ok: false,
          status: "failed",
          error: `codex exec failed with exit code ${output.exitCode ?? "unknown"}.`,
          raw,
        }
      }
      if (input.action === "comment" && isCodexWriteBlocked(raw)) {
        input.onEvent?.(bridgeEvent("failed", "codex exec could not write the deck because its sandbox blocked file changes.", boundedTail(raw)))
        return {
          ok: false,
          status: "failed",
          error: "codex exec could not write the deck because its sandbox blocked file changes.",
          raw,
        }
      }
      if (input.action === "comment") {
        input.onEvent?.(bridgeEvent("completed", "Codex completed."))
        return { ok: true, status: "completed", raw }
      }
      const result = extractInspectionResult(output.stdout)
      if (!result) {
        input.onEvent?.(bridgeEvent("failed", "codex exec did not return a valid inspection result JSON object.", boundedTail(raw)))
        return {
          ok: false,
          status: "failed",
          error: "codex exec did not return a valid inspection result JSON object.",
          raw,
        }
      }
      input.onEvent?.(bridgeEvent("completed", "Codex completed the inspection."))
      return { ok: true, status: "completed", result, raw }
    },
  }
}

async function runCodexExec(input: {
  action: ReviewPromptAction
  prompt: string
  workspaceRoot: string
  timeoutMs: number
  sandboxMode: "read-only" | "workspace-write"
  skipGitRepoCheck: boolean
  onEvent?: (event: ReviewBridgeEvent) => void
}): Promise<CodexExecRunResult> {
  return new Promise((resolve) => {
    const args = ["exec", "--json", "--ephemeral"]
    if (input.skipGitRepoCheck) args.push("--skip-git-repo-check")
    args.push("--sandbox", input.sandboxMode, "-C", input.workspaceRoot, input.prompt)
    const child = spawn("codex", args, {
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let stdoutLineBuffer = ""
    let resolved = false
    const resolveOnce = (output: CodexExecRunResult) => {
      if (resolved) return
      resolved = true
      resolve(output)
    }
    const timer = setTimeout(() => {
      child.kill()
      const nextStderr = `${stderr}${stderr ? "\n" : ""}codex exec timed out after ${input.timeoutMs}ms.`
      input.onEvent?.(bridgeEvent("timeout", "Codex timed out before completing.", boundedTail(nextStderr)))
      resolveOnce({
        exitCode: 124,
        stdout,
        stderr: nextStderr,
      })
    }, input.timeoutMs)
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString()
      stdout += text
      stdoutLineBuffer = emitCodexJsonProgress(stdoutLineBuffer + text, input.action, input.onEvent)
    })
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString()
      stderr += text
      input.onEvent?.(bridgeEvent("stderr", "Codex wrote diagnostic output.", boundedTail(text)))
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      input.onEvent?.(bridgeEvent("failed", "Failed to start codex exec.", boundedTail(error.message)))
      resolveOnce({ exitCode: 127, stdout, stderr: error.message })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      emitCodexJsonProgress(`${stdoutLineBuffer}\n`, input.action, input.onEvent)
      resolveOnce({ exitCode: code, stdout, stderr })
    })
  })
}

function emitCodexJsonProgress(buffer: string, action: ReviewPromptAction, onEvent?: (event: ReviewBridgeEvent) => void): string {
  const lines = buffer.split(/\r?\n/)
  const remainder = lines.pop() ?? ""
  for (const line of lines) {
    const parsed = parseJson(line)
    const message = codexProgressMessage(parsed, action)
    if (message) {
      onEvent?.(bridgeEvent("codex_event", message, boundedTail(line)))
    } else if (parsed === undefined && line.trim()) {
      onEvent?.(bridgeEvent("stdout", "Codex wrote output.", boundedTail(line)))
    }
  }
  return remainder
}

function codexProgressMessage(value: unknown, action: ReviewPromptAction): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  const type = typeof record.type === "string" ? record.type.toLowerCase() : ""
  const event = typeof record.event === "string" ? record.event.toLowerCase() : ""
  const name = `${type} ${event}`
  if (!name.trim()) return undefined
  if (name.includes("turn_completed") || name.includes("completed")) {
    return action === "comment" ? undefined : "Codex completed the inspection."
  }
  if (name.includes("exec") || name.includes("patch") || name.includes("tool") || name.includes("apply")) {
    return action === "comment" ? "Codex is applying the requested edit..." : "Codex is reading the deck..."
  }
  if (name.includes("session") || name.includes("turn") || name.includes("start")) return "Codex is reading the deck..."
  if (name.includes("message") || name.includes("delta") || name.includes("agent")) return "Codex is working..."
  return "Codex is working..."
}

function bridgeEvent(type: ReviewBridgeEvent["type"], message: string, detail?: string): ReviewBridgeEvent {
  return { type, message, timestamp: Date.now(), ...(detail ? { detail } : {}) }
}

function boundedTail(text: string, limit = 4096): string {
  if (text.length <= limit) return text
  return text.slice(text.length - limit)
}

function isCodexWriteBlocked(raw: string): boolean {
  const text = raw.toLowerCase()
  return (
    (text.includes("patch rejected") && text.includes("read-only sandbox")) ||
    text.includes("writing is blocked by read-only sandbox") ||
    text.includes("blocked by read-only sandbox")
  )
}

function extractInspectionResult(stdout: string): InspectionResult | undefined {
  const direct = parseJson(stdout)
  const fromDirect = findInspectionResult(direct)
  if (fromDirect) return fromDirect

  for (const line of stdout.split(/\r?\n/).reverse()) {
    const parsed = parseJson(line)
    const found = findInspectionResult(parsed)
    if (found) return found
  }

  for (const block of extractJsonBlocks(stdout).reverse()) {
    const parsed = parseJson(block)
    const found = findInspectionResult(parsed)
    if (found) return found
  }
}

function findInspectionResult(value: unknown): InspectionResult | undefined {
  if (!value) return undefined
  if (typeof value === "string") return findInspectionResult(parseJson(value))
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInspectionResult(item)
      if (found) return found
    }
    return undefined
  }
  if (typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  if (record.version === 1 && typeof record.status === "string" && record.cards && typeof record.cards === "object") {
    return record as unknown as InspectionResult
  }
  for (const key of ["result", "output", "message", "content", "text", "final", "lastMessage"]) {
    const found = findInspectionResult(record[key])
    if (found) return found
  }
  return undefined
}

function parseJson(value: string | undefined): unknown {
  const text = value?.trim()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }
      continue
    }
    if (char === "\"") {
      inString = true
      continue
    }
    if (char === "{") {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (char === "}") {
      depth -= 1
      if (depth === 0 && start >= 0) {
        blocks.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }
  return blocks
}
