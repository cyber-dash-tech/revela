export const DEFAULT_SINGLE_PAGE_SELECTORS = [".poster", ".artifact", "main", "body"]

export interface SelectorChoice {
  selector: string
  attempted: string[]
}

export function chooseSelector(input?: string): SelectorChoice {
  const trimmed = input?.trim()
  if (trimmed) return { selector: trimmed, attempted: [trimmed] }
  return { selector: DEFAULT_SINGLE_PAGE_SELECTORS[0], attempted: [...DEFAULT_SINGLE_PAGE_SELECTORS] }
}
