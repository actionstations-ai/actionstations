// The tracker, regulatory clock and hot wash quote lines the AAR draft cites (#428, #426, #425).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CoverageClock } from '@shared/compliance/coverage'
import { Scenario } from '@shared/schemas'
import { recordBlock } from '../condense'
import { assembleRecord } from '../record'
import { clockLines, trackerLines, transcriptLines } from './derived'

const scenario = Scenario.parse(
  JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)

const clock = (over: Partial<CoverageClock>): CoverageClock => ({
  cite: 'K1',
  key: 'k',
  regulation: 'CIRCIA',
  status: 'in force',
  clock: '72-hour incident report',
  recipient: 'CISA',
  result: 'met',
  resultLabel: 'Met',
  note: '',
  ...over,
})

describe('trackerLines', () => {
  it('turns responses, unanswered rows and commitments into cited lines', () => {
    const lines = trackerLines({
      responses: [{ cite: 'R1', rowId: 'I-06', responseMin: 12, note: 'PIO called', source: 'x' }],
      unanswered: ['I-09'],
      commitments: [{ cite: 'P1', text: 'Call the county', owner: 'IC', status: 'missed' }],
    })
    expect(lines.map((l) => l.ref)).toEqual(['trk:R1', 'trk:U-I-09', 'trk:P1'])
    expect(lines[0]!.text).toContain('12 minute(s)')
    expect(lines[2]!.text).toBe('Commitment by IC: Call the county (missed)')
  })
})

describe('clockLines', () => {
  it('skips clocks that never started and reports the result of those that did', () => {
    const lines = clockLines([
      clock({ cite: 'K1' }),
      clock({
        cite: 'K2',
        triggeredAt: '10:00',
        dueAt: '13:00',
        result: 'missed',
        resultLabel: 'Missed',
      }),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ ref: 'clk:K2', meta: 'CIRCIA' })
    expect(lines[0]!.text).toContain('Missed')
    expect(lines[0]!.text).toContain('due 13:00')
  })
})

describe('transcriptLines', () => {
  it('cites each quote with its recording and speaker label', () => {
    const lines = transcriptLines([
      {
        citeKey: 'T1',
        ref: 'transcript:a#b',
        recordingTitle: 'Hot wash',
        at: '0:04:10',
        wallClock: '15:30',
        speakerLabel: 'Controller',
        text: 'We never confirmed the hand-off.',
        quote: true,
        objectiveIds: [],
        rowIds: [],
      },
    ])
    expect(lines).toEqual([
      {
        ref: 'tr:T1',
        meta: 'Hot wash · 15:30 · Controller',
        text: 'We never confirmed the hand-off.',
      },
    ])
  })
})

describe('the record with derived sources', () => {
  const derived = {
    tracker: trackerLines({ responses: [], unanswered: ['I-09'], commitments: [] }),
    clocks: clockLines([clock({ triggeredAt: '10:00' })]),
    transcripts: [{ ref: 'tr:T1', text: 'Quote' }],
  }

  it('names the sources and prints each line with its ref for the prompt', () => {
    const record = assembleRecord(scenario, { derived })
    expect(record.sources).toMatchObject({ tracker: true, clocks: true, transcripts: true })
    const block = recordBlock(record, scenario, 'full')
    expect(block).toContain('[trk:U-I-09]')
    expect(block).toContain('[clk:K1]')
    expect(block).toContain('[tr:T1]')
  })

  it('leaves the sections out when nothing was recorded', () => {
    const record = assembleRecord(scenario, {})
    expect(record.sources.tracker).toBe(false)
    expect(recordBlock(record, scenario, 'full')).not.toContain('Regulatory clocks:')
  })
})
