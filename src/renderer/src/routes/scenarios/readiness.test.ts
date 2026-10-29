import { describe, expect, it } from 'vitest'
import { Inject } from '@shared/schemas/inject'
import { Scenario, type LintWarning } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { readiness } from './readiness'

const base = Scenario.parse(fixture)
// Three rows keep the arithmetic readable.
const scenario: Scenario = { ...base, msel: base.msel.slice(0, 3), status: 'ready' }
const rowIds = scenario.msel.map((r) => r.id)

const inject = (rowId: string, rendered: boolean) =>
  Inject.parse({
    id: `inj-${rowId}`,
    mselRowId: rowId,
    type: 'email',
    title: rowId,
    assets: rendered
      ? [
          {
            id: `a-${rowId}`,
            kind: 'image',
            role: 'rendered',
            path: `scenarios/x/media/${rowId}.png`,
            provenance: { provider: 'template', createdAt: '2026-10-21T10:00:00.000Z' },
          },
        ]
      : [],
  })

const error: LintWarning = {
  code: 'PHASE_EMPTY',
  severity: 'error',
  message: 'Phase 2 has no injects',
  source: 'lint',
}

describe('scenario readiness', () => {
  it('is a draft that needs injects when the stored status says ready but no inject exists', () => {
    const r = readiness(scenario, [], [])
    expect(r).toMatchObject({ rows: 3, written: 0, rendered: 0, status: 'draft' })
    expect(r.next).toBe('write-injects')
  })

  it('asks for media once every row has an inject', () => {
    const r = readiness(
      scenario,
      rowIds.map((id) => inject(id, id === rowIds[0])),
      [],
    )
    expect(r).toMatchObject({ written: 3, rendered: 1, status: 'injects-written' })
    expect(r.next).toBe('render-media')
  })

  it('lets lint errors block "ready"', () => {
    const all = rowIds.map((id) => inject(id, true))
    expect(readiness(scenario, all, [error])).toMatchObject({
      status: 'media-rendered',
      next: 'fix-errors',
      errors: 1,
    })
    expect(readiness(scenario, all, [{ ...error, severity: 'warning' }])).toMatchObject({
      status: 'ready',
      next: 'run',
      warnings: 1,
    })
  })

  it('asks for evaluation guides on a ready scenario that has none, and stays ready (#421)', () => {
    const all = rowIds.map((id) => inject(id, true))
    const without = { ...scenario, evaluation: { objectiveCapabilities: [], eegs: [] } }
    expect(readiness(without, all, [])).toMatchObject({ status: 'ready', next: 'evaluation' })
    // The guides never gate the earlier steps.
    expect(readiness(without, all, [error]).next).toBe('fix-errors')
    expect(readiness(without, [], []).next).toBe('write-injects')
  })

  it('points at the MSEL when there are no rows, and keeps archived scenarios archived', () => {
    expect(readiness({ ...scenario, msel: [] }, [], []).next).toBe('msel')
    expect(readiness({ ...scenario, status: 'archived' }, [], []).status).toBe('archived')
  })

  it('falls back to the stored warnings until lint answers', () => {
    const withStored = { ...scenario, warnings: [error] }
    const all = rowIds.map((id) => inject(id, true))
    expect(readiness(withStored, all, undefined).errors).toBe(1)
    expect(readiness(withStored, all, []).errors).toBe(0)
  })
})
