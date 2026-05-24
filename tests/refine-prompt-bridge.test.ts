import { describe, expect, it } from "bun:test"
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
      timeoutMs: 120_000,
      sandboxMode: "workspace-write",
    })
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
})
