import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SessionLogEntry } from '@shared/schemas/live'
import { exportCsvText, exportJsonText } from './log-export'
import {
  countEntries,
  listSessions,
  readSlice,
  sessionFolder,
  starredMessages,
  tailEntries,
} from './log-read'
import { summarize } from './log-summary'

const FIXTURE = join(__dirname, '../../../tests/fixtures/live/session-scenario-3.jsonl')
const SESSION = 'AAAAAAAAAAAAAAAAAAAAAA'

function project(raw: string, meta?: object, id = SESSION) {
  const root = mkdtempSync(join(tmpdir(), 'ttx-room-'))
  const dir = join(root, 'scenarios', 'scn1', 'live', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, 'scenarios', 'scn1', 'scenario.json'), '{}')
  writeFileSync(join(dir, 'log.jsonl'), raw)
  if (meta) writeFileSync(join(dir, 'session.json'), JSON.stringify(meta))
  return root
}

const fixtureEntries = (): SessionLogEntry[] =>
  readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))

describe('readSlice', () => {
  it('returns rows for the kinds asked for, with the fields other features read', async () => {
    const root = project(readFileSync(FIXTURE, 'utf8'))
    const rows = await readSlice(root, 'scn1', SESSION, { kinds: ['inject.release', 'message'] })
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['inject.release', 'message']))
    const release = rows.find((r) => r.kind === 'inject.release')!
    expect(release).toMatchObject({ rowId: expect.any(String), releaseId: expect.any(String) })
    const msg = rows.find((r) => r.kind === 'message')!
    expect(msg.text).toEqual(expect.any(String))
  })

  it('only returns entries after an index', async () => {
    const root = project(readFileSync(FIXTURE, 'utf8'))
    const rows = await readSlice(root, 'scn1', SESSION, { after: 35 })
    expect(rows.every((r) => r.i > 35)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('never carries a display name or client reference', async () => {
    const root = project(readFileSync(FIXTURE, 'utf8'))
    const text = JSON.stringify(await readSlice(root, 'scn1', SESSION))
    expect(text).not.toContain('Dana Whitfield')
    expect(text).not.toContain('displayName')
    expect(text).not.toContain('clientRef')
  })

  it('reads a log with a torn last line and an absent log', async () => {
    const root = project(readFileSync(FIXTURE, 'utf8') + '{"i":99,"kind":"mess')
    expect((await readSlice(root, 'scn1', SESSION)).length).toBe(40)
    expect(await readSlice(root, 'scn1', 'BBBBBBBBBBBBBBBBBBBBBB')).toEqual([])
  })

  it('refuses a session id that could leave the folder', () => {
    expect(() => sessionFolder('/p', 'scn1', '../x')).toThrow(/Invalid session id/)
  })
})

describe('summarize', () => {
  const e = (over: Partial<SessionLogEntry> & { kind: string }) =>
    ({
      i: 1,
      at: '2026-10-28T13:00:00.000Z',
      actor: { kind: 'system' },
      data: {},
      ...over,
    }) as SessionLogEntry
  const names = (id?: string) => ({ ops: 'Ops Director', it: 'IT Director' })[id ?? '']

  it('reads a release with its targets', () => {
    const s = summarize(
      e({
        kind: 'inject.release',
        ref: { rowId: 'I-06' },
        data: { targets: ['role:ops', 'role:it'] },
      }),
      names,
    )
    expect(s).toBe('I-06 released to Ops Director, IT Director')
  })

  it('reads a player message to the SimCell', () => {
    const s = summarize(
      e({
        kind: 'message',
        actor: { kind: 'client', seat: { kind: 'player', roleId: 'ops' } },
        ref: { channel: 'role:ops' },
        data: { text: 'We are investigating' },
      }),
      names,
    )
    expect(s).toBe('Ops Director → SimCell: We are investigating')
  })

  it('falls back to the kind for one it does not know and clips long text', () => {
    expect(summarize(e({ kind: 'stage.progress' }))).toBe('stage.progress')
    expect(
      summarize(e({ kind: 'controller.notice', data: { text: 'x'.repeat(300) } })).length,
    ).toBeLessThan(145)
  })

  it('covers every kind in the fixture with a non-empty line', () => {
    for (const entry of fixtureEntries()) expect(summarize(entry, names)).not.toBe('')
  })
})

describe('exports', () => {
  const entries = fixtureEntries()
  const session = {
    id: SESSION,
    name: 'Run 1',
    startedAt: '2026-10-28T13:00:00.000Z',
    attribution: 'named' as const,
  }

  it('writes the JSON envelope with the entries', () => {
    const json = JSON.parse(exportJsonText(entries, { includeNames: true, session }))
    expect(json).toMatchObject({ format: 'actionstations/live-session', formatVersion: 1 })
    expect(json.entries).toHaveLength(entries.length)
  })

  it('leaves display names out unless the session is named and they were asked for', () => {
    const text = (o: object) => exportJsonText(entries, { session, ...o } as never)
    expect(text({ includeNames: false })).not.toContain('Dana Whitfield')
    expect(text({ includeNames: true })).toContain('Dana Whitfield')
    const role = { ...session, attribution: 'role' as const }
    expect(exportJsonText(entries, { includeNames: true, session: role })).not.toContain(
      'Dana Whitfield',
    )
  })

  it('writes CSV with a byte order mark, the agreed columns and no names by default', () => {
    const csv = exportCsvText(entries, { includeNames: false, session })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const [header, ...rows] = csv.slice(1).trim().split('\r\n')
    expect(header).toBe(
      'index,at,exercise_time,kind,actor_kind,role,team,evaluator,display_name,ref_row,ref_id,summary,data_json',
    )
    expect(rows.length).toBeGreaterThanOrEqual(entries.length)
    expect(csv).not.toContain('Dana Whitfield')
  })

  it('guards a formula in a message from the spreadsheet', () => {
    const msg = {
      i: 1,
      at: '2026-10-28T13:00:00.000Z',
      kind: 'controller.notice',
      actor: { kind: 'controller' },
      data: { text: '=HYPERLINK("x")' },
    } as unknown as SessionLogEntry
    expect(exportCsvText([msg], { includeNames: false })).toContain('"\'=HYPERLINK')
  })
})

describe('log view and sessions list', () => {
  const entries = fixtureEntries()
  const none = () => undefined

  it('returns the newest entries first, filtered by kind and text, with a continuation flag', () => {
    const page = tailEntries(entries, { limit: 5 }, none, new Set())
    expect(page.entries.map((x) => x.i)).toEqual([40, 39, 38, 37, 36])
    expect(page.hasMore).toBe(true)
    const next = tailEntries(entries, { limit: 5, before: 36 }, none, new Set())
    expect(next.entries[0]!.i).toBe(35)
    const releases = tailEntries(entries, { kinds: ['inject.release'] }, none, new Set())
    expect(releases.entries.every((x) => x.kind === 'inject.release')).toBe(true)
    expect(tailEntries(entries, { q: 'zzzz-nothing' }, none, new Set()).entries).toEqual([])
  })

  it('tracks starred messages', () => {
    const star = (on: boolean) =>
      ({
        kind: 'message.star',
        ref: { messageId: 'm1' },
        data: { on },
      }) as unknown as SessionLogEntry
    expect([...starredMessages([star(true)])]).toEqual(['m1'])
    expect(starredMessages([star(true), star(false)]).size).toBe(0)
  })

  it('counts a session and lists interrupted sessions first', async () => {
    const counts = countEntries(entries)
    expect(counts.releases).toBeGreaterThan(0)
    const root = project(readFileSync(FIXTURE, 'utf8'), {
      id: SESSION,
      scenarioId: 'scn1',
      name: 'Old run',
      startedAt: '2026-10-28T13:00:00.000Z',
      endedAt: '2026-10-28T15:00:00.000Z',
      connection: { kind: 'lan', tls: 'self-signed' },
      joinUrlPublic: '',
      attribution: 'role',
      protocolVersion: 1,
    })
    const other = join(root, 'scenarios', 'scn1', 'live', 'CCCCCCCCCCCCCCCCCCCCCC')
    mkdirSync(other)
    writeFileSync(join(other, 'log.jsonl'), '')
    writeFileSync(
      join(other, 'session.json'),
      JSON.stringify({
        id: 'CCCCCCCCCCCCCCCCCCCCCC',
        scenarioId: 'scn1',
        name: 'Crashed',
        startedAt: '2026-10-27T13:00:00.000Z',
        connection: { kind: 'lan', tls: 'self-signed' },
        joinUrlPublic: '',
        attribution: 'role',
        protocolVersion: 1,
      }),
    )
    const list = await listSessions(root, 'scn1')
    expect(list.map((s) => [s.id, s.interrupted])).toEqual([
      ['CCCCCCCCCCCCCCCCCCCCCC', true],
      [SESSION, false],
    ])
    expect((await listSessions(root, 'scn1', 'CCCCCCCCCCCCCCCCCCCCCC'))[0]!.interrupted).toBe(false)
  })
})
