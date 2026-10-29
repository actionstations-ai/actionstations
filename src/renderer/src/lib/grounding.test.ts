import { describe, expect, it } from 'vitest'
import type { GroundingResult } from '@shared/schemas/grounding'
import { countLabels, countsLine, rowsToCheck } from './grounding'

const r = (label: GroundingResult['label']): GroundingResult => ({
  label,
  reason: label,
  fingerprint: 'f',
  claims: [],
  at: 'x',
  version: 1,
})

const items = {
  'row:I-01': r('grounded'),
  'row:I-02': r('review'),
  'row:I-03': r('unsupported'),
  'row:START': r('none'),
  'inject:abc': r('unsupported'),
}

describe('grounding display helpers', () => {
  it('counts the labels shown, optionally for one kind of item', () => {
    expect(countsLine(countLabels(items))).toBe('1 grounded · 1 to review · 2 unsupported')
    expect(countsLine(countLabels(items, 'row:'))).toBe('1 grounded · 1 to review · 1 unsupported')
  })

  it('lists the rows to check, unsupported first, then in MSEL order', () => {
    expect(rowsToCheck(items, ['START', 'I-01', 'I-02', 'I-03']).map((x) => x.rowId)).toEqual([
      'I-03',
      'I-02',
    ])
  })
})
