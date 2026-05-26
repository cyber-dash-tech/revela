import { statSync } from "fs"
import { Jimp } from "jimp"

export interface PngValidationResult {
  width: number
  height: number
  fileSize: number
}

export async function validatePngOutput(path: string): Promise<PngValidationResult> {
  const fileSize = statSync(path).size
  const image = await Jimp.read(path)
  const { width, height, data } = image.bitmap
  if (width <= 0 || height <= 0) throw new Error("PNG output has invalid dimensions")
  if (fileSize <= 0) throw new Error("PNG output is empty")

  const samples = samplePixels(width, height)
  let varied = false
  let visible = false
  let first: string | undefined

  for (const [x, y] of samples) {
    const idx = (y * width + x) * 4
    const rgba = `${data[idx]},${data[idx + 1]},${data[idx + 2]},${data[idx + 3]}`
    if ((data[idx + 3] ?? 0) > 8) visible = true
    first ??= rgba
    if (rgba !== first) varied = true
  }

  if (!visible) throw new Error("PNG output appears fully transparent")
  if (!varied && width * height > 1) throw new Error("PNG output appears flat")

  return { width, height, fileSize }
}

function samplePixels(width: number, height: number): Array<[number, number]> {
  const xs = [0.1, 0.25, 0.5, 0.75, 0.9].map((v) => Math.min(width - 1, Math.max(0, Math.floor(width * v))))
  const ys = [0.1, 0.25, 0.5, 0.75, 0.9].map((v) => Math.min(height - 1, Math.max(0, Math.floor(height * v))))
  const out: Array<[number, number]> = []
  for (const y of ys) {
    for (const x of xs) out.push([x, y])
  }
  return out
}
