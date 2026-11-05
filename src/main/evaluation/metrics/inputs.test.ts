import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TextProvider } from '../../providers/types'
import { decisionsFromLog, readGroundTruth, readModeledSeries } from './inputs'
import { suggestStatements } from './suggest'

const dir = () => mkdtempSync(join(tmpdir(), 'ttx-gt-'))
const event = { id: 'e1', time: '2026-09-01T12:00:00Z', kind: 'tornado', area: 'North' }

describe('ground truth adapter', () => {
  it('reads an array of events or an object with events', async () => {
    const d = dir()
    writeFileSync(join(d, 'a.json'), JSON.stringify([event]))
    writeFileSync(join(d, 'b.json'), JSON.stringify({ events: [event] }))
    expect(await readGroundTruth(d, 'a.json')).toHaveLength(1)
    expect((await readGroundTruth(d, 'b.json'))[0]).toMatchObject({ id: 'e1', attrs: {} })
  })

  it('rejects a missing file, a bad shape and a path outside the folder', async () => {
    const d = dir()
    writeFileSync(join(d, 'bad.json'), JSON.stringify({ nope: 1 }))
    await expect(readGroundTruth(d, 'missing.json')).rejects.toThrow(/not found/)
    await expect(readGroundTruth(d, 'bad.json')).rejects.toThrow(/not a list of events/)
    await expect(readGroundTruth(d, '../x.json')).rejects.toThrow()
  })

  it('reads modeled series', async () => {
    const d = dir()
    const s = { zone: 'A', quantity: 'wind', points: [{ time: event.time, value: 3 }] }
    writeFileSync(join(d, 's.json'), JSON.stringify({ series: [s] }))
    expect(await readModeledSeries(d, 's.json')).toHaveLength(1)
  })
})

describe('decisions from the session log', () => {
  it('maps structured decisions and skips entries without one', () => {
    const out = decisionsFromLog([
      { i: 1, at: '2026-09-01T11:00:00.000Z', kind: 'message', data: { text: 'hi' } },
      {
        i: 2,
        at: '2026-09-01T11:30:00.000Z',
        kind: 'decision.close',
        data: {
          structured: { kind: 'evacuation', area: 'Zone A', fields: { order: 'mandatory' } },
        },
      },
      {
        i: 3,
        at: '2026-09-01T11:40:00.000Z',
        kind: 'decision.close',
        data: { structured: { area: 'no kind' } },
      },
    ])
    expect(out).toEqual([
      {
        id: 'log:2',
        time: '2026-09-01T11:30:00.000Z',
        kind: 'evacuation',
        area: 'Zone A',
        fields: { order: 'mandatory' },
      },
    ])
  })
})

describe('decisions as the live session logs them', () => {
  it('reads a recorded area by its name', () => {
    const out = decisionsFromLog([
      {
        i: 4,
        at: '2026-09-01T11:50:00.000Z',
        kind: 'decision.submitted',
        data: {
          structured: {
            id: 'dec-1',
            time: '2026-09-01T11:45:00.000Z',
            kind: 'issue_bulletin',
            area: { id: 'harbor', name: 'Harbor' },
            fields: { level: 'warning' },
          },
        },
      },
    ])
    expect(out).toEqual([
      {
        id: 'log:4',
        time: '2026-09-01T11:45:00.000Z',
        kind: 'issue_bulletin',
        area: 'Harbor',
        fields: { level: 'warning' },
      },
    ])
  })
})

describe('suggested statements', () => {
  const facts = [{ id: 'eta', label: 'Landfall time' }]
  const messages = [
    { partner: 'County', text: 'Landfall expected 14:00.' },
    { partner: 'City', text: 'Landfall near 2pm.' },
  ]
  const provider = (json: unknown) =>
    ({
      chat: vi.fn(async () => ({ text: JSON.stringify(json), json, model: 'm' })),
    }) as unknown as TextProvider & { chat: ReturnType<typeof vi.fn> }

  it('marks suggestions, drops unknown facts and partners, and sends task metadata to the gate', async () => {
    const p = provider({
      statements: [
        { factId: 'eta', partner: 'County', value: '14:00' },
        { factId: 'zzz', partner: 'County', value: 'x' },
        { factId: 'eta', partner: 'Nobody', value: 'x' },
      ],
    })
    const out = await suggestStatements(p, facts, messages)
    expect(out).toEqual([{ factId: 'eta', partner: 'County', value: '14:00', suggested: true }])
    expect(p.chat.mock.calls[0]![0].outbound).toMatchObject({ task: 'evaluate', excerpts: [] })
  })

  it('returns nothing for unusable output or empty input without calling the model', async () => {
    expect(await suggestStatements(provider({ oops: 1 }), facts, messages)).toEqual([])
    const p = provider({ statements: [] })
    expect(await suggestStatements(p, facts, [])).toEqual([])
    expect(p.chat).not.toHaveBeenCalled()
  })
})
