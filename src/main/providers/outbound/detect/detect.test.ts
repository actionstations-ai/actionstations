// Detector table tests (#433, FR-10): what each category must find, and the look-alikes it must
// leave alone (times, dates, section numbers, ICS forms, IPs, role titles, agency names).
import { describe, expect, it } from 'vitest'
import { REDACTION_CATEGORIES, type RedactionCategory } from '@shared/schemas'
import { detectAll, emptyContext, notNameWords, type DetectContext } from './index'

const ALL = new Set<RedactionCategory>(REDACTION_CATEGORIES)

function found(text: string, ctx: Partial<DetectContext> = {}, only?: RedactionCategory) {
  const enabled = only ? new Set([only]) : ALL
  return detectAll(text, enabled, { ...emptyContext(), ...ctx }).map((s) => [s.category, s.value])
}

describe('email', () => {
  it.each([
    ['Write to dana.ruiz@rivergate-water.org today.', 'dana.ruiz@rivergate-water.org'],
    ['ops+alerts@city.example.gov', 'ops+alerts@city.example.gov'],
    ['<j_o-k@mail.co.uk>', 'j_o-k@mail.co.uk'],
  ])('finds %s', (text, value) => {
    expect(found(text, {}, 'email')).toEqual([['email', value]])
  })

  it.each(['@CityWater on social media', 'user@localhost', 'v1.2@3', 'a@b'])(
    'leaves %s alone',
    (text) => {
      expect(found(text, {}, 'email')).toEqual([])
    },
  )
})

describe('phone', () => {
  it.each([
    ['Call (509) 555-0142 now', '(509) 555-0142'],
    ['Call 509-555-0142.', '509-555-0142'],
    ['Call 509.555.0142', '509.555.0142'],
    ['Call 509 555 0142', '509 555 0142'],
    ['Call +1 509 555 0142', '+1 509 555 0142'],
    ['Call +15095550142', '+15095550142'],
    ['Desk 509-555-0142 x204', '509-555-0142 x204'],
    ['Desk 509-555-0142 ext. 77', '509-555-0142 ext. 77'],
    ['London +44 20 7946 0958.', '+44 20 7946 0958'],
  ])('finds %s', (text, value) => {
    expect(found(text, {}, 'phone')).toEqual([['phone', value]])
  })

  it.each([
    'At 13:45 the pumps stopped',
    'On 2024-05-12 the plan changed',
    'See section 13.6.2 of the ERP',
    'File an ICS-201 and ICS-213',
    'Host 192.168.100.200 went offline',
    'Ticket 5095550142 was opened',
    'Dates 05/12/2024 and 12-05-2024',
    'Version 3.14.159',
    'Budget 1,250,000',
  ])('leaves "%s" alone', (text) => {
    expect(found(text, {}, 'phone')).toEqual([])
  })

  it('finds numbers listed in the facility facts in any spelling', () => {
    const ctx = { knownPhones: ['(509) 555-0100'] }
    expect(found('Desk: 509 5550100.', ctx, 'phone')).toEqual([['phone', '509 5550100']])
  })
})

describe('address', () => {
  it.each([
    ['Meet at 1200 Riverside Drive.', '1200 Riverside Drive'],
    ['HQ is 45 N. Main St, Suite 300', '45 N. Main St, Suite 300'],
    ['Ship to 9 Elm Street, Spokane, WA 99201 today', '9 Elm Street, Spokane, WA 99201'],
    ['at 300 Martin Luther King Jr Blvd', '300 Martin Luther King Jr Blvd'],
    ['at 77 5th Ave', '77 5th Ave'],
    ['Mail to PO Box 4410', 'PO Box 4410'],
    ['Mail to P.O. Box 12', 'P.O. Box 12'],
    ['at 12 Union Station, Denver, CO 80202', '12 Union Station, Denver, CO 80202'],
  ])('finds %s', (text, value) => {
    expect(found(text, {}, 'address')).toEqual([['address', value]])
  })

  it.each([
    'Report to 4 Fire Station',
    'Staff 2 Operations Center desks',
    'Pump 3 Main Pump House',
    'Section 4.2 Main Street closures',
    'Gate 12 is closed',
  ])('leaves "%s" alone', (text) => {
    expect(found(text, {}, 'address')).toEqual([])
  })
})

describe('person', () => {
  it.each([
    ['Chief Dana Ruiz arrived.', 'Dana Ruiz'],
    ['Ask Dr. Okafor first.', 'Okafor'],
    ['Sgt. Lee will brief.', 'Lee'],
    ['Deputy Chief Maria Gomez called', 'Maria Gomez'],
    ['Then Michael Okafor joined', 'Michael Okafor'],
    ['Then Jennifer K. Walsh joined', 'Jennifer K. Walsh'],
    ["Ask Patrick O'Neil", "Patrick O'Neil"],
  ])('finds %s', (text, value) => {
    expect(found(text, {}, 'person')).toEqual([['person', value]])
  })

  it.each([
    'The Chief Information Officer approved it.',
    'The Safety Officer leads the Hot Wash.',
    'The Director of Emergency Management signs.',
    'Will Rogers Airport is not in this plan.',
    'May Day drills start at 0800.',
    'The Public Information Officer drafts a release.',
    'General Aviation ramps are closed.',
  ])('leaves "%s" alone', (text) => {
    expect(found(text, {}, 'person')).toEqual([])
  })

  it('treats words from roles, agencies and brands as non-names', () => {
    const ctx = { notNames: notNameWords(['Rivergate Water Authority', 'Officer Kestrel']) }
    expect(
      found('Officer Kestrel opened the valve; Chief Rivergate signed.', ctx, 'person'),
    ).toEqual([])
  })

  it('finds later mentions of a detected surname', () => {
    expect(found('Chief Dana Ruiz arrived. Ruiz then called.', {}, 'person')).toEqual([
      ['person', 'Dana Ruiz'],
      ['person', 'Ruiz'],
    ])
  })

  it('finds the Name column of a Markdown contact table', () => {
    const table = [
      '| Name | Role | Phone |',
      '| --- | --- | --- |',
      '| Avery Kestrel | Duty Manager | x4400 |',
      '| Quill | Plant Operator | x4401 |',
      '',
      'Ends here.',
    ].join('\n')
    expect(found(table, {}, 'person')).toEqual([
      ['person', 'Avery Kestrel'],
      ['person', 'Quill'],
    ])
  })
})

describe('terms and overlap', () => {
  it('redacts Always terms as person, whatever the categories', () => {
    expect(
      detectAll('Call Big Mike at the depot', new Set(), {
        ...emptyContext(),
        alwaysRedact: ['big mike'],
      }).map((s) => s.value),
    ).toEqual(['Big Mike'])
  })

  it('drops any span overlapping a Never term', () => {
    expect(found('Chief Dana Ruiz and Michael Okafor', { neverRedact: ['Dana Ruiz'] })).toEqual([
      ['person', 'Michael Okafor'],
    ])
  })

  it('keeps the longest span when detectors overlap', () => {
    expect(found('Email dana.ruiz@city.gov or Dana Ruiz')).toEqual([
      ['email', 'dana.ruiz@city.gov'],
      ['person', 'Dana Ruiz'],
    ])
  })

  it('returns the same spans for the same input every time', () => {
    const text = 'Chief Dana Ruiz, (509) 555-0142, 9 Elm Street, dana@city.gov. Ruiz left.'
    expect(found(text)).toEqual(found(text))
  })

  it('handles a 40,000-character request quickly (NFR-4)', () => {
    const block =
      'Chief Dana Ruiz called (509) 555-0142 about 1200 Riverside Drive; see section 13.6.2. '
    const text = block.repeat(Math.ceil(40_000 / block.length))
    const t0 = performance.now()
    detectAll(text, ALL, emptyContext())
    expect(performance.now() - t0).toBeLessThan(500)
  })
})
