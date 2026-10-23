import { describe, expect, it } from 'vitest'
import { Inject } from '@shared/schemas'
import {
  documentFileNames,
  scenarioTag,
  fileTitle,
  mediaBaseName,
  planMediaFiles,
  rowCode,
  scenarioNumber,
} from './naming'

const provenance = { provider: 'template', createdAt: '2026-10-21T00:00:00.000Z' }
const ULID = '01M5GJ27PWYJ1CJB60T579J4AQ'

const inject = (
  mselRowId: string,
  type: string,
  assets: { id: string; kind: string; path: string; role: string; posterPath?: string }[],
) =>
  Inject.parse({
    id: `inj-${mselRowId}`,
    mselRowId,
    type,
    title: 't',
    assets: assets.map((a) => ({ ...a, provenance })),
  })

describe('scenario and row codes', () => {
  it('takes the scenario number from the title or subtitle', () => {
    expect(
      scenarioNumber({ id: 'a', title: 'Flight to Nowhere', subtitle: 'Scenario 3: Data' }),
    ).toBe('3')
    expect(scenarioNumber({ id: 'a', title: 'Scenario #12 — Lights Out' })).toBe('12')
  })
  it('falls back to the position in the project', () => {
    const list = [{ id: 'x' }, { id: 'a' }]
    expect(scenarioNumber({ id: 'a', title: 'Light Out' }, list)).toBe('2')
    expect(scenarioNumber({ id: 'z', title: 'Light Out' }, list)).toBe('1')
  })
  it('maps MSEL ids to the I-part of media names', () => {
    expect(rowCode('I-05b')).toBe('I05b')
    expect(rowCode('I-07')).toBe('I07')
    expect(rowCode('START')).toBe('START')
    expect(rowCode('end')).toBe('END')
    expect(mediaBaseName('3', 'I-05b', 'radio_call')).toBe('S3-I05b-radio_call')
  })
})

describe('fileTitle / documentFileNames', () => {
  it('keeps case and turns punctuation into dashes', () => {
    expect(fileTitle('Flight to Nowhere: Data & FIDS')).toBe('Flight-to-Nowhere-Data-FIDS')
    expect(fileTitle('Café ../../etc')).toBe('Cafe-etc')
    expect(fileTitle('***')).toBe('Scenario')
  })
  it('names the distribution ZIP after the title', () => {
    expect(documentFileNames('Flight to Nowhere').zip).toBe('Flight-to-Nowhere-distribution.zip')
  })
  it('gives each scenario its own folder and ZIP, even with the same title (#213)', () => {
    const a = documentFileNames('Flight to Nowhere', {
      scenarioNo: '3',
      scenarioId: '01M5GJ27PWYJ1CJB60T579J4AB',
    })
    const b = documentFileNames('Flight to Nowhere', {
      scenarioNo: '3',
      scenarioId: '01M5GJ27PWYJ1CJB60T579J4CD',
    })
    expect(a.folder).toBe('Flight-to-Nowhere-S3-79J4AB')
    expect(a.zip).toBe(`${a.folder}-distribution.zip`)
    expect(b.folder).not.toBe(a.folder)
    expect(b.zip).not.toBe(a.zip)
    expect(a.msel).toBe('Flight-to-Nowhere-MSEL.pdf')
  })
  it('makes a file-safe tag from any scenario id', () => {
    expect(scenarioTag('scenario-3')).toBe('nario3')
    expect(scenarioTag('../..')).toBe('x')
  })
})

describe('planMediaFiles', () => {
  it('names every asset S<n>-I<id>-<type>.<ext> with role suffixes', () => {
    const injects = [
      inject('I-04', 'tweet', [
        { id: `attached_image-${ULID}`, kind: 'image', path: 'm/a.png', role: 'generated' },
        { id: 'c1', kind: 'image', path: 'm/c.png', role: 'composite' },
      ]),
      inject('I-05b', 'radio_call', [
        { id: 'w', kind: 'audio', path: 'm/w.wav', role: 'generated' },
        { id: 'r', kind: 'image', path: 'm/r.png', role: 'rendered' },
        { id: 'p', kind: 'pdf', path: 'm/r.pdf', role: 'rendered' },
      ]),
      inject('I-06', 'fids_board', [
        { id: 'v', kind: 'video', path: 'm/v.mp4', role: 'generated', posterPath: 'm/v.png' },
      ]),
    ]
    const plan = planMediaFiles('3', injects)
    expect(plan.map((p) => p.fileName)).toEqual([
      'S3-I04-tweet-attached_image.png',
      'S3-I04-tweet.png',
      'S3-I05b-radio_call.wav',
      'S3-I05b-radio_call.png',
      'S3-I05b-radio_call.pdf',
      'S3-I06-fids_board.mp4',
    ])
    expect(plan[2]!.mp3Name).toBe('S3-I05b-radio_call.mp3')
    expect(plan[5]!.posterName).toBe('S3-I06-fids_board-poster.png')
  })

  it('never reuses a name (case-insensitive) and skips MP3 when one exists', () => {
    const injects = [
      inject('I-01', 'phone_call', [
        { id: 'a', kind: 'image', path: 'm/a.png', role: 'rendered' },
        { id: 'b', kind: 'image', path: 'm/b.PNG', role: 'rendered' },
        { id: 'w', kind: 'audio', path: 'm/w.wav', role: 'generated' },
        { id: 'm', kind: 'audio', path: 'm/w.mp3', role: 'generated' },
      ]),
    ]
    const plan = planMediaFiles('1', injects)
    expect(plan.map((p) => p.fileName)).toEqual([
      'S1-I01-phone_call.png',
      'S1-I01-phone_call-2.png',
      'S1-I01-phone_call.wav',
      'S1-I01-phone_call.mp3',
    ])
    expect(plan[2]!.mp3Name).toBeUndefined()
  })
})
