// Program snapshots count observations from the live session log as well as evaluation.json (#424).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Scenario, type EvaluationRecord } from '@shared/schemas'
import { observationsOf } from './snapshot'

const scenario = Scenario.parse(
  JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)
const LOG = readFileSync(resolve('tests/fixtures/live/session-scenario-3.jsonl'), 'utf8')

function projectWithSession(): string {
  const root = mkdtempSync(join(tmpdir(), 'as-snapshot-'))
  const dir = join(root, 'scenarios', scenario.id, 'live', 'run1')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'log.jsonl'), LOG)
  writeFileSync(join(dir, 'session.json'), JSON.stringify({ endedAt: '2026-10-28T16:00:00.000Z' }))
  return root
}

describe('observationsOf', () => {
  it('counts live-log observations when evaluation.json has none', async () => {
    const found = await observationsOf(projectWithSession(), scenario, null)
    expect(found.filter((o) => o.source === 'live').length).toBeGreaterThan(0)
  })

  it('uses only the latest revision of a live observation', async () => {
    const found = await observationsOf(projectWithSession(), scenario, null)
    const task = found.filter((o) => o.taskId === 'T-07')
    expect(task).toHaveLength(1)
    expect(task[0]!.rating).toBe('met')
  })

  it('returns the stored observations when the scenario has no live session', async () => {
    const root = mkdtempSync(join(tmpdir(), 'as-snapshot-'))
    const record = { observations: [{ id: 'o1' }] } as unknown as EvaluationRecord
    expect(await observationsOf(root, scenario, record)).toEqual(record.observations)
  })
})
