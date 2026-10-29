// Word-level diff for redlines (#431, NFR-5): pure, shared by the diff view in the renderer and
// by the change memo in main. Whitespace stays in the output so joined text reads as written.
import { diffWordsWithSpace } from 'diff'

export type DiffKind = 'equal' | 'del' | 'ins'
export interface DiffOp {
  kind: DiffKind
  text: string
}

/** The edit from `a` to `b` as equal, deleted and inserted runs, in reading order. */
export function wordDiff(a: string, b: string): DiffOp[] {
  return diffWordsWithSpace(a, b).map((part) => ({
    kind: part.added ? 'ins' : part.removed ? 'del' : 'equal',
    text: part.value,
  }))
}

/** Text of the ops that survive when every change is accepted. */
export const acceptedText = (ops: DiffOp[]): string =>
  ops
    .filter((o) => o.kind !== 'del')
    .map((o) => o.text)
    .join('')

/** Text of the ops as they were before the change. */
export const originalText = (ops: DiffOp[]): string =>
  ops
    .filter((o) => o.kind !== 'ins')
    .map((o) => o.text)
    .join('')
