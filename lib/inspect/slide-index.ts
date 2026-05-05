export function canonicalInspectSlideIndex(input: {
  dataSlideIndex?: string | number | null
  domOrdinal?: number
}): number | undefined {
  if (input.dataSlideIndex === undefined || input.dataSlideIndex === null || input.dataSlideIndex === "") {
    return typeof input.domOrdinal === "number" && input.domOrdinal >= 0 ? input.domOrdinal + 1 : undefined
  }
  const explicit = Number(input.dataSlideIndex)
  if (!Number.isNaN(explicit)) return explicit
  if (typeof input.domOrdinal === "number" && input.domOrdinal >= 0) return input.domOrdinal + 1
  return undefined
}
