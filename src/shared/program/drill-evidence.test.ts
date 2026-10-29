import { describe, expect, it } from 'vitest'
import type { MicroDrillSummary } from '../schemas/micro-drill'
import { drillEvidenceFor, evidenceNote, sectionsOverlap, suggestedResult } from './drill-evidence'

const run = (over: Partial<MicroDrillSummary> = {}): MicroDrillSummary => ({
  drillId: 'd1',
  runId: 'r1',
  at: '2026-10-01T10:00:00.000Z',
  planSection: {
    documentId: 'eop',
    documentTitle: 'EOP',
    headingPath: 'EOP › 6 Public Information',
  },
  coreCapabilities: [],
  participants: 3,
  minutes: 14,
  coverage: 0.75,
  hintsUsed: 2,
  ...over,
})
const snap = (drills: MicroDrillSummary[]) => ({ projectId: 'p1', name: 'NCIA', drills })
const cited = [{ documentId: 'eop', headingPath: 'EOP › 6 Public Information › 6.4 Releases' }]

describe('drillEvidenceFor', () => {
  it('offers runs on the same section or on one inside or around it, newest first', () => {
    const found = drillEvidenceFor(cited, [
      snap([
        run({ runId: 'old', at: '2026-01-01T00:00:00.000Z' }),
        run({
          runId: 'inner',
          at: '2026-11-01T00:00:00.000Z',
          planSection: {
            documentId: 'eop',
            documentTitle: 'EOP',
            headingPath: 'EOP › 6 Public Information › 6.4 Releases › Drafting',
          },
        }),
        run({
          runId: 'other',
          planSection: { documentId: 'eop', documentTitle: 'EOP', headingPath: 'EOP › 7 Recovery' },
        }),
        run({
          runId: 'otherdoc',
          planSection: {
            documentId: 'asp',
            documentTitle: 'ASP',
            headingPath: 'EOP › 6 Public Information',
          },
        }),
      ]),
    ])
    expect(found.map((f) => f.run.runId)).toEqual(['inner', 'old'])
  })

  it('offers nothing for an action that cites no plan section, or a project with no drills', () => {
    expect(drillEvidenceFor([], [snap([run()])])).toEqual([])
    expect(drillEvidenceFor(cited, [{ projectId: 'p1', name: 'NCIA' }])).toEqual([])
  })
})

describe('sectionsOverlap', () => {
  it('ignores case and spacing, and does not match a longer name that merely starts the same', () => {
    expect(sectionsOverlap('EOP › 6 Public', 'eop›6 public')).toBe(true)
    expect(sectionsOverlap('EOP › 6 Public', 'EOP › 6 Public Information')).toBe(false)
  })
})

describe('suggested result and note', () => {
  it('maps coverage to pass, partial or fail', () => {
    expect([0.9, 0.8, 0.6, 0.2].map(suggestedResult)).toEqual(['pass', 'pass', 'partial', 'fail'])
  })

  it('names the run, the date, the project and the section, without any answer text', () => {
    const note = evidenceNote({ projectId: 'p1', projectName: 'NCIA', run: run() })
    expect(note).toContain('r1')
    expect(note).toContain('2026-10-01')
    expect(note).toContain('75%')
    expect(note).toContain('EOP › 6 Public Information')
  })
})
