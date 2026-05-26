import { Jimp } from "jimp"

export interface TrimOptions {
  enabled: boolean
  color?: string
  threshold?: number
  padding?: number
}

export function parseHexColor(value = "#020615"): { r: number; g: number; b: number } {
  const normalized = value.trim().replace(/^#/, "")
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return { r: 2, g: 6, b: 21 }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

export function findTrimmedHeight(image: InstanceType<typeof Jimp>, options: TrimOptions): number {
  if (!options.enabled) return image.bitmap.height

  const { width, height, data } = image.bitmap
  const color = parseHexColor(options.color)
  const threshold = options.threshold ?? 8
  const padding = Math.max(0, Math.floor(options.padding ?? 0))
  const requiredBlankRows = Math.min(24, Math.max(4, Math.floor(height * 0.003)))
  let blankRun = 0
  let trimStart = height

  for (let y = height - 1; y >= 0; y--) {
    let rowBlank = true
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const a = data[idx + 3] ?? 255
      const r = data[idx] ?? 0
      const g = data[idx + 1] ?? 0
      const b = data[idx + 2] ?? 0
      const close =
        Math.abs(r - color.r) <= threshold &&
        Math.abs(g - color.g) <= threshold &&
        Math.abs(b - color.b) <= threshold
      if (a > 8 && !close) {
        rowBlank = false
        break
      }
    }

    if (rowBlank) {
      blankRun += 1
      if (blankRun >= requiredBlankRows) trimStart = y
      continue
    }

    break
  }

  if (trimStart >= height) return height
  return Math.min(height, Math.max(1, trimStart + padding))
}
