import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Inject, Scenario, type LintWarning } from '@shared/schemas'
import {
  critiqueFinishedAt,
  injectChangedSince,
  markStaleCritique,
  rowFingerprint,
  withBasis,
} from './critique-notes'

const FIXTURE = Scenario.parse(
  JSON.parse(
    readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
  ),
)
const REVIEWED = '2026-10-24T10:00:00.000Z'
const LATER = '2026-10-24T11:00:00.000Z'

const note = (rowId: string): LintWarning => ({
  code: 'CRITIQUE',
  severity: 'warning',
  message: `${rowId} contradicts the plan`,
  source: 'critique',
  rowId,
})

function scenarioWith(notes: LintWarning[]): Scenario {
  const s = structuredClone(FIXTURE)
  s.warnings = notes
  s.provenance = [
    {
      stage: 'critique',
      startedAt: REVIEWED,
      finishedAt: REVIEWED,
      status: 'ok',
      repairAttempts: 0,
    },
  ]
  return s
}

const [first, second] = FIXTURE.msel.filter((r) => r.purposeTag !== 'STARTEX')
const rowA = first!.id
const rowB = second!.id

function edit(s: Scenario, rowId: string, event: string): void {
  s.msel.find((r) => r.id === rowId)!.event = event
}

function injectFor(rowId: string, versions: [string, string][]): Inject {
  return Inject.parse({
    id: `inj-${rowId}`,
    mselRowId: rowId,
    type: 'email',
    title: 't',
    versions: versions.map(([at, title]) => ({
      at,
      by: 'user',
      snapshot: { title, type: 'email', fields: {}, deliveryMode: 'hand_to_role' },
    })),
  })
}

describe('critique notes go stale (#342)', () => {
  it('a note with a basis goes stale when its row changes, not when another row does', () => {
    const fresh = scenarioWith([])
    const s = scenarioWith([
      withBasis(note(rowA), fresh, REVIEWED),
      withBasis(note(rowB), fresh, REVIEWED),
    ])
    edit(s, rowB, 'A different event entirely')
    expect(markStaleCritique(s)).toEqual([rowB])
    expect(s.warnings.find((w) => w.rowId === rowA)?.stale).toBeUndefined()
    expect(s.warnings.find((w) => w.rowId === rowB)?.stale).toBe(true)
  })

  it('the basis ignores the row time and the inject link', () => {
    const s = scenarioWith([])
    const row = structuredClone(s.msel.find((r) => r.id === rowA)!)
    expect(rowFingerprint({ ...row, time: 'T+9:59', injectId: 'x' })).toBe(rowFingerprint(row))
    expect(rowFingerprint({ ...row, expectedAction: 'other' })).not.toBe(rowFingerprint(row))
  })

  it('a note without a basis goes stale when the MSEL it is compared with differs', () => {
    const s = scenarioWith([note(rowA), note(rowB)])
    const before = structuredClone(s.msel)
    edit(s, rowA, 'Corrected by hand')
    expect(markStaleCritique(s, { before })).toEqual([rowA])
    expect(s.warnings.map((w) => !!w.stale)).toEqual([true, false])
  })

  it('a stale note stays stale', () => {
    const s = scenarioWith([{ ...note(rowA), stale: true }])
    expect(markStaleCritique(s)).toEqual([])
    expect(s.warnings[0]?.stale).toBe(true)
  })

  it('an inject edited after the review makes the note on its row stale', () => {
    const s = scenarioWith([note(rowA), note(rowB)])
    expect(critiqueFinishedAt(s)).toBe(REVIEWED)
    const edited = injectFor(rowA, [
      [LATER, 'generated'],
      ['2026-10-24T12:00:00.000Z', 'corrected'],
    ])
    const untouched = injectFor(rowB, [[LATER, 'generated']])
    expect(markStaleCritique(s, { injects: [edited, untouched] })).toEqual([rowA])
  })

  it('creating an inject, or saving it unchanged, is not a change', () => {
    expect(injectChangedSince(injectFor(rowA, [[LATER, 'a']]), REVIEWED)).toBe(false)
    const same = injectFor(rowA, [
      [LATER, 'a'],
      ['2026-10-24T12:00:00.000Z', 'a'],
    ])
    expect(injectChangedSince(same, REVIEWED)).toBe(false)
    const before = injectFor(rowA, [
      ['2026-10-24T09:00:00.000Z', 'a'],
      ['2026-10-24T09:30:00.000Z', 'b'],
    ])
    expect(injectChangedSince(before, REVIEWED)).toBe(false)
  })
})
