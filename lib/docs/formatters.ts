export function safeTruncate(text: string | undefined, max = 1000): string {
  if (!text) return ''
  const t = String(text)
  if (t.length <= max) return t
  const slice = t.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice) + '…'
}

export function splitParagraphs(text: string | undefined): string[] {
  if (!text) return []
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function bulletsFromList(list: (string | undefined)[] | undefined, max = 10): string[] {
  if (!list) return []
  return list.map((s) => (s ? s.trim() : '')).filter(Boolean).slice(0, max)
}

export function toTwoColumn<T>(items: T[], leftCount: number): [T[], T[]] {
  const left = items.slice(0, leftCount)
  const right = items.slice(leftCount)
  return [left, right]
}

