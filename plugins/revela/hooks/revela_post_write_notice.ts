const input = await new Response(Bun.stdin.stream()).text()
const notices: string[] = []

if (/revela-narrative\/.*\.md/.test(input)) {
  notices.push("Revela narrative Markdown changed. Run `revela_markdown_qa` and `revela_compile_narrative` before treating the graph as usable.")
}

if (/decks\/.*\.html/.test(input)) {
  notices.push("Revela deck HTML changed. Run `revela_run_deck_qa` before review or export.")
}

if (notices.length > 0) {
  console.error(notices.join("\n"))
}

process.exit(0)

export {}
