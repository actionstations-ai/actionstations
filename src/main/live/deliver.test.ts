import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { captionsFromVoiceLines, injectAltText, injectText, resolveTargets } from './deliver'

const roles = [
  { id: 'ops', team: 'Operations' },
  { id: 'ops-2', team: 'Operations' },
  { id: 'it', team: 'IT' },
  { id: 'pio', team: '' },
]

describe('resolveTargets', () => {
  it('sends a row for named roles to those roles', () => {
    expect(
      resolveTargets({ toRoleIds: ['it', 'pio'], toLabel: 'IT, PIO' }, 'hand_to_role', roles),
    ).toEqual(['role:it', 'role:pio'])
  })

  it('collapses roles to their team when the whole team is addressed', () => {
    expect(resolveTargets({ toRoleIds: ['ops', 'ops-2', 'pio'] }, 'read_aloud', roles)).toEqual([
      'team:operations',
      'role:pio',
    ])
  })

  it('sends a row addressed to a team (spec 0428) to the team and any other listed role', () => {
    expect(
      resolveTargets({ toRoleIds: ['pio'], toTeams: ['operations'] }, 'hand_to_role', roles),
    ).toEqual(['team:operations', 'role:pio'])
  })

  it('keeps single roles of a team that is only partly addressed', () => {
    expect(resolveTargets({ toRoleIds: ['ops'] }, 'hand_to_role', roles)).toEqual(['role:ops'])
  })

  it('goes to everyone for "All", no roles, or the main screen', () => {
    expect(resolveTargets({ toRoleIds: ['it'], toLabel: ' all ' }, 'hand_to_role', roles)).toEqual([
      'all',
    ])
    expect(resolveTargets({ toRoleIds: [] }, 'hand_to_role', roles)).toEqual(['all'])
    expect(resolveTargets({ toRoleIds: ['it'] }, 'display_main_screen', roles)).toEqual(['all'])
  })

  it('drops role ids that cannot be addressed', () => {
    expect(resolveTargets({ toRoleIds: ['bad id!', 'it'] }, 'hand_to_role', roles)).toEqual([
      'role:it',
    ])
  })
})

function template(type: string) {
  const dir = resolve('templates/injects', type)
  const read = (f: string) =>
    JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Record<string, never>
  return {
    schema: read('schema.json'),
    fields: read('preview.json').fields as unknown as Record<string, unknown>,
    slots: (read('meta.json').imageSlots ?? []) as unknown as string[],
  }
}

describe('injectText', () => {
  it('lists a memo as Label: value lines in schema order, skipping empty fields', () => {
    const t = template('memo')
    const text = injectText(
      { title: 'BHS failure', type: 'memo', fields: t.fields },
      t.schema,
      t.slots,
      {
        event: 'unused',
      },
    )
    const lines = text.body.split('\n')
    expect(lines[0]).toBe('Org name: Northeast Central Interstate Airport')
    expect(text.body).toContain('Subject: URGENT: BHS CRITICAL FAILURE')
    expect(text.body).toContain('We need you to authorize a switch')
    expect(text.body).not.toContain('Cc:')
    expect(text.headline).toBe('BHS failure')
    expect(text.altText).toMatch(/^BHS failure — /)
  })

  it('lists rows of a FIDS board as bullet lines', () => {
    const t = template('fids_board')
    const text = injectText(
      { title: 'FIDS', type: 'fids_board', fields: t.fields },
      t.schema,
      t.slots,
      {
        event: 'unused',
      },
    )
    expect(text.body).toMatch(/^- .*: .+/m)
    expect(text.body.length).toBeGreaterThan(40)
  })

  it('keeps an email subject and body', () => {
    const t = template('email')
    const text = injectText({ title: 'Mail', type: 'email', fields: t.fields }, t.schema, t.slots, {
      event: 'unused',
    })
    expect(text.body).toMatch(/Subject: .+/)
  })

  it('does not print image slots, and falls back to the MSEL event with no fields', () => {
    const withSlot = injectText({ fields: { photo: 'x.png', note: 'Hello' } }, {}, ['photo'], {
      event: 'e',
    })
    expect(withSlot.body).toBe('Note: Hello')
    expect(
      injectText({ title: 'T', fields: {} }, {}, [], { event: ' Gate B4 is closed ' }).body,
    ).toBe('Gate B4 is closed')
  })

  it('uses the schema title as the label when a property has one', () => {
    const text = injectText(
      { fields: { gate: 'B4' } },
      { properties: { gate: { title: 'Departure gate' } } },
      [],
      {
        event: '',
      },
    )
    expect(text.body).toBe('Departure gate: B4')
  })
})

describe('injectAltText', () => {
  it('names the title and the type, and falls back to the row id', () => {
    expect(injectAltText({ title: 'Tweet', type: 'memo' })).toMatch(/^Tweet — /)
    expect(injectAltText({ mselRowId: 'I-06' })).toBe('Inject I-06')
  })
})

describe('captionsFromVoiceLines', () => {
  it('builds WebVTT cues in order and returns nothing without lines', () => {
    const vtt = captionsFromVoiceLines([
      { text: 'Tower, ground.' },
      { text: '  ' },
      { text: 'Go ahead.' },
    ])!
    expect(vtt.startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nTower, ground.')).toBe(true)
    expect(vtt).toContain('00:00:02.000 --> 00:00:04.000\nGo ahead.')
    expect(captionsFromVoiceLines([])).toBeUndefined()
  })
})
