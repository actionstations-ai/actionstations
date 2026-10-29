import { describe, expect, it } from 'vitest'
import { ComplianceSession, MappingRule } from '@shared/schemas/compliance'
import { MselRow } from '@shared/schemas/scenario'
import { bundledFrameworks, bundledRegulations } from './bundled'
import { buildCoverage, type CoverageInput } from './coverage'
import { normalizeWords, ruleMatches, suggestControls } from './rules'
import { parseLocal } from './scenario-time'

const row = (over: Partial<MselRow>): MselRow =>
  MselRow.parse({
    id: 'I-01',
    phaseId: 'P1',
    time: '0:10',
    from: 'SimCell',
    event: '',
    expectedAction: '',
    purposeTag: 'CORE_NARRATIVE',
    ...over,
  })

const csf = bundledFrameworks().get('nist_csf_2')!
const circia = bundledRegulations().get('circia')!

describe('mapping rules', () => {
  it('match whole words only, with no regex from the pack', () => {
    const rule = MappingRule.parse({ controls: ['X'], keywords: ['backup', 'third party'] })
    const ctx = {}
    expect(ruleMatches(rule, row({ event: 'Restore from the BACKUP tapes.' }), ctx)).toBe(true)
    expect(ruleMatches(rule, row({ event: 'Call the third-party MSP' }), ctx)).toBe(false)
    expect(ruleMatches(rule, row({ event: 'Call the third party MSP' }), ctx)).toBe(true)
    expect(ruleMatches(rule, row({ event: 'backups are fine' }), ctx)).toBe(false)
    expect(normalizeWords('A/B, c!')).toBe(' a b c ')
  })

  it('needs every criterion a rule sets', () => {
    const rule = MappingRule.parse({
      controls: ['X'],
      purposeTags: ['DECISION_POINT'],
      threatFamilies: ['cyber'],
    })
    const r = row({ purposeTag: 'DECISION_POINT' })
    expect(ruleMatches(rule, r, { threatFamily: 'cyber' })).toBe(true)
    expect(ruleMatches(rule, r, { threatFamily: 'natural_hazard' })).toBe(false)
    expect(ruleMatches(MappingRule.parse({ controls: ['X'] }), r, {})).toBe(false)
  })

  it('maps a row that fires any regulation trigger to RS.CO-02', () => {
    const r = row({ triggers: [{ regulationId: 'circia', triggerId: 'covered_incident' }] })
    expect(suggestControls(csf, r, {})).toContain('nist_csf_2:RS.CO-02')
  })

  it('maps a recovery hurdle to RC.RP', () => {
    const r = row({ purposeTag: 'TECH_HURDLE', event: 'The restore from backup fails halfway.' })
    expect(suggestControls(csf, r, {})).toEqual(
      expect.arrayContaining(['nist_csf_2:RC.RP-01', 'nist_csf_2:RC.RP-03']),
    )
  })
})

describe('coverage report', () => {
  const msel = [
    row({
      id: 'I-03',
      purposeTag: 'CLUE',
      event: 'EDR flags an unusual process on the FIDS server.',
    }),
    row({
      id: 'I-07',
      purposeTag: 'DECISION_POINT',
      event: 'Ransomware confirmed on the baggage system.',
      triggers: [{ regulationId: 'circia', triggerId: 'covered_incident' }],
      controls: ['nist_csf_2:RS.MA-01'],
    }),
  ]
  const session = ComplianceSession.parse({
    fired: [
      {
        id: 'f1',
        regulationId: 'circia',
        triggerId: 'covered_incident',
        exerciseMin: 60,
        scenarioAt: '2026-03-12T10:00',
        by: 'row',
        rowId: 'I-07',
      },
    ],
    clocks: { 'circia:incident_report': { status: 'met', exerciseMin: 120, note: 'Filed' } },
  })
  const input: CoverageInput = {
    scenarioTitle: 'Baggage ransomware',
    msel,
    threatFamily: 'cyber',
    frameworks: [csf],
    regulations: [circia],
    session,
    start: { at: parseLocal('2026-03-12T09:00'), source: 'brief' },
    nowMin: 180,
    delivered: { 'I-07': { exerciseTime: '1:00' } },
    notes: { 'I-03': 'Analyst spotted it fast' },
    observedRows: new Set(),
  }
  const report = buildCoverage(input)
  const sheet = report.frameworks[0]!
  const ctl = (id: string) => sheet.rows.find((r) => r.controlId === id)!

  it('has one row per subcategory, with its function and category path', () => {
    expect(sheet.rows).toHaveLength(106)
    expect(ctl('RS.CO-02').path).toEqual([
      'Respond',
      'Incident Response Reporting and Communication',
    ])
  })

  it('rates evidence: planned, delivered, observed (note, met clock)', () => {
    expect(ctl('RS.MA-01')).toMatchObject({
      rowIds: ['I-07'],
      suggestedOnly: false,
      evidence: 'delivered',
    })
    expect(ctl('DE.AE-02')).toMatchObject({ rowIds: ['I-03'], suggestedOnly: true })
    expect(ctl('DE.AE-02').evidence).toBe('observed')
    expect(ctl('RS.CO-02').evidence).toBe('observed')
    expect(ctl('RS.CO-02').references).toContain(
      'clock met: CIRCIA (proposed): Covered cyber incident report',
    )
    expect(ctl('GV.OC-01').evidence).toBe('none')
  })

  it('lists every clock with its deadline, filing and result, and cite keys', () => {
    expect(report.clocks).toEqual([
      expect.objectContaining({
        cite: 'K1',
        regulation: 'CIRCIA (proposed)',
        status: 'Proposed rule',
        clock: 'Covered cyber incident report',
        triggeredAt: '2026-03-12T10:00',
        dueAt: '2026-03-15T10:00',
        filedAt: '2026-03-12T11:00',
        result: 'met',
      }),
      expect.objectContaining({ cite: 'K2', clock: 'Ransom payment report', result: 'waiting' }),
    ])
    expect(report.disclaimer).toMatch(/not legal advice/)
  })

  it('shows a missed clock as a gap on the controls its regulation lists', () => {
    const late = buildCoverage({
      ...input,
      session: { ...session, clocks: {} },
      nowMin: 80 * 60,
    })
    const row = late.frameworks[0]!.rows.find((r) => r.controlId === 'RS.CO-02')!
    expect(row.gaps).toEqual(['clock not met: CIRCIA (proposed): Covered cyber incident report'])
    expect(late.clocks[0]!.result).toBe('overdue')
  })
})
