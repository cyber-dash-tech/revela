import { afterEach, describe, expect, it } from "bun:test"
import {
  clearAllPendingCommandIntents,
  clearPendingCommandIntent,
  formatCommandIntentSystemBlock,
  peekPendingCommandIntent,
  setPendingCommandIntent,
  takePendingCommandIntent,
} from "../lib/command-intent"

afterEach(() => {
  clearAllPendingCommandIntents()
})

describe("command intent store", () => {
  it("stores pending command intent by session", () => {
    setPendingCommandIntent({
      sessionID: "session-a",
      name: "init",
      mode: "narrative",
      visibleText: "Initialize Revela workspace.",
      hiddenPrompt: "Initialize with full workflow.",
      createdAt: 123,
    })

    const intent = peekPendingCommandIntent("session-a")
    expect(intent?.name).toBe("init")
    expect(intent?.createdAt).toBe(123)
    expect(peekPendingCommandIntent("session-b")).toBeUndefined()
  })

  it("takes pending command intent once", () => {
    setPendingCommandIntent({
      sessionID: "session-a",
      name: "story",
      mode: "narrative",
      visibleText: "Review Revela story readiness.",
      hiddenPrompt: "Review with full workflow.",
    })

    expect(takePendingCommandIntent("session-a")?.hiddenPrompt).toContain("full workflow")
    expect(takePendingCommandIntent("session-a")).toBeUndefined()
  })

  it("clears only the matching session", () => {
    setPendingCommandIntent({ sessionID: "session-a", name: "init", mode: "narrative", visibleText: "A", hiddenPrompt: "A hidden" })
    setPendingCommandIntent({ sessionID: "session-b", name: "make deck", mode: "deck-render", visibleText: "B", hiddenPrompt: "B hidden" })

    clearPendingCommandIntent("session-a")

    expect(peekPendingCommandIntent("session-a")).toBeUndefined()
    expect(peekPendingCommandIntent("session-b")?.name).toBe("make deck")
  })

  it("formats a hidden system block without dropping command metadata", () => {
    const block = formatCommandIntentSystemBlock({
      sessionID: "session-a",
      name: "init",
      mode: "narrative",
      visibleText: "Initialize Revela workspace.",
      hiddenPrompt: "Workflow:\n1. Scan workspace.",
      createdAt: 123,
    })

    expect(block).toContain("<revela-command-intent>")
    expect(block).toContain("User invoked: /revela init")
    expect(block).toContain("Prompt mode: narrative")
    expect(block).toContain("Initialize Revela workspace.")
    expect(block).toContain("Workflow:\n1. Scan workspace.")
    expect(block).toContain("Do not persist this command block")
  })
})
