/** Move an item; out-of-range targets leave the list unchanged. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

export const replaceAt = <T>(list: T[], i: number, item: T): T[] =>
  list.map((x, j) => (j === i ? item : x))
