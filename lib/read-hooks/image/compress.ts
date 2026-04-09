/**
 * lib/read-hooks/image/compress.ts
 *
 * Image compression using jimp (pure JS, zero native dependencies, 14k+ stars).
 * Goal: reduce base64 attachment size to save LLM context tokens.
 *
 * Strategy:
 * - Resize to max 1024px on longest side (preserving aspect ratio)
 * - Convert to JPEG at 60% quality
 * - This typically achieves 60-80% size reduction
 */

import { Jimp } from "jimp"

const MAX_DIMENSION = 1024
const JPEG_QUALITY = 60

/**
 * Compress an image buffer.
 * Returns a JPEG buffer regardless of input format.
 */
export async function compressImage(buf: Buffer): Promise<Buffer> {
  const image = await Jimp.read(buf)
  const { width, height } = image.bitmap

  // Proportional resize if either dimension exceeds MAX_DIMENSION
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      image.resize({ w: MAX_DIMENSION })
    } else {
      image.resize({ h: MAX_DIMENSION })
    }
  }

  return await image.getBuffer("image/jpeg", { quality: JPEG_QUALITY })
}
