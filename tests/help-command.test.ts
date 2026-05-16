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
  it("explains idle auto-enable state without advertising an enable command", async () => {
    const help = await renderHelp(false)

    expect(help).toContain("Status: idle - workflow commands auto-enable Revela")
    expect(help).toContain("No separate enable command is needed")
    expect(help).toContain("/revela init")
    expect(help).toContain("/revela research")
    expect(help).toContain("/revela story")
    expect(help).toContain("/revela make --deck")
    expect(help).not.toContain("Status: disabled")
    expect(help).not.toContain("/revela enable")
  })

  it("shows active status after workflow commands enable Revela", async () => {
    const help = await renderHelp(true)

    expect(help).toContain("Status: active - Revela prompt is loaded")
  })
})
