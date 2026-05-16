export function appendToolResult(output: any, text: string): void {
  if (!output || typeof output !== "object") return

  if (typeof output.output === "string") {
    output.output = appendText(output.output, text)
    return
  }

  if (typeof output.result === "string") {
    output.result = appendText(output.result, text)
    return
  }

  if (typeof output.text === "string") {
    output.text = appendText(output.text, text)
    return
  }

  if (typeof output.message === "string") {
    output.message = appendText(output.message, text)
    return
  }

  if (Array.isArray(output.content)) {
    output.content.push({ type: "text", text })
    return
  }

  output.output = text
}

function appendText(existing: string, text: string): string {
  return (existing ? `${existing}\n\n` : "") + text
}
