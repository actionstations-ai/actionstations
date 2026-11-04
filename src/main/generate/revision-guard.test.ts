// The storm-case rows (county 911, #590): the critique "corrected" a deliberate fake number in
// PRESSURE rows and reversed who calls whom in I-11. No model calls: the guard is pure code.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { MselRow, Role, Scenario } from '@shared/schemas'
import { compileTemplate } from '../prompts/template'
import {
  deliberateTokens,
  isDecisionPointNote,
  newDecisionBudget,
  notesDeliberateContent,
  overreachRejection,
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

// #601: the same storm case, qwen3-30b run. The planted defect removes the DECISION POINT marker
// from I-09; the revision turned I-16, I-17 and I-03b into decision prompts as well. The rows
// are reduced from that run's before/after; I-09 "after" is a targeted, gemma-style fix.
describe('revision guard: rows the note does not name (#601)', () => {
  const rev = JSON.parse(
    readFileSync('tests/fixtures/generate/qwen-decision-revision-rows.json', 'utf8'),
  ) as { before: MselRow[]; after: (MselRow & { expectedAction: string })[] }
  const rowBefore = (id: string) => rev.before.find((r) => r.id === id)!
  const rowAfter = (id: string) => rev.after.find((r) => r.id === id)!
  const decisionNote = (id: string) =>
    `${id}: No row poses a decision with a cost on both sides. Fix: make this row the decision point.`
  const check = (id: string, note: string, budget = newDecisionBudget()) =>
    overreachRejection(rowBefore(id), rowAfter(id), note, budget)

  it('recognises the missing-decision-point note', () => {
    expect(isDecisionPointNote(decisionNote('I-09'))).toBe(true)
    expect(isDecisionPointNote('I-16: The backup time contradicts the facts.')).toBe(false)
  })

  it('reverts I-16, whose sender and event were rewritten into a vendor email', () => {
    expect(check('I-16', decisionNote('I-16'))).toMatch(/keeps its sender/)
  })

  it('reverts I-17, whose sitrep became a phone call from the EMA', () => {
    expect(check('I-17', decisionNote('I-17'))).toMatch(/keeps its sender/)
  })

  it('reverts I-03b, a PRESSURE row turned into a decision prompt', () => {
    expect(check('I-03b', decisionNote('I-03b'))).toMatch(/PRESSURE row into a decision/)
  })

  it('reverts any changed row the critique did not name', () => {
    expect(check('I-16', '')).toMatch(/does not name this row/)
  })

  it('accepts the targeted fix: only I-09 gains its decision marker, same sender and event', () => {
    const budget = newDecisionBudget()
    expect(check('I-09', decisionNote('I-09'), budget)).toBe(undefined)
    expect(revisionRejection(rowBefore('I-09'), asRevision(rowAfter('I-09')), roles)).toBe(
      undefined,
    )
    expect(budget.left).toBe(0)
  })

  it('converts one row only: a second decision-point conversion is reverted', () => {
    const budget = newDecisionBudget()
    expect(check('I-09', decisionNote('I-09'), budget)).toBe(undefined)
    const again = overreachRejection(
      rowBefore('I-09'),
      { ...rowAfter('I-09'), expectedAction: 'DECISION POINT: choose again.' },
      decisionNote('I-09'),
      budget,
    )
    expect(again).toMatch(/one row only/)
  })

  it('leaves a row alone when the revision changes nothing', () => {
    const same = overreachRejection(rowBefore('I-16'), rowBefore('I-16'), '', newDecisionBudget())
    expect(same).toBe(undefined)
  })

  it('lets an ordinary note on a named row through to the existing guards', () => {
    const note = 'I-16: the backup time is wrong. Fix: say 02:00.'
    const edited = {
      ...rowBefore('I-16'),
      event: rowBefore('I-16').event.replace('02:00', '02:30'),
    }
    expect(overreachRejection(rowBefore('I-16'), edited, note, newDecisionBudget())).toBe(undefined)
  })
})
