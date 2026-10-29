// The live-log adapter against the committed session fixture (spec 0417 format, spec 0406
// payloads): what each entry kind becomes in the record, revisions, pinned messages, +1 and
// retracted hot wash items, and that a `named` session's display names never reach the record.
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Scenario } from '@shared/schemas'
import { listLiveSessions, livePart, parseLog, readLiveLog } from './live-log'

const FIXTURE = resolve('tests/fixtures/live/session-scenario-3.jsonl')
const scenario = Scenario.parse(
  JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)
const NAMES = ['Dana Whitfield', 'Marcus Lee', 'Priya Natarajan', 'Tom Okafor']

const part = () => livePart(parseLog(readFileSync(FIXTURE, 'utf8')).entries, scenario)

describe('live log adapter', () => {
  it('reads every entry of the fixture in index order', () => {
    const { entries, skipped } = parseLog(readFileSync(FIXTURE, 'utf8'))
    expect(skipped).toBe(0)
    expect(entries.length).toBe(40)
    expect(entries.map((e) => e.i)).toEqual(entries.map((_, i) => i + 1))
  })

  it('maps releases to delivered rows, once per row, with the exercise time', () => {
    expect(part().delivered).toEqual([
      { rowId: 'I-01', exerciseTime: '0:15', at: expect.any(String) },
      { rowId: 'I-06', exerciseTime: '1:15', at: expect.any(String) },
      { rowId: 'I-09', exerciseTime: '2:00', at: expect.any(String) },
      { rowId: 'I-10', exerciseTime: '2:15', at: expect.any(String) },
    ])
  })

  it('keeps messages as role labels with the pinned flag and the inject they answer', () => {
    const { messages, messageCounts } = part()
    expect(messages).toHaveLength(4)
    const pinned = messages.find((m) => m.pinned)!
    expect(pinned).toMatchObject({
      fromRole: 'IC',
      toRole: 'IC',
      rowId: 'I-06',
      exerciseTime: '1:17',
    })
    expect(pinned.text).toContain('silencing the PA')
    expect(messages.find((m) => m.fromRole.startsWith('SimCell'))!.fromRole).toBe(
      'SimCell (Airline station manager)',
    )
    expect(messageCounts).toEqual(
      expect.arrayContaining([
        { role: 'IC', count: 1 },
        { role: 'PIO', count: 1 },
        { role: 'IT', count: 1 },
      ]),
    )
  })

  it('tallies the vote from vote.close and keeps the question and the row', () => {
    const [vote] = part().votes
    expect(vote).toMatchObject({
      rowId: 'I-09',
      exerciseTime: '2:02',
      voted: 4,
      eligible: 5,
      options: [
        { label: 'Go dark now', count: 3 },
        { label: 'Wait for IT confirmation', count: 1 },
      ],
    })
    expect(vote!.ref).toMatch(/^vote:/)
  })

  it('tallies cast ballots when a vote was never closed', () => {
    const raw = readFileSync(FIXTURE, 'utf8')
      .split('\n')
      .filter((l) => l && !l.includes('"vote.close"'))
      .join('\n')
    const [vote] = livePart(parseLog(raw).entries, scenario).votes
    expect(vote!.options.map((o) => o.count)).toEqual([3, 1])
    expect(vote!.voted).toBe(4)
  })

  it('applies +1, retract, edit and promote to hot wash items', () => {
    const items = part().hotwash
    expect(items.map((h) => h.kind)).toEqual(['strength', 'improvement'])
    const boards = items[1]!
    expect(boards.text).toContain('TIRP 13.6 names no role')
    expect(boards.plusOnes).toBe(1)
    expect(boards.promoted).toBe(true)
    expect(boards.objectiveRef).toBe('obj-decision')
    expect(items[0]).toMatchObject({ objectiveRef: 'obj-communication', rowId: 'I-04' })
    expect(items.some((h) => h.text.includes('bigger room'))).toBe(false)
  })

  it('keeps the highest revision of an observation and turns note observations into notes', () => {
    const { observations, notes } = part()
    expect(observations).toHaveLength(2)
    const t07 = observations.find((o) => o.taskId === 'T-07')!
    expect(t07).toMatchObject({
      rating: 'met',
      rowId: 'I-06',
      exerciseTime: '1:20',
      evaluator: 'Evaluator 2',
      source: 'live',
      ref: 'obs:obs_live_T07_000001',
    })
    expect(t07.note).toContain('4 minutes')
    expect(observations.find((o) => o.taskId === 'T-13')!.rating).toBe('not_met')
    expect(notes).toEqual([
      {
        ref: 'note:obs_live_note_00001',
        rowId: 'I-10',
        text: expect.stringContaining('manual announcement script'),
      },
    ])
  })

  it('never copies a display name or client reference from a named session', () => {
    const text = JSON.stringify(part())
    for (const name of NAMES) expect(text).not.toContain(name)
    expect(text).not.toMatch(/"clientRef"|"c1"|"c9"/)
  })

  it('skips torn and foreign lines instead of failing', () => {
    const raw = readFileSync(FIXTURE, 'utf8') + '{"i":41,"kind":"message"\nnot json\n'
    const { entries, skipped } = parseLog(raw)
    expect(entries).toHaveLength(40)
    expect(skipped).toBe(2)
  })
})

describe('live session folders', () => {
  function project(): { root: string; scenarioId: string } {
    const root = mkdtempSync(join(tmpdir(), 'ttx-live-'))
    const scenarioId = 'scn1'
    mkdirSync(join(root, 'scenarios', scenarioId), { recursive: true })
    writeFileSync(join(root, 'scenarios', scenarioId, 'scenario.json'), '{}')
    return { root, scenarioId }
  }
  const session = (root: string, scenarioId: string, id: string, raw: string, meta?: object) => {
    const dir = join(root, 'scenarios', scenarioId, 'live', id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'log.jsonl'), raw)
    if (meta) writeFileSync(join(dir, 'session.json'), JSON.stringify(meta))
  }

  it('lists sessions with ended ones first and reads the most recent ended one by default', async () => {
    const { root, scenarioId } = project()
    const raw = readFileSync(FIXTURE, 'utf8')
    const open = raw
      .split('\n')
      .filter((l) => l && !l.includes('"session.end"'))
      .join('\n')
    session(root, scenarioId, 'run1', raw)
    session(root, scenarioId, 'run2', open)
    session(root, scenarioId, 'run0', raw, { endedAt: '2026-10-20T10:00:00.000Z' })
    const list = await listLiveSessions(root, scenarioId)
    expect(list.map((s) => s.id)).toEqual(['run1', 'run0', 'run2'])
    expect(list[0]!.entries).toBe(40)
    expect(list[2]!.endedAt).toBeUndefined()
    expect((await readLiveLog(root, scenarioId))!.sessionId).toBe('run1')
    expect((await readLiveLog(root, scenarioId, 'run2'))!.entries.length).toBe(39)
  })

  it('reports no session when the scenario has no live folder', async () => {
    const { root, scenarioId } = project()
    expect(await listLiveSessions(root, scenarioId)).toEqual([])
    expect(await readLiveLog(root, scenarioId)).toBeUndefined()
  })

  it('refuses a session id that could leave the folder', async () => {
    const { root, scenarioId } = project()
    await expect(readLiveLog(root, scenarioId, '../x')).rejects.toThrow(/Invalid session id/)
  })
})
