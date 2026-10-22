import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aliasCarriers, boardCarriers, codeFromName, inferCarrier, storyCarriers } from './carrier'
import { normalizeFidsRows } from './normalize'

describe('carrier inference for bare FIDS flight numbers (#140)', () => {
  it('builds a code from an airline name the IATA table does not know', () => {
    expect(codeFromName('NCIA AIR')).toBe('NC')
    expect(codeFromName('North Coast Airways')).toBe('NC')
    expect(codeFromName('Air')).toBeUndefined()
  })

  it('finds the carrier the story puts in front of the number', () => {
    expect(storyCarriers('666', 'Reports of United flight 666 boarding')).toEqual(['UA'])
    expect(storyCarriers('214', 'Passengers for UA 214 are rebooked')).toEqual(['UA'])
    expect(storyCarriers('666', 'Flight 666 to Purgatory is now boarding')).toEqual([])
  })

  it('ranks the board carriers by use and reads airline aliases only', () => {
    expect(boardCarriers(['DL 1', 'UA 2', 'DL 3', '666'])).toEqual(['DL', 'UA'])
    expect(
      aliasCarriers({ airlineA: 'Delta', localTv: 'Channel 5', airlineB: 'Acme Air' }),
    ).toEqual(['DL', 'AC'])
  })

  it('prefers the airline column, then the story, then a brand alias, then the board', () => {
    const board = ['DL 301', 'DL 400', 'UA 214']
    expect(inferCarrier('77', 'Southwest', { storyText: 'UA 77', boardFlights: board })).toBe('WN')
    expect(inferCarrier('77', undefined, { storyText: 'UA 77', boardFlights: board })).toBe('UA')
    expect(inferCarrier('77', '', { aliases: { airlineA: 'JetBlue' }, boardFlights: board })).toBe(
      'B6',
    )
    expect(inferCarrier('77', undefined, { boardFlights: board })).toBe('DL')
    expect(inferCarrier('77', undefined, {})).toBeUndefined()
  })

  it('never produces a flight that duplicates another row on the board', () => {
    const board = ['DL 666', 'UA 214', 'DL 301', '666']
    expect(
      inferCarrier('666', undefined, { storyText: 'DL 666 to Miami', boardFlights: board }),
    ).toBe('UA')
  })

  it('normalises the sample run I-06 board: no bare flight numbers remain', () => {
    const injects = JSON.parse(
      readFileSync(resolve('tests/fixtures/injects/sample-run/injects.json'), 'utf8'),
    ) as { type: string; fields: { rows: { flight: string; airline?: string }[] } }[]
    const boards = injects.filter((i) => i.type === 'fids_board')
    expect(boards.length).toBeGreaterThan(0)
    for (const board of boards) {
      const fields = structuredClone(board.fields)
      normalizeFidsRows(fields)
      for (const r of fields.rows) expect(r.flight).toMatch(/^[A-Z0-9]{2} \d{1,4}[A-Z]?$/)
      const flights = fields.rows.map((r) => r.flight)
      expect(new Set(flights).size).toBe(flights.length)
    }
    const purgatory = boards[0]!.fields.rows.find((r) => r.flight === '666')!
    const fields = structuredClone(boards[0]!.fields)
    normalizeFidsRows(fields)
    expect(fields.rows[boards[0]!.fields.rows.indexOf(purgatory)]!.flight).toBe('NC 666')
  })

  it('a row without an airline column takes the story carrier through normalizeFidsRows', () => {
    const fields = {
      rows: [
        { flight: '666', dest: 'PURGATORY', time: '10:17', status: 'BOARDING' },
        { flight: 'DL 301', dest: 'MINNEAPOLIS', time: '10:32', status: 'DELAYED' },
      ],
    }
    const notes = normalizeFidsRows(fields, { storyText: 'Spoofed American flight 666 appears' })
    expect(fields.rows[0]!.flight).toBe('AA 666')
    expect(notes).toContain('flight "666" → "AA 666"')
  })
})
