import { describe, expect, it } from "bun:test"
import { handleHelp } from "../lib/commands/help"
import { ctx } from "../lib/ctx"

async function renderHelp(enabled: boolean): Promise<string> {
  const previous = ctx.enabled
  ctx.enabled = enabled
  const messages: string[] = []
  try {
    await handleHelp(async (text) => {
      messages.push(text)
    })
  } finally {
    ctx.enabled = previous
  }
  return messages.join("\n")
}

describe("help command", () => {
  it("starts with Revela enabled by default", () => {
    expect(ctx.enabled).toBe(true)
  })

  it("explains disabled state and advertises enable/disable controls", async () => {
    const help = await renderHelp(false)

    expect(help).toContain("Status: disabled - run `/revela enable` or any workflow command")
    expect(help).toContain("Workflow commands still auto-enable Revela")
    expect(help).toContain("/revela init")
    expect(help).toContain("ask key questions, and recommend next steps")
    expect(help).toContain("/revela research")
    expect(help).toContain("/revela story")
    expect(help).toContain("/revela make --deck")
    expect(help).toContain("/revela enable")
    expect(help).toContain("/revela disable")
  })

  it("shows enabled status after workflow commands enable Revela", async () => {
    const help = await renderHelp(true)

    expect(help).toContain("Status: enabled - Revela prompt is loaded")
  })
})
