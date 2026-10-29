// Calibration (#423): 60 MSEL rows from the shipped examples, labelled by hand (20 per label),
// with the full text of the chunks they cite. Four unsupported cases change a duration from the
// plan's; two cite a chunk that is no longer in the index. Thresholds in constants.ts must keep
// agreement at 85% or better and never call a hand-labelled "unsupported" row grounded.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Citation, GroundingLabel } from '@shared/schemas'
import { labelClaims } from './label'
import { preparePassage, type Passage } from './support'

interface CalibrationCase {
  id: string
  label: Exclude<GroundingLabel, 'none'>
  note?: string
  claimText: string
  referenceText?: string
  citations: Citation[]
  passages: Passage[]
  facts: string[]
  ignore: string[]
}

const CASES = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures/calibration.json'), 'utf8'),
) as CalibrationCase[]

function run(c: CalibrationCase) {
  return labelClaims({
    claimText: c.claimText,
    ...(c.referenceText ? { referenceText: c.referenceText } : {}),
    citations: c.citations,
    passages: c.passages.map(preparePassage),
    facts: new Set(c.facts),
    anchorOptions: { ignore: c.ignore },
  })
}

describe('grounding calibration set', () => {
  const results = CASES.map((c) => ({ c, out: run(c) }))

  it('has 20 hand-labelled cases per label', () => {
    for (const label of ['grounded', 'review', 'unsupported'])
      expect(CASES.filter((c) => c.label === label)).toHaveLength(20)
  })

  it('agrees with the hand labels on at least 85% of the cases', () => {
    const agree = results.filter(({ c, out }) => out.label === c.label).length
    const misses = results
      .filter(({ c, out }) => out.label !== c.label)
      .map(({ c, out }) => `${c.id}: hand ${c.label}, checker ${out.label} (${out.reason})`)
    expect(agree / CASES.length, misses.join('\n')).toBeGreaterThanOrEqual(0.85)
  })

  it('never calls a hand-labelled unsupported case grounded', () => {
    const wrong = results.filter(
      ({ c, out }) => c.label === 'unsupported' && out.label === 'grounded',
    )
    expect(wrong.map(({ c }) => c.id)).toEqual([])
  })

  it('names the changed duration and the plan’s own value in the reason', () => {
    const changed = results.find(
      ({ c }) => c.id.startsWith('gas-distribution/') && c.id.endsWith('/changed'),
    )!
    expect(changed.out.label).toBe('unsupported')
    expect(changed.out.reason).toContain('‘45 minutes’')
    expect(changed.out.reason).toContain('20 minutes')
  })

  it('treats a cited chunk that left the index as missing', () => {
    const removed = results.filter(({ c }) => c.id.endsWith('/removed'))
    expect(removed).toHaveLength(2)
    for (const { out } of removed) {
      expect(out.label).toBe('unsupported')
      expect(out.reason).toMatch(/no longer in the index/)
    }
  })
})
