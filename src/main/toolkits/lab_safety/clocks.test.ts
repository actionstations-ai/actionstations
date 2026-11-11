// The lab regulation clocks and the notification board (#871): each regulation parses and cites
// its source and date, the deadlines come out right across weekends and time jumps, a draft is
// labeled a draft, and the board shows made, late and not-started notifications in words.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Regulation, type ComplianceSession } from '@shared/schemas/compliance'
import { deadline, anchorsFrom } from '@shared/compliance/clock'
import { parseLocal } from '@shared/compliance/scenario-time'
import { renderFigure } from '../../render/figures'
import { notificationBoardData, ruleWords } from './notification-board'

const ROOT = join(__dirname, '../../../..')
const load = (id: string) =>
  Regulation.parse(JSON.parse(readFileSync(join(ROOT, `packs/regulations/${id}.json`), 'utf8')))
const select = load('select_agent_73_19')
const nih = load('nih_guidelines_incident_reporting')
const draft = load('nih_biosafety_policy_draft')
const inst = load('lab_institution_deadlines')

// A Friday, so seven calendar days and a weekend both matter.
const START = parseLocal('2026-10-23T09:00')
const empty: ComplianceSession = { fired: [], clocks: {}, onScreen: [] }
const fired = (
  regulationId: string,
  triggerId: string,
  exerciseMin: number,
): ComplianceSession['fired'][number] => ({
  id: `${regulationId}-${triggerId}-${exerciseMin}`,
  regulationId,
  triggerId,
  exerciseMin,
  scenarioAt: '2026-10-23T09:00',
  by: 'manual',
  note: '',
})

describe('lab regulation clocks', () => {
  it('cite a source and the date they were checked', () => {
    for (const r of [select, nih, draft, inst]) {
      expect(r.sources.length, r.id).toBeGreaterThan(0)
      expect(r.verifiedOn, r.id).toBe('2026-11-04')
    }
  })

  it('give the select agent written report seven calendar days, not three', () => {
    const forms = select.clocks.filter((c) => c.id.endsWith('form3'))
    expect(forms).toHaveLength(2)
    for (const c of forms)
      expect(c.dueAt).toEqual([expect.objectContaining({ amount: 7, unit: 'calendar_days' })])
    expect(select.statusNote).toMatch(/seven calendar days/)
  })

  it('carries immediate notices for theft or loss (with law enforcement) and for release', () => {
    expect(select.clocks.map((c) => c.id)).toEqual([
      'theft_loss_notice',
      'theft_loss_law_enforcement',
      'theft_loss_form3',
      'release_notice',
      'release_form3',
    ])
  })

  it('labels the draft NIH policy as proposed with its notice number and date', () => {
    expect(draft.status).toBe('proposed')
    expect(draft.citation).toMatch(/NOT-OD-26-112/)
    expect(draft.statusNote).toMatch(/draft/i)
    expect(draft.clocks.map((c) => c.dueAt[0]!.amount)).toEqual([24, 30])
  })

  it('counts seven calendar days across a weekend from a Friday discovery', () => {
    const session: ComplianceSession = {
      ...empty,
      fired: [fired(select.id, 'theft_or_loss_discovered', 8 * 60)],
    }
    const d = deadline(select, 'theft_loss_form3', anchorsFrom(select.id, session, START))
    expect('dueAt' in d && d.dueAt.toISOString()).toBe('2026-10-30T17:00:00.000Z')
  })

  it('moves with the exercise clock after a time jump', () => {
    const early = { ...empty, fired: [fired(select.id, 'release_discovered', 60)] }
    const jumped = { ...empty, fired: [fired(select.id, 'release_discovered', 60 + 2 * 1440)] }
    const at = (s: ComplianceSession) => {
      const d = deadline(select, 'release_form3', anchorsFrom(select.id, s, START))
      return 'dueAt' in d ? d.dueAt.getTime() : 0
    }
    expect(at(jumped) - at(early)).toBe(2 * 1440 * 60_000)
  })

  it('words each rule, widening "immediately" to the exercise window', () => {
    expect(ruleWords(select.clocks[0]!.dueAt, 45)).toBe('Immediately (exercise window 45 minutes)')
    expect(ruleWords(select.clocks[2]!.dueAt, 45)).toBe('Within 7 calendar days')
    expect(ruleWords(inst.clocks[0]!.dueAt, 45)).toBe('Within 24 hours')
  })
})

describe('notification board', () => {
  const session: ComplianceSession = {
    fired: [
      fired(select.id, 'theft_or_loss_discovered', 0),
      fired(inst.id, 'incident_known_to_lab', 0),
    ],
    clocks: {
      'select_agent_73_19:theft_loss_notice': { status: 'met', exerciseMin: 20, note: '' },
      'select_agent_73_19:theft_loss_law_enforcement': { status: 'met', exerciseMin: 90, note: '' },
    },
    onScreen: [],
  }
  const board = notificationBoardData([select, nih, inst], session, START, 26 * 60)
  const row = (label: RegExp) => board.rows.find((r) => label.test(r.notification))!

  it('shows a timely call as made and a late one as made late, with minutes', () => {
    expect(row(/Immediate notice of theft/).status).toBe('made')
    expect(row(/Immediate notice of theft/).made).toMatch(/40 m early/)
    expect(row(/law enforcement/).status).toBe('made_late')
    expect(row(/law enforcement/).made).toMatch(/30 m late/)
  })

  it('shows an unmade notice past its deadline as late and one inside it as open', () => {
    expect(row(/PI reports/).status).toBe('late')
    expect(row(/Form 3 for theft/).status).toBe('open')
    expect(row(/Form 3 for theft/).due).toBe('Fri 30 Oct 2026 09:00')
  })

  it('shows clocks whose trigger has not fired as not started', () => {
    expect(row(/IBC report to NIH/).status).toBe('not_started')
    expect(row(/IBC report to NIH/).due).toBe('')
  })

  it('draws a figure whose summary counts the missed notifications and states every status in words', () => {
    const out = renderFigure({ kind: 'lab_notification_clock_board', data: board })
    expect(out.summary).toMatch(/2 missed \(1 still late, 1 made late\)/)
    expect(out.svg).toContain('Made late')
    expect(out.svg).toContain('Not started')
    expect(out.table!.rows).toHaveLength(board.rows.length)
  })

  it('scores a call made inside a longer exercise window as on time', () => {
    const wide = notificationBoardData([select], session, START, 26 * 60, { immediateMinutes: 120 })
    expect(wide.rows.find((r) => /law enforcement/.test(r.notification))!.status).toBe('made')
  })
})

describe('expert review facts (#699)', () => {
  it('reports BL3 and BL4 potential exposures immediately, not only BL2 overt ones', () => {
    const trigger = nih.triggers.find((t) => t.id === 'bl2_overt_exposure')!
    expect(trigger.hint).toMatch(/overt or potential exposure in a BL3 or BL4 laboratory/)
    expect(nih.citation).toMatch(/G-II-C-2-q/)
  })

  it('states the select agent deadlines without an outside slide as a source', () => {
    expect(select.statusNote).not.toMatch(/slide/)
    expect(select.statusNote).toMatch(/seven calendar days/)
  })
})
