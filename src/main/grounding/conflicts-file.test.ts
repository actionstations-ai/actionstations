// plan-conflicts.json (#423, FR-12/FR-13): merging keeps decisions and verdicts, marks outdated.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PlanFinding } from '@shared/schemas'
import {
  findingId,
  mergeFindings,
  readConflicts,
  setFindingStatus,
  writeConflicts,
} from './conflicts-file'

const passage = (span: string, chunkId = 1) => ({
  documentId: 'erp',
  documentTitle: 'ERP',
  headingPath: 'ERP › 5',
  chunkId,
  span,
})
const finding = (spanA: string, spanB: string, extra: Partial<PlanFinding> = {}): PlanFinding => ({
  id: findingId('notify_deadline', spanA, spanB),
  kind: 'contradiction',
  slot: 'notify_deadline',
  slotLabel: 'How soon State EPA must be notified',
  subject: 'State EPA',
  a: passage(spanA),
  b: passage(spanB, 2),
  values: ['1 hour', '4 hours'],
  verdict: 'unconfirmed',
  status: 'open',
  foundAt: '2026-10-01T00:00:00.000Z',
  ...extra,
})

describe('findingId', () => {
  it('is 16 hex and the same whichever passage comes first', () => {
    const id = findingId('lead', 'A says one thing.', 'B says another.')
    expect(id).toMatch(/^[0-9a-f]{16}$/)
    expect(findingId('lead', 'B says another.', 'A says one thing.')).toBe(id)
    expect(findingId('approver', 'A says one thing.', 'B says another.')).not.toBe(id)
  })
})

describe('mergeFindings', () => {
  const old = finding('Notify within 1 hour.', 'Notify within 4 hours.', {
    status: 'dismissed',
    note: 'Different triggers',
    verdict: 'complementary',
    verdictQuotes: { a: 'Notify within 1 hour.', b: 'Notify within 4 hours.' },
  })

  it('keeps the decision, the note, the first date and the model verdict for an unchanged pair', () => {
    const next = finding('Notify within 1 hour.', 'Notify within 4 hours.', {
      foundAt: '2026-10-28T00:00:00.000Z',
    })
    const [merged] = mergeFindings([old], [next])
    expect(merged).toMatchObject({
      status: 'dismissed',
      note: 'Different triggers',
      verdict: 'complementary',
      foundAt: '2026-10-01T00:00:00.000Z',
    })
  })

  it('marks a finding whose passage changed as outdated and keeps the new one open', () => {
    const changed = finding('Notify within 2 hours.', 'Notify within 4 hours.')
    const merged = mergeFindings([old], [changed])
    expect(merged.map((f) => [f.id, f.status])).toEqual([
      [changed.id, 'open'],
      [old.id, 'outdated'],
    ])
  })
})

describe('reading and writing', () => {
  it('returns null before the first run and saves a decision with its note', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-conflicts-'))
    expect(await readConflicts(root)).toBeNull()
    const f = finding('Notify within 1 hour.', 'Notify within 4 hours.')
    await writeConflicts(root, {
      formatVersion: 1,
      checkedAt: '2026-10-28T00:00:00.000Z',
      documents: [],
      findings: [f],
    })
    const saved = await setFindingStatus(root, f.id, 'confirmed', '  Fix ERP 3.1  ')
    expect(saved).toMatchObject({ status: 'confirmed', note: 'Fix ERP 3.1' })
    expect((await readConflicts(root))!.findings[0]!.status).toBe('confirmed')
    await expect(
      setFindingStatus(root, 'ffffffffffffffff', 'open', undefined),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
