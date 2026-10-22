import { describe, expect, it } from 'vitest'
import type { StageRun } from '@shared/schemas/scenario'
import { timelineEntries } from './stages'

const run = (stage: string, itemId: string | undefined, status: StageRun['status']): StageRun =>
  ({
    stage,
    ...(itemId ? { itemId } : {}),
    status,
    startedAt: '2026-10-21T10:00:00.000Z',
  }) as StageRun

describe('timelineEntries', () => {
  it('groups per-inject runs per stage with status counts, at the first run position', () => {
    const entries = timelineEntries([
      run('scenario_overview', undefined, 'ok'),
      run('msel_phase', 'p1', 'ok'),
      run('msel_phase', 'p2', 'error'),
      run('inject_text', 'i1', 'ok'),
      run('inject_media_brief', 'i1', 'ok'),
      run('inject_text', 'i2', 'error'),
      run('inject_text', 'i3', 'stale'),
      run('inject_media_brief', 'i2', 'ok'),
      run('controller_handbook', undefined, 'ok'),
    ])
    expect(entries.map((e) => (e.kind === 'run' ? e.run.stage : `group:${e.stage}`))).toEqual([
      'scenario_overview',
      'msel_phase',
      'msel_phase',
      'group:inject_text',
      'group:inject_media_brief',
      'controller_handbook',
    ])
    const text = entries[3]!
    expect(text.kind === 'group' && text.counts).toEqual({ ok: 1, error: 1, stale: 1 })
    expect(text.kind === 'group' && text.runs.map((r) => r.itemId)).toEqual(['i1', 'i2', 'i3'])
  })

  it('keeps a single per-inject run as a plain row', () => {
    const entries = timelineEntries([run('media_render', 'i1', 'ok')])
    expect(entries).toEqual([{ kind: 'run', run: run('media_render', 'i1', 'ok') }])
  })
})
