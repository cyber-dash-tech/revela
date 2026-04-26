import { describe, expect, it } from "bun:test"
import {
  buildDecksMemoryLayer,
  createDecksMemoryTemplate,
  extractDecksPromptMemory,
} from "../lib/decks-memory"
import { buildInitPrompt } from "../lib/commands/init"
import { buildRememberPrompt, parseRememberArgs } from "../lib/commands/remember"

describe("extractDecksPromptMemory", () => {
  it("extracts only prompt-relevant sections", () => {
    const memory = extractDecksPromptMemory(`# DECKS.md

## Project Brief
Investor update workspace.

## Source Materials
| Path | Type |
|---|---|
| source.pdf | PDF |

## Audience & Usage
Board and investors.

## User Preferences
Use concise Chinese.

## Research Notes
Long research notes should stay out of the default prompt.

## Open Questions
Need latest ARR.
`)

    expect(memory).toContain("## Project Brief")
    expect(memory).toContain("Investor update workspace")
    expect(memory).toContain("## Audience & Usage")
    expect(memory).toContain("## User Preferences")
    expect(memory).toContain("## Open Questions")
    expect(memory).not.toContain("## Source Materials")
    expect(memory).not.toContain("## Research Notes")
  })

  it("truncates long memory for prompt size", () => {
    const memory = extractDecksPromptMemory(`## Project Brief\n${"a".repeat(100)}`, 40)
    expect(memory).toContain("truncated")
    expect(memory.length).toBeGreaterThan(40)
  })
})

describe("buildDecksMemoryLayer", () => {
  it("returns empty when DECKS.md is missing", () => {
    const layer = buildDecksMemoryLayer("/definitely/missing/revela/workspace")
    expect(layer).toBe("")
  })
})

describe("createDecksMemoryTemplate", () => {
  it("contains the required memory sections", () => {
    const template = createDecksMemoryTemplate()
    expect(template).toContain("## Project Brief")
    expect(template).toContain("## User Preferences")
    expect(template).toContain("## Workflow Preferences")
    expect(template).toContain("## Maintenance Rules")
  })
})

describe("buildInitPrompt", () => {
  it("instructs the agent to scan workspace and write DECKS.md", () => {
    const prompt = buildInitPrompt({ exists: false })
    expect(prompt).toContain("revela-workspace-scan")
    expect(prompt).toContain("revela-extract-document-materials")
    expect(prompt).toContain("DECKS.md")
    expect(prompt).toContain("Do not infer personal preferences")
  })

  it("instructs the agent to scan generated deck history separately", () => {
    const prompt = buildInitPrompt({ exists: false })
    expect(prompt).toContain("deck outputs and deck history")
    expect(prompt).toContain("decks/**/*.html")
    expect(prompt).toContain("slides/**/*.html")
    expect(prompt).toContain("presentations/**/*.html")
    expect(prompt).toContain("generated/output decks")
    expect(prompt).toContain("not necessarily source materials")
  })

  it("preserves existing DECKS.md when present", () => {
    const prompt = buildInitPrompt({ exists: true })
    expect(prompt).toContain("already exists")
    expect(prompt).toContain("do not delete User Preferences")
  })
})

describe("remember command", () => {
  it("requires memory text", () => {
    expect(parseRememberArgs(" ").ok).toBe(false)
  })

  it("parses memory text without modifying it", () => {
    expect(parseRememberArgs("我偏好中文、咨询风格")).toEqual({ ok: true, memory: "我偏好中文、咨询风格" })
  })

  it("builds a prompt that updates only preference sections", () => {
    const prompt = buildRememberPrompt({ memory: "Prefer Chinese consulting style", exists: true })
    expect(prompt).toContain("Prefer Chinese consulting style")
    expect(prompt).toContain("User Preferences")
    expect(prompt).toContain("Workflow Preferences")
    expect(prompt).toContain("Do not add inferred preferences")
  })
})
