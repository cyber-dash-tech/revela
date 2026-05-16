import { describe, expect, it } from "bun:test"
import { appendToolResult } from "../lib/tool-result"

describe("appendToolResult", () => {
  it("appends to common string output shapes", () => {
    const outputShape = { output: "original" }
    const resultShape = { result: "original" }
    const textShape = { text: "original" }
    const messageShape = { message: "original" }

    appendToolResult(outputShape, "Markdown QA: blocked")
    appendToolResult(resultShape, "Markdown QA: blocked")
    appendToolResult(textShape, "Markdown QA: blocked")
    appendToolResult(messageShape, "Markdown QA: blocked")

    expect(outputShape.output).toContain("original\n\nMarkdown QA: blocked")
    expect(resultShape.result).toContain("original\n\nMarkdown QA: blocked")
    expect(textShape.text).toContain("original\n\nMarkdown QA: blocked")
    expect(messageShape.message).toContain("original\n\nMarkdown QA: blocked")
  })

  it("appends to content arrays and falls back to output", () => {
    const contentShape: any = { content: [{ type: "text", text: "original" }] }
    const unknownShape: any = {}

    appendToolResult(contentShape, "Markdown QA: blocked")
    appendToolResult(unknownShape, "Markdown QA: blocked")

    expect(contentShape.content.at(-1)).toEqual({ type: "text", text: "Markdown QA: blocked" })
    expect(unknownShape.output).toBe("Markdown QA: blocked")
  })
})
