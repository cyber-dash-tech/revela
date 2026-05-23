const input = await new Response(Bun.stdin.stream()).text()

if (input.includes("DECKS.json")) {
  console.error("Revela controls DECKS.json. Use Revela MCP/runtime tools or file-native narrative files instead of direct DECKS.json patches.")
  process.exit(2)
}

process.exit(0)

export {}
