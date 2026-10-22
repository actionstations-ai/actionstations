import { diffLines } from 'diff'

export interface DiffLine {
  kind: 'same' | 'add' | 'del' | 'skip'
  text: string
}

/** Line diff from `before` to `after`; long unchanged runs collapse to a "skip" line. */
export function lineDiff(before: string, after: string, context = 2): DiffLine[] {
  const out: DiffLine[] = []
  for (const part of diffLines(before, after)) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    if (part.added || part.removed) {
      for (const text of lines) out.push({ kind: part.added ? 'add' : 'del', text })
      continue
    }
    if (lines.length <= context * 2 + 1) {
      for (const text of lines) out.push({ kind: 'same', text })
      continue
    }
    lines.slice(0, context).forEach((text) => out.push({ kind: 'same', text }))
    out.push({ kind: 'skip', text: `${lines.length - context * 2} unchanged lines` })
    lines.slice(-context).forEach((text) => out.push({ kind: 'same', text }))
  }
  return out
}
