import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MselRow } from '@shared/schemas'
import { extractFacilityFacts } from '../facility'
import {
  contentIssues,
  exampleCopies,
  facilityFieldIssues,
  hostIpPairings,
  technicalIssues,
} from './consistency'
import { chooseInjectType } from './type-map'

const schemaOf = (type: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(`templates/injects/${type}/schema.json`), 'utf8'))

const row = (id: string, from: string, event: string, format: string): MselRow => ({
  id,
  phaseId: 'p1',
  time: '1:45',
  from,
  toRoleIds: ['ops'],
  event,
  expectedAction: 'Ops calms the rep.',
  purposeTag: 'PRESSURE',
  format,
  citations: [],
  locked: false,
})

const I08 = row(
  'I-08',
  'Airline Rep',
  'Face-to-Face: (Angry) "Our pilots are refusing to push back because the gate data is wrong."',
  'simcell_script',
)

describe('exampleCopies (#105)', () => {
  it('flags field values copied from the template examples when the row never said them', () => {
    const fields = {
      role: 'FBI Cyber Duty Agent',
      persona: 'Special Agent Smith',
      organization: 'FBI Cleveland Field Office, Cyber Squad',
      trigger: 'Players call the airline station manager.',
      hardQuestions: ['Do you have a PCAP capture of the traffic?', 'Why are the boards wrong?'],
    }
    const issues = exampleCopies(fields, schemaOf('simcell_script'), `${I08.from}\n${I08.event}`)
    expect(issues.map((i) => i.path)).toEqual([
      'fields.role',
      'fields.persona',
      'fields.organization',
    ])
    expect(issues[0]!.message).toContain('"FBI Cyber Duty Agent" is the template\'s example')
  })

  it('checks only identity fields: a structural field may legitimately equal its example', () => {
    const radio = {
      centerName: 'Airport Operations Center (AOC)',
      callsign: 'Ops 1',
      frequency: 'TG 4101 / 460.250 MHz',
    }
    const schema = {
      type: 'object',
      properties: {
        centerName: { type: 'string', examples: ['Airport Operations Center (AOC)'] },
        callsign: { type: 'string', examples: ['Parking 3'] },
        frequency: { type: 'string', examples: ['TG 4101 / 460.250 MHz'] },
      },
    }
    expect(exampleCopies(radio, schema, '')).toEqual([])
    expect(exampleCopies({ ...radio, callsign: 'Parking Garage 3' }, schema, '')).toEqual([])
  })

  it('accepts the example text when the row itself says it, and short examples always', () => {
    const slip = {
      to: 'Public Information Officer',
      fromName: 'Assignment Desk',
      fromOrg: 'Channel 5 News (ABC Affiliate)',
      message: 'Going live at noon with the board photos.',
      ampm: 'AM',
    }
    const media = row(
      'I-12',
      'Media',
      'Phone Call: "Channel 5 News here, Assignment Desk."',
      'media_inquiry_phone_slip',
    )
    // The scenario's own role name matches the example for "to": known text, not a leak.
    const known = `${media.from}\n${media.event}\nPublic Information Officer (PIO)`
    const issues = exampleCopies(slip, schemaOf('media_inquiry_phone_slip'), known)
    expect(issues.map((i) => i.path)).toEqual(['fields.fromOrg'])
    expect(
      exampleCopies({ ampm: 'AM', date: '10/14' }, schemaOf('media_inquiry_phone_slip'), ''),
    ).toEqual([])
  })
})

describe('technicalIssues (system_log coherence)', () => {
  const log = {
    systemName: 'AODB_SQL_MASTER',
    host: 'AODB-01',
    os: 'Linux Ubuntu 22.04 LTS',
    lines: [
      {
        ts: '10:59:12',
        level: 'INFO',
        msg: "User 'admin.audit' logged in from IP 104.244.177.192 (OPS_INTERN_03)",
      },
      {
        ts: '10:59:18',
        level: 'CRIT',
        msg: 'executed script: /opt/aodb/scripts/random_gate_generator.ps1',
      },
      { ts: '10:59:21', level: 'ERROR', msg: 'Script failed: 142 rows affected.' },
    ],
  }
  const story = hostIpPairings([
    'Failed Login from 192.168.1.55 (OPS_INTERN_03); AODB_SQL_MASTER (10.66.0.10)',
    'FIDS-WEB-01 at 10.66.0.20',
  ])

  it('pairs hosts with the addresses the story established', () => {
    expect([...story]).toEqual([
      ['OPS_INTERN_03', '192.168.1.55'],
      ['AODB_SQL_MASTER', '10.66.0.10'],
      ['FIDS-WEB-01', '10.66.0.20'],
    ])
  })

  it('reports OS/tooling, failed-yet-affected rows and a re-addressed workstation', () => {
    const issues = technicalIssues('system_log', log, story)
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringContaining('is Linux, but the lines use Windows tooling'),
      expect.stringContaining('a failed command affects no rows'),
      expect.stringContaining(
        '104.244.177.192 is paired with OPS_INTERN_03, but the story established OPS_INTERN_03 as 192.168.1.55',
      ),
    ])
    expect(technicalIssues('tweet', log, story)).toEqual([])
    const coherent = {
      ...log,
      os: 'Windows Server 2019',
      lines: [
        { ts: '1', level: 'INFO', msg: 'Login from 192.168.1.55 (OPS_INTERN_03)' },
        { ts: '2', level: 'CRIT', msg: 'EXEC random_gate_generator.ps1 — 142 rows affected' },
      ],
    }
    expect(technicalIssues('system_log', coherent, story)).toEqual([])
  })
})

describe('facilityFieldIssues and contentIssues', () => {
  const facts = extractFacilityFacts([
    'Runways 5/23 and 1/19. Gates (A1–A8, B1–B10). Concourse A and B.',
  ])

  it('flags undocumented identifiers in the fields unless framed as fake', () => {
    const ticket = row('I-02a', 'Helpdesk', 'Ticket: vending machines', 'helpdesk_ticket')
    expect(
      facilityFieldIssues({ description: 'Machines at Gate C12 spitting cans' }, facts, ticket),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('gate C12 is not in the facility facts'),
      }),
    ])
    expect(facilityFieldIssues({ description: 'Gate Z99 does not exist' }, facts, ticket)).toEqual(
      [],
    )
    expect(
      contentIssues({
        type: 'helpdesk_ticket',
        fields: { description: 'Machines at Gate B2' },
        schema: schemaOf('helpdesk_ticket'),
        row: ticket,
        facility: facts,
        storyTexts: [],
      }),
    ).toEqual([])
  })
})

describe('chooseInjectType source remap (#105)', () => {
  const installed = ['media_inquiry_phone_slip', 'phone_call', 'radio_call']
  it('writes a non-media phone slip as a phone call and keeps media callers on the slip', () => {
    const tsa = row(
      'I-10b',
      'TSA',
      'Phone Call: TSA screening is stopping.',
      'media_inquiry_phone_slip',
    )
    expect(chooseInjectType(tsa, installed)).toMatchObject({
      type: 'phone_call',
      hasTemplate: true,
      note: expect.stringContaining('the row\'s source is "TSA"'),
    })
    const media = row(
      'I-12',
      'Media',
      'Phone Call: "Channel 5 News here."',
      'media_inquiry_phone_slip',
    )
    expect(chooseInjectType(media, installed)).toEqual({
      type: 'media_inquiry_phone_slip',
      hasTemplate: true,
    })
    const reporter = row(
      'I-13',
      'Outside Caller',
      'Phone Call: a reporter from the Beacon Journal wants a quote.',
      'media_inquiry_phone_slip',
    )
    expect(chooseInjectType(reporter, installed).type).toBe('media_inquiry_phone_slip')
    // Without a phone_call template the remapped row follows phone_call's own fallback chain.
    expect(chooseInjectType(tsa, ['media_inquiry_phone_slip', 'radio_call'])).toMatchObject({
      type: 'radio_call',
      requested: 'phone_call',
    })
  })
})
