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

describe('outside agencies ordering, forbidding and taking over (#364 item 3)', () => {
  const flagged = (event: string): (string | undefined)[] => {
    const s = clone()
    byId(s, 'I-03').event = event
    return hits(s, OUTSIDE_AGENCY_DECIDES)
  }

  it.each([
    // city-water tank: the FBI holding the return to service.
    'Phone Call: "No return to service at Orchard Standpipe until the FBI issues a formal release."',
    'Email: The FBI forbids return to service of the standpipe while evidence is collected.',
    'Phone Call: "This is the FBI. We are taking jurisdiction; the utility is to stand down."',
    // city-water main: the state drinking-water office ordering the advisory.
    'Phone Call: "DDAGW here. You must issue the boil advisory within 30 minutes."',
    'Email: Ohio EPA orders the city to issue a Do Not Drink notice by 12:00.',
    'Phone Call: "The state drinking-water program requires the utility to flush Zone 1 now."',
    'Radio: The FAA prohibits further flights from the Lakeshore Flight Area today.',
    'Phone Call: "Coast Guard: Captain of the Port directs the terminal operators to close the berth."',
  ])('flags %s', (event) => {
    expect(flagged(event)).toEqual(['I-03'])
  })

  it.each([
    'Phone Call: "DDAGW recommends you issue the advisory within 30 minutes."',
    'Email: The FBI asks the utility to preserve the HMI images and requests a copy.',
    'Phone Call: "The FBI has taken over the criminal investigation; you run the response."',
    'Email: The FBI does not order the city to do anything; restart is your call.',
    'Phone Call: "Ohio EPA: please call us before you restart the plant."',
    'Email: The state requires a report within 24 hours; CISA should get a copy.',
    'Radio: The crew will not restart until the FBI has photographed the panel.',
  ])('accepts advice, requests and negations: %s', (event) => {
    expect(flagged(event)).toEqual([])
  })

  it('reads an order from the row source, but not the players own expected action', () => {
    const s = clone()
    const row = byId(s, 'I-03')
    row.from = 'Ohio EPA DDAGW (district office)'
    row.event = 'Phone Call: "The city must keep Zone 1 on the boil order until we sign off."'
    row.expectedAction = 'The incident commander must decide on the boil order.'
    expect(hits(s, OUTSIDE_AGENCY_DECIDES)).toEqual(['I-03'])
    row.event =
      'Phone Call: "Call us when the samples are back; the city must report the results by 17:00."'
    expect(hits(s, OUTSIDE_AGENCY_DECIDES)).toEqual([])
  })

  it('accepts an agency asking for evidence or a decision (the shipped k12 and uas rows)', () => {
    const s = clone()
    const row = byId(s, 'I-03')
    row.from = 'CISA'
    row.event =
      "Phone Call: 'CTO, this is CISA. You must preserve HUSD-VPN01 as evidence for law enforcement. Do not wipe or reboot.'"
    expect(hits(s, OUTSIDE_AGENCY_DECIDES)).toEqual([])
    row.from = 'FSDO'
    row.event =
      "Phone Call: 'ASO, this is the FAA FSDO. You must submit the flight logs within 24 hours. You must now decide: keep automation or switch to attitude mode.'"
    expect(hits(s, OUTSIDE_AGENCY_DECIDES)).toEqual([])
  })
})
