import { resolveDesignPreview } from "../design/designs"

function openFile(filePath: string): void {
  if (process.platform === "darwin") {
    const proc = Bun.spawnSync(["open", filePath])
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open preview")
    return
  }

  if (process.platform === "win32") {
    const proc = Bun.spawnSync(["cmd", "/c", "start", "", filePath])
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open preview")
    return
  }

  const proc = Bun.spawnSync(["xdg-open", filePath])
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || "Failed to open preview")
}

export async function handleDesignsPreview(
  name: string,
  send: (text: string) => Promise<void>,
): Promise<void> {
  try {
    const preview = resolveDesignPreview(name || undefined)
    if (!preview.hasPreview) {
      await send(`Design \`${preview.name}\` has no \`preview.html\`.`)
      return
    }

    openFile(preview.previewPath)
    await send(`Opened preview for design \`${preview.name}\`: \`${preview.previewPath}\``)
  } catch (e: any) {
    await send(`**Preview failed:** ${e.message || String(e)}`)
  }
}
