// A word-level diff (#431, FR-3, NFR-3): deleted words are struck through and red, inserted words
// underlined and blue, and each run also carries a text label for screen readers, so the change
// never rests on colour alone.
import { useMemo } from 'react'
import { wordDiff } from '@shared/redline/diff'

export function DiffView(props: { original: string; proposed: string }) {
  const ops = useMemo(
    () => wordDiff(props.original, props.proposed),
    [props.original, props.proposed],
  )
  return (
    <p className="diff" aria-label="Proposed change, with deleted and inserted words marked">
      {ops.map((op, i) =>
        op.kind === 'equal' ? (
          <span key={i}>{op.text}</span>
        ) : op.kind === 'del' ? (
          <del key={i} className="diff__del">
            <span className="sr-only">deleted: </span>
            {op.text}
          </del>
        ) : (
          <ins key={i} className="diff__ins">
            <span className="sr-only">inserted: </span>
            {op.text}
          </ins>
        ),
      )}
    </p>
  )
}

export function DiffLegend() {
  return (
    <p className="muted diff__legend">
      <del className="diff__del">Struck through</del> words are deleted;{' '}
      <ins className="diff__ins">underlined</ins> words are new.
    </p>
  )
}
