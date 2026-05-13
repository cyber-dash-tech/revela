import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import decksTool from "../../tools/decks"

export function tempWorkspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export async function runDecksTool(input: Record<string, unknown>, workspaceRoot: string): Promise<string> {
  return (decksTool as any).execute(input, { directory: workspaceRoot })
}

export async function executeDecksTool<T = any>(input: Record<string, unknown>, workspaceRoot: string): Promise<T> {
  return JSON.parse(await runDecksTool(input, workspaceRoot))
}
