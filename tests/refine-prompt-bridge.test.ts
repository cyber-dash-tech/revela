import { describe, expect, it } from "bun:test"
import { chmodSync, mkdtempSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { createCodexExecReviewPromptBridge } from "../lib/refine/prompt-bridge"

function resultJson() {
  return JSON.stringify({
    version: 1,
    status: "success",
    selectedText: "Launch",
    matchConfidence: "high",
    cards: {
      purpose: {
        status: "clear",
        role: "evidence",
        rationale: "Explains why the selected content is present.",
        whyItMatters: "It supports the slide reading.",
      },
      source: {
        status: "not_needed",
        sources: [],
        warnings: [],
        gaps: [],
        caveats: [],
        rationale: "Structural text does not need evidence.",
      },
    },
  })
}

describe("Codex exec Review prompt bridge", () => {
  it("extracts a valid inspection result from codex exec output", async () => {
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ type: "final", content: resultJson() }),
        stderr: "",
      }),
    })

    const result = await bridge.send({
      action: "inspect",
      prompt: "Inspect this selection.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
      requestId: "inspect-1",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.status).toBe("completed")
    expect(result.result).toMatchObject({ version: 1, status: "success" })
  })

  it("fails clearly when codex exec returns invalid JSON", async () => {
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({ exitCode: 0, stdout: "not json", stderr: "" }),
    })

    const result = await bridge.send({
      action: "inspect",
      prompt: "Inspect this selection.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
      requestId: "inspect-1",
    })

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error: "codex exec did not return a valid inspection result JSON object.",
    })
  })

  it("reports non-zero codex exec exit status", async () => {
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({ exitCode: 2, stdout: "", stderr: "failed" }),
    })

    const result = await bridge.send({
      action: "inspect",
      prompt: "Inspect this selection.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
      requestId: "inspect-1",
    })

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error: "codex exec failed with exit code 2.",
    })
  })

  it("runs Comment prompts through writable codex exec without requiring inspection JSON", async () => {
    let captured: { action: string; prompt: string; workspaceRoot: string; timeoutMs: number; sandboxMode: string } | undefined
    const bridge = createCodexExecReviewPromptBridge({
      runner: async (input) => {
        captured = input
        return { exitCode: 0, stdout: "patched deck", stderr: "" }
      },
    })

    const result = await bridge.send({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
    })

    expect(result).toMatchObject({
      ok: true,
      status: "completed",
      raw: "patched deck",
    })
    expect(captured).toMatchObject({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/revela",
      timeoutMs: 300_000,
      sandboxMode: "workspace-write",
    })
  })

  it("keeps the default Insight timeout shorter than Comment apply", async () => {
    let captured: { timeoutMs: number } | undefined
    const bridge = createCodexExecReviewPromptBridge({
      runner: async (input) => {
        captured = input
        return {
          exitCode: 0,
          stdout: JSON.stringify({ type: "final", content: resultJson() }),
          stderr: "",
        }
      },
    })

    await bridge.send({
      action: "inspect",
      prompt: "Inspect this selection.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
    })

    expect(captured).toMatchObject({ timeoutMs: 120_000 })
  })

  it("passes through the non-Git workspace safety bypass to codex exec runners", async () => {
    let captured: { skipGitRepoCheck?: boolean; sandboxMode: string } | undefined
    const bridge = createCodexExecReviewPromptBridge({
      runner: async (input) => {
        captured = input
        return { exitCode: 0, stdout: "patched deck", stderr: "" }
      },
    })

    await bridge.send({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/plain-deck-folder",
      file: "decks/demo.html",
    })

    expect(captured).toMatchObject({
      skipGitRepoCheck: true,
      sandboxMode: "workspace-write",
    })
  })

  it("runs Insight prompts through read-only codex exec", async () => {
    let captured: { action: string; sandboxMode: string } | undefined
    const bridge = createCodexExecReviewPromptBridge({
      runner: async (input) => {
        captured = input
        return {
          exitCode: 0,
          stdout: JSON.stringify({ type: "final", content: resultJson() }),
          stderr: "",
        }
      },
    })

    const result = await bridge.send({
      action: "inspect",
      prompt: "Inspect this selection.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
    })

    expect(result.ok).toBe(true)
    expect(captured).toMatchObject({
      action: "inspect",
      sandboxMode: "read-only",
    })
  })

  it("fails Comment prompts when codex exec exits zero but the sandbox blocked writes", async () => {
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({
        exitCode: 0,
        stdout: "ERROR codex_core::tools::router: error=patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings",
        stderr: "",
      }),
    })

    const result = await bridge.send({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
    })

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error: "codex exec could not write the deck because its sandbox blocked file changes.",
    })
  })

  it("reports non-zero codex exec exit status for Comment prompts", async () => {
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({ exitCode: 2, stdout: "", stderr: "failed" }),
    })

    const result = await bridge.send({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
    })

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error: "codex exec failed with exit code 2.",
    })
  })

  it("treats a Comment timeout after trusted Codex completion as applied", async () => {
    const events: string[] = []
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({ type: "item.completed", item: { exit_code: 0, status: "completed" } }),
    ].join("\n")
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({ exitCode: 124, stdout, stderr: "codex exec timed out after 300000ms." }),
    })

    const result = await bridge.send({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
      onEvent: (event) => events.push(`${event.type}:${event.message}`),
    })

    expect(result).toMatchObject({ ok: true, status: "completed" })
    expect(events).toContain("completed:Codex completed.")
    expect(events).not.toContain("failed:codex exec failed with exit code 124.")
  })

  it("keeps a Comment timeout failed when Codex did not emit trusted completion", async () => {
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({ exitCode: 124, stdout: JSON.stringify({ type: "turn.started" }), stderr: "codex exec timed out after 300000ms." }),
    })

    const result = await bridge.send({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
    })

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error: "codex exec failed with exit code 124.",
    })
  })

  it("does not let trusted completion override Comment sandbox write blocks", async () => {
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({
        exitCode: 124,
        stdout: JSON.stringify({ type: "turn.completed" }),
        stderr: "patch rejected: writing is blocked by read-only sandbox",
      }),
    })

    const result = await bridge.send({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
    })

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error: "codex exec could not write the deck because its sandbox blocked file changes.",
    })
  })

  it("does not treat trusted completion alone as a valid Insight result", async () => {
    const bridge = createCodexExecReviewPromptBridge({
      runner: async () => ({ exitCode: 124, stdout: JSON.stringify({ type: "turn.completed" }), stderr: "codex exec timed out after 120000ms." }),
    })

    const result = await bridge.send({
      action: "inspect",
      prompt: "Inspect this selection.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
    })

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error: "codex exec failed with exit code 124.",
    })
  })

  it("streams sanitized progress events from codex exec JSONL stdout", async () => {
    const binDir = mkdtempSync(join(tmpdir(), "revela-codex-bin-"))
    const codex = join(binDir, "codex")
    writeFileSync(codex, "#!/usr/bin/env bash\nprintf '%s\\n' '{\"type\":\"thread.started\",\"thread_id\":\"thread-1\"}' '{\"type\":\"turn.started\"}' '{\"type\":\"exec_command_begin\"}' '{\"type\":\"turn_completed\"}'\n", "utf-8")
    chmodSync(codex, 0o755)
    const previousPath = process.env.PATH
    process.env.PATH = `${binDir}:${previousPath ?? ""}`
    const events: string[] = []
    try {
      const bridge = createCodexExecReviewPromptBridge({ timeoutMs: 5000 })
      const result = await bridge.send({
        action: "comment",
        prompt: "Change this deck.",
        workspaceRoot: "/tmp",
        file: "decks/demo.html",
        onEvent: (event) => events.push(`${event.type}:${event.message}`),
      })

      expect(result.ok).toBe(true)
      expect(events).toContain("started:Starting Codex...")
      expect(events).toContain("codex_event:Codex started reading the deck...")
      expect(events).toContain("codex_event:Codex is applying the requested edit...")
      expect(events).not.toContain("codex_event:Codex completed.")
      expect(events).toContain("completed:Codex completed.")
    } finally {
      process.env.PATH = previousPath
    }
  })

  it("streams heartbeat progress while codex exec is still running", async () => {
    const events: Array<{ type: string; message: string; detail?: string }> = []
    const bridge = createCodexExecReviewPromptBridge({
      heartbeatMs: 10,
      runner: async () => {
        await new Promise((resolve) => setTimeout(resolve, 35))
        return { exitCode: 0, stdout: "patched deck", stderr: "" }
      },
    })

    const result = await bridge.send({
      action: "comment",
      prompt: "Change this deck.",
      workspaceRoot: "/tmp/revela",
      file: "decks/demo.html",
      onEvent: (event) => events.push(event),
    })

    expect(result.ok).toBe(true)
    expect(events.some((event) => event.type === "codex_event" && event.message === "Codex is still working..." && event.detail?.startsWith("elapsedSeconds="))).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: "completed", message: "Codex completed." })
  })

  it("streams bounded stderr diagnostics without exposing full output", async () => {
    const binDir = mkdtempSync(join(tmpdir(), "revela-codex-bin-"))
    const codex = join(binDir, "codex")
    writeFileSync(codex, "#!/usr/bin/env bash\nfor i in {1..5000}; do printf x >&2; done\nexit 2\n", "utf-8")
    chmodSync(codex, 0o755)
    const previousPath = process.env.PATH
    process.env.PATH = `${binDir}:${previousPath ?? ""}`
    const details: string[] = []
    try {
      const bridge = createCodexExecReviewPromptBridge({ timeoutMs: 5000 })
      const result = await bridge.send({
        action: "comment",
        prompt: "Change this deck.",
        workspaceRoot: "/tmp",
        file: "decks/demo.html",
        onEvent: (event) => {
          if (event.type === "stderr" || event.type === "failed") details.push(event.detail ?? "")
        },
      })

      expect(result.ok).toBe(false)
      expect(details.length).toBeGreaterThan(0)
      expect(Math.max(...details.map((item) => item.length))).toBeLessThanOrEqual(4096)
    } finally {
      process.env.PATH = previousPath
    }
  })
})
