// The pure parts of regression drills (#431): verdicts, the latest rating per criterion, the
// cards added around the copied rows, and citations that follow a replaced plan.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { DocumentMeta, Scenario, verdictOf } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { latestRatings } = await import('./ratings')
const { withControlCards, selectedRows, fallbackSituation } = await import('./build')
const { reresolveCitations, supersessionMap, nearestHeading } = await import('./citations')
const { actionVerdicts } = await import('./record')
const { resultsCsv } = await import('./export')

const scenario = Scenario.parse(
  JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)
const obs = (
  id: string,
  at: string,
  rating: 'met' | 'partial' | 'not_met' | 'not_observed',
  extra: Record<string, string>,
) => ({ id, at, rating, ...extra })

describe('verdictOf', () => {
  it('passes only when every observed criterion is met', () => {
    expect(verdictOf(['met', 'met']).verdict).toBe('pass')
    expect(verdictOf(['met', 'partial']).verdict).toBe('partial')
    expect(verdictOf(['met', 'not_met', 'partial']).verdict).toBe('fail')
  })

  it('ignores criteria nobody observed, unless none was observed', () => {
    expect(verdictOf(['met', 'not_observed']).verdict).toBe('pass')
    expect(verdictOf(['not_observed', 'not_observed'])).toEqual({
      verdict: 'partial',
      note: 'not observed',
    })
    expect(verdictOf([])).toEqual({ verdict: 'partial', note: 'not observed' })
  })
})

describe('latestRatings', () => {
  it('takes the latest observation per row and criterion', () => {
    const rated = latestRatings(scenario, [
      obs('o1', '2026-01-01T10:00:00Z', 'not_met', { rowId: 'I-06', taskId: 'T-07' }),
      obs('o2', '2026-01-01T10:05:00Z', 'met', { rowId: 'I-06', taskId: 'T-07' }),
      obs('o3', '2026-01-01T10:06:00Z', 'partial', { rowId: 'I-09', criterionId: 'T-14' }),
    ])
    const get = (row: string, id: string) =>
      rated.find((r) => r.rowId === row && r.criterionId === id)?.rating
    expect(get('I-06', 'T-07')).toBe('met')
    expect(get('I-09', 'T-14')).toBe('partial')
    expect(get('I-09', 'T-07')).toBe('not_observed')
  })

  it('rates a criterion on every row that carries it when the observation names no row', () => {
    const rated = latestRatings(scenario, [
      obs('o1', '2026-01-01T10:00:00Z', 'not_met', { taskId: 'T-07' }),
    ])
    expect(rated.filter((r) => r.criterionId === 'T-07').map((r) => r.rating)).toEqual([
      'not_met',
      'not_met',
    ])
  })
})

describe('drill cards', () => {
  const rows = selectedRows(scenario, ['I-06', 'I-09', 'I-10', 'START'])

  it('keeps source rows only and drops control cards', () => {
    expect(rows.map((r) => r.id)).toEqual(['I-06', 'I-09', 'I-10'])
  })

  it('opens with STARTEX, jumps over gaps longer than 20 minutes and closes with ENDEX', () => {
    const out = withControlCards(rows, 'The terminal is on manual procedures.')
    expect(out.map((r) => r.id)).toEqual(['START', 'I-06', 'TJ-1', 'I-09', 'I-10', 'END'])
    expect(out[0]!.purposeTag).toBe('STARTEX')
    expect(out[0]!.event).toContain('manual procedures')
    expect(out[2]!.purposeTag).toBe('TIME_JUMP')
    expect(out[2]!.event).toContain('It is now 11:00')
    expect(out.at(-1)!.purposeTag).toBe('ENDEX')
  })

  it('writes a fallback situation from the events before the first row', () => {
    const text = fallbackSituation(scenario.msel.slice(1, 4), rows[0]!)
    expect(text).toContain(scenario.msel[3]!.event.trim())
    expect(text).toContain('The next event:')
  })
})

describe('citations after a plan update', () => {
  const doc = (id: string, extra: Record<string, unknown> = {}) =>
    DocumentMeta.parse({ id, title: `Plan ${id}`, filename: `${id}.docx`, ...extra })
  const chunk = (id: number, headingPath: string, documentId = 'v2') => ({
    id,
    documentId,
    headingPath,
    ord: id,
    text: 't',
    tokenCount: 1,
  })
  const cite = {
    documentId: 'v1',
    documentTitle: 'Plan v1',
    headingPath: 'EOP › 6.4 Public Information',
    quote: 'old quote',
  }

  it('follows chains of replacement to the newest plan', () => {
    const map = supersessionMap([
      doc('v1'),
      doc('v2', { supersedesDocumentId: 'v1' }),
      doc('v3', { supersedesDocumentId: 'v2' }),
    ])
    expect(map.get('v1')!.id).toBe('v3')
    expect(map.get('v2')!.id).toBe('v3')
  })

  it('points the citation at the same heading of the new plan', () => {
    const map = supersessionMap([doc('v1'), doc('v2', { supersedesDocumentId: 'v1' })])
    const r = reresolveCitations([cite], map, () => [chunk(9, 'EOP › 6.4 Public Information')])
    expect(r.warnings).toEqual([])
    expect(r.citations[0]).toMatchObject({ documentId: 'v2', chunkId: 9 })
    expect(r.citations[0]!.quote).toBeUndefined()
  })

  it('warns CITATION_MOVED with the nearest heading when the section is gone', () => {
    const map = supersessionMap([doc('v1'), doc('v2', { supersedesDocumentId: 'v1' })])
    const chunks = [chunk(1, 'EOP › 7.1 Public Information and Warning'), chunk(2, 'EOP › 9 Annex')]
    const r = reresolveCitations([cite], map, () => chunks, 'I-09')
    expect(r.citations[0]!.documentId).toBe('v1')
    expect(r.warnings[0]).toMatchObject({
      code: 'CITATION_MOVED',
      rowId: 'I-09',
      suggestion: 'EOP › 7.1 Public Information and Warning',
    })
    expect(nearestHeading(chunks, 'EOP › 6.4 Zebra')).toBeUndefined()
  })

  it('leaves citations of other documents alone', () => {
    const other = { ...cite, documentId: 'tirp' }
    expect(reresolveCitations([other], new Map(), () => []).citations).toEqual([other])
  })
})

describe('run verdicts and results', () => {
  const rated = [
    { rowId: 'I-06', criterionId: 'T-07', rating: 'met' as const },
    { rowId: 'I-09', criterionId: 'T-14', rating: 'not_met' as const },
    { rowId: 'I-09', criterionId: 'T-07', rating: 'not_observed' as const },
  ]

  it('gives each corrective action the verdict of its own criteria', () => {
    const out = actionVerdicts(
      {
        correctiveActionIds: ['a', 'b', 'c'],
        actionCriteria: { a: ['I-06|T-07'], b: ['I-06|T-07', 'I-09|T-14'], c: ['I-09|T-07'] },
      },
      rated,
    )
    expect(out).toEqual([
      { id: 'a', verdict: 'pass' },
      { id: 'b', verdict: 'fail' },
      { id: 'c', verdict: 'partial', note: 'not observed' },
    ])
  })

  it('writes one csv line per criterion and corrective action, with formulas neutralized', () => {
    const csv = resultsCsv({
      runs: [
        {
          id: 'r1',
          ranAt: '2026-06-10T10:00:00.000Z',
          documentHashes: {},
          criteria: [{ rowId: 'I-06', criterionId: '=T-07', rating: 'partial' }],
          correctiveActions: [{ id: 'a', verdict: 'fail' }],
          programRecorded: false,
        },
      ],
    })
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Run date,Session,Kind,Row,Id,Result')
    expect(lines[1]).toBe("2026-06-10,,Criterion,I-06,'=T-07,Partial")
    expect(lines[2]).toBe('2026-06-10,,Corrective action,,a,Fail')
  })
})
