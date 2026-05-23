import { spawn } from "child_process"
import type { InspectionResult } from "../inspection-context/result"

export type ReviewPromptAction = "comment" | "inspect"
export type ReviewPromptBridgeKind = "opencode" | "codex-exec"

export interface ReviewPromptInput {
  action: ReviewPromptAction
  prompt: string
  workspaceRoot: string
  file: string
  requestId?: string
  timeoutMs?: number
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
  prompt: string
  workspaceRoot: string
  timeoutMs: number
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
      const output = await runner({
        prompt: input.prompt,
        workspaceRoot: input.workspaceRoot,
        timeoutMs: input.timeoutMs ?? timeoutMs,
      })
      const raw = [output.stdout, output.stderr].filter(Boolean).join("\n")
      if (output.exitCode !== 0) {
        return {
          ok: false,
          status: "failed",
          error: `codex exec failed with exit code ${output.exitCode ?? "unknown"}.`,
          raw,
        }
      }
      if (input.action === "comment") return { ok: true, status: "completed", raw }
      const result = extractInspectionResult(output.stdout)
      if (!result) {
        return {
          ok: false,
          status: "failed",
          error: "codex exec did not return a valid inspection result JSON object.",
          raw,
        }
      }
      return { ok: true, status: "completed", result, raw }
    },
  }
}

async function runCodexExec(input: {
  prompt: string
  workspaceRoot: string
  timeoutMs: number
}): Promise<CodexExecRunResult> {
  return new Promise((resolve) => {
    const child = spawn("codex", ["exec", "--json", "--ephemeral", "-C", input.workspaceRoot, input.prompt], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill()
      resolve({
        exitCode: 124,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}codex exec timed out after ${input.timeoutMs}ms.`,
      })
    }, input.timeoutMs)
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ exitCode: 127, stdout, stderr: error.message })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code, stdout, stderr })
    })
  })
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
