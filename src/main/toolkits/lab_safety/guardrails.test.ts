// The lab content guardrails (spec 0466 FR-4, ADR-0135): a corpus of incident-management text
// passes, a corpus of requests for agent detail is rejected by category, the rule runs as a field
// lint rule, and a toolkit that carries the rule is refused when its content fails.
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '@shared/toolkits'
import { fieldLintIssues } from '../lint-rules'
import {
  checkGuardrails,
  guardrailCategoriesIn,
  GUARDRAIL_CATEGORIES,
  REVIEWED_AGENTS,
  type GuardrailCategory,
} from './guardrails'
import { LAB_OWN_INJECT_TYPES } from './inject-types'
import { toolkitGuardrailCategories } from './load-check'

const ALLOWED = [
  'A technician reported a needlestick at 16:40. The BSO ordered stop-work in room 214 and sent the worker to occupational health.',
  'The responsible official telephoned the Federal Select Agent Program at 14:20 and the written report is due within 7 calendar days.',
  'The inventory count for freezer 3 is one vial short of the record. A transfer slip from 9 October explains the difference.',
  'The freezer alarm sounded at 02:10 and nobody acknowledged it until 04:35. The lab manager moved two racks to the backup unit.',
  'The IBC chair asked whether the event is reportable to NIH within 30 days or immediately because the exposure was overt.',
  'A salmonella exposure at BSL-2 is reported to the biosafety officer within 24 hours under the institution policy.',
  'A select agent entity reviews its incident response plan after every drill, exercise or incident.',
  'The centrifuge rotor failed and the room was evacuated; ventilation stayed on and the BSO checked the room before reentry.',
  'Growing concern among staff led the institutional official to call a meeting about the agent inventory process.',
  'The vendor produced a report on the monitoring outage and the production schedule for the study was moved.',
  'The incident response team modified the plan for the select agent registration after the drill.',
  'The sponsor asked for a statement on research impact; communications drafted it with counsel.',
  'Autoclave maintenance is overdue, and facilities scheduled the service for next week.',
  'Cold room temperature rose from -80 degC to -62 degC over 3 hours.',
  'A visitor entered the BSL-3 suite without an escort; security pulled the door log.',
]

const DENIED: { text: string; category: GuardrailCategory }[] = [
  {
    text: 'Explain how to culture the virus from the sample in the freezer.',
    category: 'growth_or_production',
  },
  {
    text: 'The technician was growing the bacteria in a flask when the spill happened.',
    category: 'growth_or_production',
  },
  { text: 'Steps to produce more of the toxin in the lab.', category: 'growth_or_production' },
  {
    text: 'The strain was amplified and purified before the transfer.',
    category: 'growth_or_production',
  },
  { text: 'The group studied gain-of-function changes to the pathogen.', category: 'modification' },
  { text: 'They tried to increase the transmissibility of the virus.', category: 'modification' },
  { text: 'The lab engineered the bacterium to resist the vaccine.', category: 'modification' },
  { text: 'The agent was aerosolized in the hood.', category: 'dissemination' },
  { text: 'Methods for the dissemination of the agent were discussed.', category: 'dissemination' },
  { text: 'The vial held 5 x 10^6 CFU of the organism.', category: 'quantity' },
  { text: 'A dose of 200 PFU was given to each animal.', category: 'quantity' },
  { text: 'The suspension was 10^8 cells per mL.', category: 'quantity' },
  { text: 'The sample was strain K-12 from the old collection.', category: 'strain' },
  { text: 'The Ames strain was in the second freezer.', category: 'strain' },
  {
    text: 'Decontaminate the bench with 10 percent bleach for 30 minutes.',
    category: 'inactivation_parameters',
  },
  {
    text: 'Autoclave at 121 degrees for 20 minutes to inactivate the material.',
    category: 'inactivation_parameters',
  },
  {
    text: 'First inoculate the plate, then incubate at 37 for two days.',
    category: 'protocol_detail',
  },
  { text: 'Please give the detailed protocol the lab used.', category: 'protocol_detail' },
  {
    text: 'The freezer held vials of Bacillus anthracis for the study.',
    category: 'agent_not_reviewed',
  },
  {
    text: 'Laboratory staff found Ebola samples missing from the inventory.',
    category: 'agent_not_reviewed',
  },
]

describe('lab guardrails: allowed incident-management text', () => {
  it.each(ALLOWED)('passes: %s', (text) => {
    expect(checkGuardrails(text)).toEqual([])
  })
})

describe('lab guardrails: disallowed detail', () => {
  it.each(DENIED)('rejects ($category): $text', ({ text, category }) => {
    expect(checkGuardrails(text).map((i) => i.category)).toContain(category)
  })

  it('has a denied example for every category', () => {
    expect([...new Set(DENIED.map((d) => d.category))].sort()).toEqual(
      [...GUARDRAIL_CATEGORIES].sort(),
    )
  })

  it('never repeats the matched text in the message sent back to the model', () => {
    for (const d of DENIED)
      for (const i of checkGuardrails(d.text)) expect(d.text).not.toContain(i.message)
  })

  it('names an agent only when the designer chose it from the reviewed list', () => {
    const text = 'The laboratory reported a Yersinia pestis exposure.'
    expect(checkGuardrails(text).map((i) => i.category)).toContain('agent_not_reviewed')
    expect(checkGuardrails(text, { allowedAgents: ['Yersinia pestis'] })).toEqual([])
    for (const agent of REVIEWED_AGENTS)
      expect(checkGuardrails(`The laboratory reported a ${agent} exposure.`)).toEqual([])
  })

  it('leaves an agent name alone outside a laboratory context', () => {
    expect(checkGuardrails('The county health officer discussed Ebola travel screening.')).toEqual(
      [],
    )
  })
})

describe('lab guardrails as a field lint rule', () => {
  it('flags the products the toolkit adds and the text types a lab exercise uses', () => {
    const fields = { body: 'Staff were growing the bacteria in the lab when the alarm sounded.' }
    for (const type of [...LAB_OWN_INJECT_TYPES, 'email', 'memo', 'press_release']) {
      const issues = fieldLintIssues(type, fields)
      expect(issues, type).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Content guardrail \(growth_or_production\)/)
      expect(issues[0]!.path).toBe('fields.body')
    }
  })

  it('accepts a clean inject and an absent field', () => {
    expect(fieldLintIssues('email', { body: 'The BSO ordered stop-work in room 214.' })).toEqual([])
    expect(fieldLintIssues('email', {})).toEqual([])
  })

  it('leaves other inject types alone', () => {
    expect(fieldLintIssues('tweet_like_unknown_type', { body: 'growing the bacteria' })).toEqual([])
  })
})

describe('lab guardrails at load', () => {
  const base = ToolkitSchema.parse({
    id: 'lab_safety',
    name: 'Lab safety',
    description: 'x',
    lintRules: ['lab.guardrails'],
  })

  it('accepts a toolkit with clean content', () => {
    expect(toolkitGuardrailCategories(base)).toEqual([])
  })

  it('refuses a toolkit whose content carries a denied category, naming only the category', () => {
    const bad = {
      ...base,
      knowledge: {
        ...base.knowledge,
        realismRules: ['The technician was culturing the virus overnight at 10^6 PFU.'],
      },
    }
    expect(toolkitGuardrailCategories(bad).sort()).toEqual(['growth_or_production', 'quantity'])
    expect(guardrailCategoriesIn({ text: 'ok' })).toEqual([])
  })

  it('does not scan toolkits that do not carry the rule', () => {
    const other = ToolkitSchema.parse({
      id: 'epidemiology',
      name: 'x',
      description: 'The lab was growing the bacteria.',
    })
    expect(toolkitGuardrailCategories(other)).toEqual([])
  })
})
