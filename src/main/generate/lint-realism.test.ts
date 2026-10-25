// Realism lints (#347): outside agencies deciding for the organization, restores that finish
// in minutes and real-looking contact details. Cases are the defects the 0.4.0 examples were
// corrected for by hand (TSA approving restoration, support@tacsystems.com, reporter@wcft7.com,
// a SCADA network rebuilt within two rows).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MselRow, Scenario } from '@shared/schemas'
import {
  allowedDomain,
  CONTACT_REAL_LOOKING,
  exerciseDomain,
  lintRealism,
  OUTSIDE_AGENCY_DECIDES,
  realLookingDomains,
  realLookingPhones,
  RESTORE_TOO_FAST,
} from './lint-realism'

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const clone = (): Scenario => structuredClone(FIXTURE)
const byId = (s: Scenario, id: string): MselRow => s.msel.find((r) => r.id === id)!
const hits = (s: Scenario, code: string): (string | undefined)[] =>
  lintRealism(s)
    .filter((w) => w.code === code)
    .map((w) => w.rowId)

describe('the hand-built Scenario 3', () => {
  it('passes every realism lint', () => {
    expect(lintRealism(FIXTURE)).toEqual([])
  })
})

describe('outside agencies deciding (#347 item 8)', () => {
  it.each([
    "Email: 'From TSA Pipeline Security: TSA approves the restoration of SCADA for District 7.'",
    'Phone Call: "CISA here: CISA is closing the incident as of 14:00, you may resume."',
    'Memo: the restart of Unit 300 was approved by the state regulator at 12:10.',
    'Memo: restoration proceeds after CISA sign-off on the rebuilt servers.',
  ])('flags "%s"', (event) => {
    const s = clone()
    byId(s, 'I-07').event = event
    expect(hits(s, OUTSIDE_AGENCY_DECIDES)).toEqual(['I-07'])
  })

  it.each([
    "IC confirms that no regulator approves the restart; it is the Works' own PSSR decision.",
    'CYB confirms no access will be restored until after CISA and TSA clearance.',
    'The IC reports the incident to CISA and the FBI and asks CISA for an incident response team.',
    'The FBI closes its case file once the images are collected.',
  ])('does not flag "%s"', (expectedAction) => {
    const s = clone()
    byId(s, 'I-07').expectedAction = expectedAction
    expect(hits(s, OUTSIDE_AGENCY_DECIDES)).toEqual([])
  })
})

describe('restores that finish in minutes (#347 item 9)', () => {
  it('flags a full restore within the hour of the encryption', () => {
    const s = clone()
    byId(s, 'I-03').event =
      'Ticket #4410: ransomware note on every server; the file shares are encrypted.'
    byId(s, 'I-05b').event =
      'Technical Update: all servers have been restored from backup and the SCADA network is back online.'
    expect(hits(s, RESTORE_TOO_FAST)).toEqual(['I-05b'])
  })

  it('accepts a restore that is started, scheduled or hours later', () => {
    const s = clone()
    byId(s, 'I-03').event = 'Ticket #4410: the file shares are encrypted.'
    byId(s, 'I-05b').event =
      'Technical Update: the restore of the file server has started; estimated 6 hours.'
    expect(hits(s, RESTORE_TOO_FAST)).toEqual([])
    byId(s, 'I-05b').event =
      'Technical Update: the vendor will rebuild the servers once forensics is done.'
    expect(hits(s, RESTORE_TOO_FAST)).toEqual([])
    byId(s, 'END').event = 'ENDEX: the servers are fully restored.'
    expect(hits(s, RESTORE_TOO_FAST)).toEqual([])
  })
})

describe('real-looking contact details (#347 item 10)', () => {
  it('flags real-looking domains, keeps reserved, agency and public mail domains', () => {
    expect(
      realLookingDomains(
        'support@tacsystems.com, reporter@wcft7.com, www.halden-herald.com, alerts@millbrook.gov',
      ),
    ).toEqual([
      'support@tacsystems.com',
      'reporter@wcft7.com',
      'www.halden-herald.com',
      'alerts@millbrook.gov',
    ])
    for (const d of [
      'corwinvalleygas.example',
      'cisa.gov',
      'phish.cisa.gov',
      'tsa.dhs.gov',
      'epa.ohio.gov',
      'kdhe.ks.gov',
      'gmail.com',
      'example.com',
    ])
      expect(allowedDomain(d), d).toBe(true)
    expect(realLookingDomains('the script auto_cleaner.py and report.pdf')).toEqual([])
  })

  it('flags 555 numbers outside 0100–0199 and geographic numbers, not toll-free hotlines', () => {
    expect(realLookingPhones('call (330) 555-2400 or 555-0177 or 555-0101')).toEqual([
      '(330) 555-2400',
    ])
    expect(realLookingPhones('call 614-728-4100 now')).toEqual(['614-728-4100'])
    expect(realLookingPhones('NRC (800-424-8802), CISA 888-282-0870')).toEqual([])
    expect(realLookingPhones('lot MMR-2026-0044, case 26-0112, IP 10.72.20.11')).toEqual([])
  })

  it('names the exercise domain in the fix hint', () => {
    const s = clone()
    s.brief.constraints = ['Every email address uses the exercise domain teaguevalleychem.example.']
    expect(exerciseDomain(s)).toBe('teaguevalleychem.example')
    byId(s, 'I-07').event = "Email: 'From newsdesk@wcft7.com: we go live in 5 minutes.'"
    const w = lintRealism(s).find((x) => x.code === CONTACT_REAL_LOOKING)
    expect(w).toMatchObject({ rowId: 'I-07' })
    expect(w?.suggestion).toContain('teaguevalleychem.example')
  })
})
