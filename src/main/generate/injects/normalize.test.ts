import { describe, expect, it } from 'vitest'
import type { MselRow } from '@shared/schemas'
import {
  carrierCode,
  dropPlaceholders,
  dropVideoBadge,
  normalizeFields,
  normalizeFidsRows,
  normalizeFlight,
  to24h,
} from './normalize'

const row = (event: string): MselRow => ({
  id: 'I-04',
  phaseId: 'p1',
  time: '0:55',
  from: 'Social Media',
  toRoleIds: ['pio'],
  event,
  expectedAction: '',
  purposeTag: 'PRESSURE',
  citations: [],
  locked: false,
})

describe('FIDS normalisers (#106)', () => {
  it('maps carrier names to codes and formats flights as "XX 1234"', () => {
    expect(carrierCode('Delta Air Lines')).toBe('DL')
    expect(carrierCode('SOUTHWEST')).toBe('WN')
    expect(carrierCode('Acme Air')).toBeUndefined()
    expect(normalizeFlight('666', 'UNITED')).toBe('UA 666')
    expect(normalizeFlight('dl1245')).toBe('DL 1245')
    expect(normalizeFlight('Flight 754', 'American')).toBe('AA 754')
    expect(normalizeFlight('754')).toBe('754')
    expect(normalizeFlight('UA 666')).toBe('UA 666')
  })

  it('writes the board clock in 24h', () => {
    expect(to24h('9:40')).toBe('09:40')
    expect(to24h('2:15 PM')).toBe('14:15')
    expect(to24h('12:05 am')).toBe('00:05')
    expect(to24h('NOW')).toBe('NOW')
  })

  it('capitalises the board rows and reports what changed', () => {
    const fields = {
      rows: [
        {
          flight: '666',
          airline: 'United',
          dest: 'Purgatory',
          time: '9:40 AM',
          gate: 'all',
          status: 'Boarding',
        },
        { flight: 'DL 1245', dest: 'ATLANTA', time: '09:50', gate: 'A1', status: 'ON TIME' },
      ],
      clock: '9:35',
    }
    const notes = normalizeFidsRows(fields)
    expect(fields.rows[0]).toEqual({
      flight: 'UA 666',
      airline: 'UNITED',
      dest: 'PURGATORY',
      time: '09:40',
      gate: 'ALL',
      status: 'BOARDING',
    })
    expect(fields.rows[1]).toEqual({
      flight: 'DL 1245',
      dest: 'ATLANTA',
      time: '09:50',
      gate: 'A1',
      status: 'ON TIME',
    })
    expect(fields.clock).toBe('09:35')
    expect(notes).toContain('flight "666" → "UA 666"')
    expect(notes).toContain('dest "Purgatory" → "PURGATORY"')
  })
})

describe('placeholders and the video badge', () => {
  it('drops optional fields filled with placeholders but never required ones', () => {
    const fields = { to: 'PIO', ext: 'N/A', deadline: '', phone: '(216) 555-0142', takenBy: 'TBD' }
    expect(dropPlaceholders(fields, ['to', 'takenBy'])).toEqual(['ext ("N/A")', 'deadline ("")'])
    expect(fields).toEqual({ to: 'PIO', phone: '(216) 555-0142', takenBy: 'TBD' })
  })

  it('removes videoDuration from a photo post and keeps it for a video post', () => {
    const photo = {
      text: 'Boards are wrong!',
      attachedImageBrief: 'phone photo of a dark board',
      videoDuration: '0:00',
    }
    expect(dropVideoBadge(photo, row('Tweet with a photo of the FIDS board'))).toBe(true)
    expect(photo).not.toHaveProperty('videoDuration')
    const video = { text: 'Look at this', videoDuration: '0:07' }
    expect(dropVideoBadge(video, row('Tweet with shaky video of the crowd'))).toBe(false)
    expect(video.videoDuration).toBe('0:07')
  })

  it('normalizeFields applies the type-specific rules and reports them', () => {
    const fields = { text: 'x', videoDuration: '0:12', replyingTo: '' }
    const notes = normalizeFields({
      type: 'tweet',
      fields,
      row: row('Tweet: photo'),
      required: ['text'],
    })
    expect(fields).toEqual({ text: 'x' })
    expect(notes).toEqual([
      'dropped placeholder field(s) replyingTo ("")',
      'dropped videoDuration: no video in this post',
    ])
    // "0:00" is a placeholder in its own right and goes first.
    const zero = { text: 'x', videoDuration: '0:00' }
    expect(
      normalizeFields({ type: 'tweet', fields: zero, row: row('Tweet'), required: ['text'] }),
    ).toEqual(['dropped placeholder field(s) videoDuration ("0:00")'])
    expect(
      normalizeFields({ type: 'memo', fields: { body: 'ok' }, row: row('Memo'), required: [] }),
    ).toEqual([])
  })
})
