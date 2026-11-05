// The governance format checks (spec 0459 FR-4), one pure function at a time, then through the
// field lint registry.
import { describe, expect, it } from 'vitest'
import { fieldLintIssues, fieldLintRuleIds } from '../lint-rules'
import {
  checkDecisionsDocumented,
  checkDisclosureMatchesWorksheet,
  checkExerciseAid,
  checkFictionalCompany,
  checkItem105Content,
  checkItem801NoMateriality,
  GOVERNANCE_LINT_RULES,
} from './lint'

const AID = 'Exercise aid, not legal advice. Check the current rule and your counsel.'

describe('exercise-aid line', () => {
  it('accepts the line and flags a missing or changed one', () => {
    expect(checkExerciseAid({ exerciseAid: AID })).toEqual([])
    expect(checkExerciseAid({})).toHaveLength(1)
    expect(checkExerciseAid({ exerciseAid: '   ' })).toHaveLength(1)
    expect(checkExerciseAid({ exerciseAid: 'For discussion only.' })[0]!.message).toMatch(
      /not legal advice/,
    )
  })
})

describe('fictional company', () => {
  it('accepts a fictional company', () => {
    expect(checkFictionalCompany({ company: 'Ardent Ridge Manufacturing, Inc.' })).toEqual([])
  })
  it('flags a well-known real issuer anywhere in the fields', () => {
    const issues = checkFictionalCompany({ body: { note: 'Like the Colonial Pipeline incident' } })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/Colonial Pipeline/)
  })
  it('flags a trading symbol', () => {
    expect(checkFictionalCompany({ company: 'Ardent Ridge (NYSE: ARDR)' })).toHaveLength(1)
    expect(checkFictionalCompany({ company: 'Ardent Ridge (Nasdaq - ARDR)' })).toHaveLength(1)
  })
})

describe('Item 1.05 content', () => {
  const full = {
    item: '1.05',
    nature: 'Ransomware.',
    scope: 'Two plants.',
    timing: 'Discovered October 22; determined October 23.',
    materialImpact: 'Reasonably likely to materially affect results.',
  }
  it('accepts a complete draft', () => {
    expect(checkItem105Content(full)).toEqual([])
  })
  it('names each missing statement', () => {
    const issues = checkItem105Content({ ...full, scope: '', materialImpact: ' ' })
    expect(issues.map((i) => i.path)).toEqual(['fields.scope', 'fields.materialImpact'])
  })
  it('flags text that says materiality was not determined', () => {
    const issues = checkItem105Content({
      ...full,
      materialImpact: 'The Company has not determined that the incident is material.',
    })
    expect(issues[0]!.message).toMatch(/Item 8\.01/)
  })
  it('ignores an Item 8.01 draft', () => {
    expect(checkItem105Content({ item: '8.01', nature: '' })).toEqual([])
  })
})

describe('Item 8.01 does not claim materiality', () => {
  it('accepts negated and conditional statements', () => {
    expect(
      checkItem801NoMateriality({
        item: '8.01',
        headline: 'Other Events',
        materialImpact:
          'The Company has not determined that the incident has had a material impact. It will file an Item 1.05 report if it determines the incident is material.',
      }),
    ).toEqual([])
  })
  it('flags a claim of materiality and a material-incident heading', () => {
    const issues = checkItem801NoMateriality({
      item: '8.01',
      headline: 'Material Cybersecurity Incidents',
      materialImpact: 'The incident is material to the Company.',
    })
    expect(issues.map((i) => i.path)).toEqual(['fields.headline', 'fields.materialImpact'])
  })
  it('ignores an Item 1.05 draft', () => {
    expect(checkItem801NoMateriality({ item: '1.05', materialImpact: 'It is material.' })).toEqual(
      [],
    )
  })
})

describe('decisions documented', () => {
  it('flags a log entry with no owner, basis or time', () => {
    const issues = checkDecisionsDocumented({
      entries: [
        { time: '10:05', decision: 'Material', decidedBy: 'Committee', basis: 'Worksheet' },
        { decision: 'Notify insurer', decidedBy: '', basis: '' },
      ],
    })
    expect(issues.map((i) => i.path)).toEqual([
      'fields.entries[1].decidedBy',
      'fields.entries[1].basis',
      'fields.entries[1].time',
    ])
  })
  it('requires a determination to carry owner, time and basis unless it is still open', () => {
    expect(checkDecisionsDocumented({ determination: 'not yet determined' })).toEqual([])
    expect(checkDecisionsDocumented({ determination: 'material' })).toHaveLength(3)
  })
  it('requires a ransom decision to carry owner and time unless pending', () => {
    expect(checkDecisionsDocumented({ decision: 'pending', options: [] })).toEqual([])
    expect(checkDecisionsDocumented({ decision: 'do not pay', options: [] })).toHaveLength(2)
  })
})

describe('disclosure against the worksheet', () => {
  const draft = { item: '1.05', timing: 'The committee determined on October 23, 2026.' }
  it('accepts an Item 1.05 draft that follows a material determination on the same day', () => {
    expect(
      checkDisclosureMatchesWorksheet(draft, {
        determination: 'material',
        determinedAt: 'October 23, 2026, 10:05 a.m.',
      }),
    ).toEqual([])
  })
  it('flags an Item 1.05 draft without a material determination', () => {
    const issues = checkDisclosureMatchesWorksheet(draft, { determination: 'not yet determined' })
    expect(issues[0]!.message).toMatch(/not yet determined/)
  })
  it('flags an Item 8.01 draft after a material determination', () => {
    expect(
      checkDisclosureMatchesWorksheet({ item: '8.01' }, { determination: 'material' }),
    ).toHaveLength(1)
  })
  it('flags a timing text that names another day', () => {
    const issues = checkDisclosureMatchesWorksheet(draft, {
      determination: 'material',
      determinedAt: 'October 24, 2026',
    })
    expect(issues[0]!.path).toBe('fields.timing')
  })
})

describe('registry', () => {
  it('registers every rule the toolkit names', () => {
    for (const id of GOVERNANCE_LINT_RULES) expect(fieldLintRuleIds()).toContain(id)
  })
  it('runs the rules on the types they read and not on others', () => {
    expect(
      fieldLintIssues('gov_disclosure_draft', { item: '1.05', exerciseAid: AID }).length,
    ).toBeGreaterThan(0)
    expect(fieldLintIssues('memo', { item: '1.05' })).toEqual([])
  })
})
