import { describe, expect, it } from 'vitest'
import type { DocumentMeta, ScenarioMeta } from '@shared/schemas/project'
import type { Readiness } from '../scenarios/readiness'
import { buildChecklist, targetScenario, type ChecklistInput } from './checklist'

const doc = (status: DocumentMeta['status']) => ({ status }) as DocumentMeta
const meta = (id: string, updatedAt: string, status: ScenarioMeta['status'] = 'draft') => ({
  id,
  title: id,
  status,
  updatedAt,
})
const ready = (over: Partial<Readiness> = {}): Readiness => ({
  rows: 6,
  written: 0,
  rendered: 0,
  errors: 0,
  warnings: 0,
  status: 'draft',
  next: 'write-injects',
  ...over,
})

const input = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
  project: { documents: [] },
  facts: undefined,
  target: undefined,
  scenarioCount: 0,
  readiness: undefined,
  ...over,
})

const states = (i: ChecklistInput) => buildChecklist(i).map((s) => `${s.id}:${s.state}`)

describe('project checklist', () => {
  it('starts at documents for a new project', () => {
    expect(states(input())).toEqual([
      'documents:current',
      'facts:todo',
      'generate:todo',
      'injects:todo',
      'media:todo',
      'run:todo',
    ])
    expect(buildChecklist(input())[0]).toMatchObject({
      to: 'documents',
      action: 'Import documents',
    })
  })

  it('does not count documents still indexing', () => {
    const steps = buildChecklist(input({ project: { documents: [doc('embedding')] } }))
    expect(steps[0]).toMatchObject({
      state: 'current',
      detail: '0 documents ready, 1 still indexing.',
    })
  })

  it('moves to generation once documents and facts exist', () => {
    const i = input({ project: { documents: [doc('ok')] }, facts: 62 })
    expect(states(i).slice(0, 3)).toEqual(['documents:done', 'facts:done', 'generate:current'])
    expect(buildChecklist(i)[1]!.detail).toMatch(/^62 facts found/)
  })

  it('follows the latest scenario through injects, media and export', () => {
    const target = meta('s1', '2026-10-21T10:00:00.000Z')
    const base = { project: { documents: [doc('ok')] }, facts: 3, target, scenarioCount: 1 }
    const writing = buildChecklist(input({ ...base, readiness: ready({ written: 2 }) }))
    expect(writing[3]).toMatchObject({
      state: 'current',
      detail: '2 of 6 events in “s1” have an inject.',
      to: 'scenarios/s1?tab=injects',
    })
    const rendered = buildChecklist(
      input({ ...base, readiness: ready({ written: 6, rendered: 6, next: 'run' }) }),
    )
    expect(rendered.map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
      'current',
    ])
    expect(rendered[5]).toMatchObject({ to: 'scenarios/s1/export' })
  })

  it('targets the most recently updated scenario that is not archived', () => {
    const list = [
      meta('old', '2026-10-01T00:00:00.000Z'),
      meta('new', '2026-10-03T00:00:00.000Z'),
      meta('gone', '2026-10-09T00:00:00.000Z', 'archived'),
    ]
    expect(targetScenario(list)?.id).toBe('new')
    expect(targetScenario([])).toBeUndefined()
  })
})
