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

const DEFAULT_COMMENT_TIMEOUT_MS = 300_000
const DEFAULT_INSPECT_TIMEOUT_MS = 120_000

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
  heartbeatMs?: number
} = {}): ReviewPromptBridge {
  const runner = options.runner ?? runCodexExec
  const heartbeatMs = options.heartbeatMs ?? 10_000
  return {
    kind: "codex-exec",
    async send(input) {
      const sandboxMode = input.action === "comment" ? "workspace-write" : "read-only"
      const timeoutMs = input.timeoutMs ?? options.timeoutMs ?? (input.action === "comment" ? DEFAULT_COMMENT_TIMEOUT_MS : DEFAULT_INSPECT_TIMEOUT_MS)
      input.onEvent?.(bridgeEvent("started", "Starting Codex..."))
      const startedAt = Date.now()
      const heartbeat = input.onEvent
        ? setInterval(() => {
          const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
          input.onEvent?.(bridgeEvent("codex_event", "Codex is still working...", `elapsedSeconds=${elapsedSeconds}`))
        }, heartbeatMs)
        : undefined
      let output: CodexExecRunResult
      try {
        output = await runner({
          action: input.action,
          prompt: input.prompt,
          workspaceRoot: input.workspaceRoot,
          timeoutMs,
          sandboxMode,
          skipGitRepoCheck: true,
          onEvent: input.onEvent,
        })
      } finally {
        if (heartbeat) clearInterval(heartbeat)
      }
      const raw = [output.stdout, output.stderr].filter(Boolean).join("\n")
      if (input.action === "comment" && isCodexWriteBlocked(raw)) {
        input.onEvent?.(bridgeEvent("failed", "codex exec could not write the deck because its sandbox blocked file changes.", boundedTail(raw)))
        return {
          ok: false,
          status: "failed",
          error: "codex exec could not write the deck because its sandbox blocked file changes.",
          raw,
        }
      }
      if (output.exitCode !== 0) {
        if (input.action === "comment" && output.exitCode === 124 && hasTrustedCodexCompletion(output.stdout)) {
          input.onEvent?.(bridgeEvent("completed", "Codex completed."))
          return { ok: true, status: "completed", raw }
        }
        input.onEvent?.(bridgeEvent("failed", `codex exec failed with exit code ${output.exitCode ?? "unknown"}.`, boundedTail(raw)))
        return {
          ok: false,
          status: "failed",
          error: `codex exec failed with exit code ${output.exitCode ?? "unknown"}.`,
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
    let sawTrustedCompletion = false
    let resolved = false
    const resolveOnce = (output: CodexExecRunResult) => {
      if (resolved) return
      resolved = true
      resolve(output)
    }
    const timer = setTimeout(() => {
      child.kill()
      const nextStderr = `${stderr}${stderr ? "\n" : ""}codex exec timed out after ${input.timeoutMs}ms.`
      if (input.action === "comment" && sawTrustedCompletion) {
        input.onEvent?.(bridgeEvent("completed", "Codex completed."))
      } else {
        input.onEvent?.(bridgeEvent("timeout", "Codex timed out before completing.", boundedTail(nextStderr)))
      }
      resolveOnce({
        exitCode: 124,
        stdout,
        stderr: nextStderr,
      })
    }, input.timeoutMs)
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString()
      stdout += text
      const progress = emitCodexJsonProgress(stdoutLineBuffer + text, input.action, input.onEvent)
      stdoutLineBuffer = progress.remainder
      sawTrustedCompletion = sawTrustedCompletion || progress.sawTrustedCompletion
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
      const progress = emitCodexJsonProgress(`${stdoutLineBuffer}\n`, input.action, input.onEvent)
      sawTrustedCompletion = sawTrustedCompletion || progress.sawTrustedCompletion
      resolveOnce({ exitCode: code, stdout, stderr })
    })
  })
}

function emitCodexJsonProgress(buffer: string, action: ReviewPromptAction, onEvent?: (event: ReviewBridgeEvent) => void): { remainder: string; sawTrustedCompletion: boolean } {
  const lines = buffer.split(/\r?\n/)
  const remainder = lines.pop() ?? ""
  let sawTrustedCompletion = false
  for (const line of lines) {
    const parsed = parseJson(line)
    sawTrustedCompletion = sawTrustedCompletion || isTrustedCodexCompletionRecord(parsed)
    const message = codexProgressMessage(parsed, action)
    if (message) {
      onEvent?.(bridgeEvent("codex_event", message, boundedTail(line)))
    } else if (parsed === undefined && line.trim()) {
      onEvent?.(bridgeEvent("stdout", "Codex wrote output.", boundedTail(line)))
    }
  }
  return { remainder, sawTrustedCompletion }
}

function codexProgressMessage(value: unknown, action: ReviewPromptAction): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  const type = typeof record.type === "string" ? record.type.toLowerCase() : ""
  const event = typeof record.event === "string" ? record.event.toLowerCase() : ""
  const name = `${type} ${event}`
  if (!name.trim()) return undefined
  const normalized = name.replace(/[._-]+/g, " ")
  if (normalized.includes("turn completed") || normalized.includes("thread completed") || normalized.includes("completed")) {
    return action === "comment" ? undefined : "Codex completed the inspection."
  }
  if (normalized.includes("thread started") || normalized.includes("turn started") || normalized.includes("session started")) {
    return "Codex started reading the deck..."
  }
  if (normalized.includes("exec") || normalized.includes("patch") || normalized.includes("tool") || normalized.includes("apply")) {
    return action === "comment" ? "Codex is applying the requested edit..." : "Codex is reading the deck..."
  }
  if (normalized.includes("session") || normalized.includes("thread") || normalized.includes("turn") || normalized.includes("start")) return "Codex is reading the deck..."
  if (normalized.includes("message") || normalized.includes("delta") || normalized.includes("agent")) return "Codex is working..."
  return "Codex is working..."
}

function bridgeEvent(type: ReviewBridgeEvent["type"], message: string, detail?: string): ReviewBridgeEvent {
  return { type, message, timestamp: Date.now(), ...(detail ? { detail } : {}) }
}

function boundedTail(text: string, limit = 4096): string {
  if (text.length <= limit) return text
  return text.slice(text.length - limit)
}

function hasTrustedCodexCompletion(stdout: string): boolean {
  for (const line of stdout.split(/\r?\n/)) {
    const parsed = parseJson(line)
    if (isTrustedCodexCompletionRecord(parsed)) return true
  }
  for (const block of extractJsonBlocks(stdout)) {
    const parsed = parseJson(block)
    if (isTrustedCodexCompletionRecord(parsed)) return true
  }
  return false
}

function isTrustedCodexCompletionRecord(value: unknown): boolean {
  if (!value) return false
  if (typeof value === "string") return isTrustedCodexCompletionRecord(parseJson(value))
  if (Array.isArray(value)) return value.some((item) => isTrustedCodexCompletionRecord(item))
  if (typeof value !== "object") return false

  const record = value as Record<string, unknown>
  const type = typeof record.type === "string" ? record.type.toLowerCase() : ""
  const event = typeof record.event === "string" ? record.event.toLowerCase() : ""
  const status = typeof record.status === "string" ? record.status.toLowerCase() : ""
  const normalized = `${type} ${event}`.replace(/[._-]+/g, " ")
  const exitCode = typeof record.exit_code === "number" ? record.exit_code : typeof record.exitCode === "number" ? record.exitCode : undefined

  if (normalized.includes("turn completed") || normalized.includes("thread completed")) return true
  if (status === "completed" && exitCode === 0) return true

  for (const key of ["item", "result", "output", "event", "payload"]) {
    if (isTrustedCodexCompletionRecord(record[key])) return true
  }
  return false
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
