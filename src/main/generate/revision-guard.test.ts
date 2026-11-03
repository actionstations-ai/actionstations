// The storm-case rows (county 911, #590): the critique "corrected" a deliberate fake number in
// PRESSURE rows and reversed who calls whom in I-11. No model calls: the guard is pure code.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { MselRow, Role, Scenario } from '@shared/schemas'
import { compileTemplate } from '../prompts/template'
import {
  deliberateTokens,
  notesDeliberateContent,
  revisionRejection,
  tagGuide,
} from './revision-guard'
import fixture from '../../../tests/fixtures/generate/storm-critique-rows.json'

const roles = fixture.roles as unknown as Role[]
const before = (id: string) => fixture.before.find((r) => r.id === id) as unknown as MselRow
const after = (id: string) => fixture.after.find((r) => r.id === id)!

const asRevision = (r: { from: string; toRoleIds: string[]; event: string }) => ({
  from: r.from,
  to: r.toRoleIds,
  event: r.event,
})

describe('revision guard on the storm case', () => {
  it('rejects the rewrite of the fake number in I-03b and I-06b', () => {
    for (const id of ['I-03b', 'I-06b']) {
      const why = revisionRejection(before(id), asRevision(after(id)), roles)
      expect(why, id).toMatch(/deliberate PRESSURE content changed.*5550177/)
    }
  })

  it('rejects the I-11 rewrite that makes the called party the sender', () => {
    const why = revisionRejection(before('I-11'), asRevision(after('I-11')), roles)
    expect(why).toMatch(/State ESInet NOC.*became the sender/)
  })

  it('accepts a PRESSURE rewrite that keeps the number and the sender', () => {
    const row = before('I-03b')
    const edited = row.event.replace('47 reposts in 8 minutes', '90 reposts in 8 minutes')
    const rev = { from: row.from, to: row.toRoleIds, event: edited }
    expect(revisionRejection(row, rev, roles)).toBe(undefined)
  })

  it('rejects swapping sender and recipient', () => {
    const row = before('I-03b')
    const swapped = { from: 'Pio', to: ['dir'], event: row.event }
    expect(revisionRejection(row, swapped, roles)).toMatch(/became the sender|replaced/)
  })

  it('lets a CORE_NARRATIVE row be re-sourced from a player role to an outside party', () => {
    const row = before('I-11')
    const rev = { from: 'Dispatch Helpdesk', to: row.toRoleIds, event: 'Ticket 4411 opened.' }
    expect(revisionRejection(row, rev, roles)).toBe(undefined)
  })
})

describe('notes about deliberate content', () => {
  it('flags the storm-case note on 555-0177 as an objection to intentional content', () => {
    const note =
      'Row I-03b reports a fake number 555-0177, not valid. Replace 555-0177 with 555-0110.'
    expect(notesDeliberateContent(before('I-03b'), note)).toBe(true)
  })

  it('does not apply to rows that advance the story', () => {
    const note = 'The NOC (555-0119) is not a player role.'
    expect(deliberateTokens(before('I-11').event)).toContain('5550119')
    expect(notesDeliberateContent(before('I-11'), note)).toBe(false)
  })

  it('does not swallow a design note on a PRESSURE row', () => {
    expect(notesDeliberateContent(before('I-03b'), 'This row duplicates I-03a.')).toBe(false)
  })
})

describe('critique prompt', () => {
  const body = readFileSync('prompts/critique.md', 'utf8')
  const render = (s: Pick<Scenario, 'msel'>) =>
    compileTemplate(body)({
      domain: { label: 'emergency communications' },
      threat: { label: 'TDoS', description: 'x', clueKinds: 'logs', keyCoordination: 'the NOC' },
      tagGuide: tagGuide(s as Scenario),
    })

  it('tells the reviewer which tags are intentional and asks for design checks first', () => {
    const text = render({ msel: fixture.before as unknown as MselRow[] })
    expect(text).toContain('PRESSURE: External stakeholder demands a response now (INTENTIONAL')
    expect(text).toContain('CORE_NARRATIVE: Advances the main storyline\n')
    expect(text.indexOf('Check the design first')).toBeLessThan(text.indexOf('Then fact checks'))
    expect(text).toContain('Never report their invented numbers')
  })
})
