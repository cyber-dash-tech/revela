import type { PromptMode } from "./prompt-builder"

export interface PendingCommandIntent {
  sessionID: string
  name: string
  mode: PromptMode
  visibleText: string
  hiddenPrompt: string
  createdAt: number
}

const pendingCommandIntents = new Map<string, PendingCommandIntent>()

export function setPendingCommandIntent(intent: Omit<PendingCommandIntent, "createdAt"> & { createdAt?: number }): PendingCommandIntent {
  const normalized: PendingCommandIntent = {
    ...intent,
    createdAt: intent.createdAt ?? Date.now(),
  }
  pendingCommandIntents.set(normalized.sessionID, normalized)
  return normalized
}

export function peekPendingCommandIntent(sessionID: string): PendingCommandIntent | undefined {
  if (!sessionID) return undefined
  return pendingCommandIntents.get(sessionID)
}

export function takePendingCommandIntent(sessionID: string): PendingCommandIntent | undefined {
  if (!sessionID) return undefined
  const intent = pendingCommandIntents.get(sessionID)
  if (intent) pendingCommandIntents.delete(sessionID)
  return intent
}

export function clearPendingCommandIntent(sessionID: string): void {
  if (!sessionID) return
  pendingCommandIntents.delete(sessionID)
}

export function clearAllPendingCommandIntents(): void {
  pendingCommandIntents.clear()
}

export function formatCommandIntentSystemBlock(intent: PendingCommandIntent): string {
  return [
    "<revela-command-intent>",
    `User invoked: /revela ${intent.name}`,
    `Prompt mode: ${intent.mode}`,
    "Visible user intent:",
    intent.visibleText,
    "",
    "Execute the hidden workflow instructions below with the available Revela tools.",
    "Do not persist this command block as workspace memory or user preference.",
    "",
    "Hidden workflow instructions:",
    intent.hiddenPrompt,
    "</revela-command-intent>",
  ].join("\n")
}
