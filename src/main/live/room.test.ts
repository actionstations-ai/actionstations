import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const running = vi.hoisted(() => ({ id: undefined as string | undefined }))
vi.mock('./session', () => ({
  activeSession: () => (running.id ? { id: running.id, scenarioId: 'scn1' } : undefined),
  flushActiveLog: async () => undefined,
}))
vi.mock('../scenario/store', () => ({
  getScenario: async () => ({
    roles: [{ id: 'ops', name: 'Operations Director', abbreviation: 'Ops', team: 'a' }],
  }),
}))

import { closeSession, dashboard, deleteSession, exportLog, logTail, sessionsList } from './room'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'
const line = (i: number, kind: string, extra: object = {}) =>
  JSON.stringify({
    i,
    at: `2026-10-28T13:0${i}:00.000Z`,
    kind,
    actor: { kind: 'controller' },
    data: {},
    ...extra,
  })

function project(ended = false) {
  const root = mkdtempSync(join(tmpdir(), 'ttx-room-'))
  const dir = join(root, 'scenarios', 'scn1', 'live', ID)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, 'scenarios', 'scn1', 'scenario.json'), '{}')
  writeFileSync(
    join(dir, 'log.jsonl'),
    [
      line(1, 'session.start'),
      line(2, 'inject.release', {
        ref: { rowId: 'I-01', releaseId: 'r1' },
        data: { targets: ['role:ops'], expectsResponse: true },
      }),
    ].join('\n') + '\n',
  )
  writeFileSync(
    join(dir, 'session.json'),
    JSON.stringify({
      id: ID,
      scenarioId: 'scn1',
      name: 'Run',
      startedAt: '2026-10-28T13:00:00.000Z',
      ...(ended ? { endedAt: '2026-10-28T14:00:00.000Z' } : {}),
      connection: { kind: 'lan', tls: 'self-signed' },
      joinUrlPublic: '',
      attribution: 'role',
      protocolVersion: 1,
    }),
  )
  return { root, dir }
}

describe('room', () => {
  it('builds the dashboard of the newest session, and none when there is no session', async () => {
    const { root } = project()
    const view = await dashboard(root, 'scn1')
    expect(view).toMatchObject({ sessionId: ID, live: false })
    expect(view!.injects).toHaveLength(1)
    expect(view!.unanswered).toHaveLength(1)
    const empty = mkdtempSync(join(tmpdir(), 'ttx-room-'))
    mkdirSync(join(empty, 'scenarios', 'scn1'), { recursive: true })
    writeFileSync(join(empty, 'scenarios', 'scn1', 'scenario.json'), '{}')
    expect(await dashboard(empty, 'scn1')).toBeNull()
  })

  it('marks a running session as live', async () => {
    const { root } = project()
    running.id = ID
    expect((await dashboard(root, 'scn1'))!.live).toBe(true)
    running.id = undefined
  })

  it('serves the log tail with role names in the summary', async () => {
    const { root } = project()
    const { entries } = await logTail(root, 'scn1', {})
    expect(entries.map((e) => e.i)).toEqual([2, 1])
    expect(entries[0]!.summary).toBe('I-01 released to Ops')
  })

  it('exports JSON and CSV to the chosen path', async () => {
    const { root } = project()
    const out = join(mkdtempSync(join(tmpdir(), 'ttx-out-')), 'nested', 'log.csv')
    expect(await exportLog(root, 'scn1', ID, 'csv', out, false)).toEqual({ path: out, entries: 2 })
    expect(readFileSync(out, 'utf8').charCodeAt(0)).toBe(0xfeff)
    const json = join(mkdtempSync(join(tmpdir(), 'ttx-out-')), 'log.json')
    await exportLog(root, 'scn1', ID, 'json', json, false)
    expect(JSON.parse(readFileSync(json, 'utf8')).entries).toHaveLength(2)
  })

  it('closes an interrupted session at its last entry and writes the summary', async () => {
    const { root, dir } = project()
    expect((await sessionsList(root, 'scn1'))[0]!.interrupted).toBe(true)
    const closed = await closeSession(root, 'scn1', ID)
    expect(closed.endedAt).toBe('2026-10-28T13:02:00.000Z')
    expect(closed.summary?.releases).toBe(1)
    expect(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).endedAt).toBeDefined()
    expect((await sessionsList(root, 'scn1'))[0]!.interrupted).toBe(false)
  })

  it('deletes a past session folder but refuses the running one', async () => {
    const { root, dir } = project(true)
    running.id = ID
    await expect(deleteSession(root, 'scn1', ID)).rejects.toThrow(/running/)
    running.id = undefined
    await deleteSession(root, 'scn1', ID)
    expect(existsSync(dir)).toBe(false)
    await expect(deleteSession(root, 'scn1', ID)).rejects.toThrow(/No such session/)
  })
})
