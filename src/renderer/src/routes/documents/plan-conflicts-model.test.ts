import { describe, expect, it } from 'vitest'
import type { PlanConflictsFile, PlanFinding } from '@shared/schemas/plan-conflicts'
import { copyText, filterCounts, highlight, visibleFindings } from './plan-conflicts-model'

const passage = (title: string, span: string) => ({
  documentId: title.toLowerCase(),
  documentTitle: title,
  headingPath: `${title} › Section 3 › 3.1 Regulators`,
  chunkId: 1,
  span,
})
const f = (over: Partial<PlanFinding>): PlanFinding => ({
  id: '0123456789abcdef',
  kind: 'contradiction',
  slot: 'notify_deadline',
  slotLabel: 'How soon State EPA must be notified',
  subject: 'State EPA',
  a: passage('ERP', 'Notify the State EPA within 1 hour.'),
  b: { ...passage('Annex C', 'Notify the State EPA within 4 hours.'), page: 4 },
  values: ['1 hour', '4 hours'],
  verdict: 'unconfirmed',
  status: 'open',
  foundAt: 'x',
  ...over,
})
const file = (findings: PlanFinding[]): PlanConflictsFile => ({
  formatVersion: 1,
  checkedAt: 'x',
  documents: [],
  findings,
})

describe('plan conflicts panel model', () => {
  const data = file([
    f({}),
    f({ status: 'dismissed' }),
    f({ status: 'outdated' }),
    f({ verdict: 'consistent' }),
  ])

  it('hides outdated findings and model-cleared pairs unless asked for all', () => {
    expect(visibleFindings(data, 'open')).toHaveLength(1)
    expect(visibleFindings(data, 'dismissed')).toHaveLength(1)
    expect(visibleFindings(data, 'all')).toHaveLength(3)
    expect(filterCounts(data)).toEqual({ open: 1, dismissed: 1, confirmed: 0, all: 3 })
    expect(visibleFindings(null, 'open')).toEqual([])
  })

  it('copies both citations and quotes as plain text for the plan owner', () => {
    expect(copyText(f({ note: 'Fix ERP 3.1' }))).toBe(
      [
        'Plan check: How soon State EPA must be notified (State EPA)',
        'A: ERP › Section 3 › 3.1 Regulators',
        '“Notify the State EPA within 1 hour.”',
        'B: Annex C › Section 3 › 3.1 Regulators, p. 4',
        '“Notify the State EPA within 4 hours.”',
        'Values: “1 hour” and “4 hours”',
        'Reviewer note: Fix ERP 3.1',
      ].join('\n'),
    )
  })

  it('splits a span around its value for highlighting', () => {
    expect(highlight('Notify the State EPA within 4 hours.', '4 hours')).toEqual([
      'Notify the State EPA within ',
      '4 hours',
      '.',
    ])
    expect(highlight('No value here', 'x')).toEqual(['No value here', '', ''])
  })
})
