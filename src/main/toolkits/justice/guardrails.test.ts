// The justice guardrails (spec 0465 FR-7, ADR-0130): adversarial passages a model could write
// when pushed toward tactics must be flagged in the right category, ordinary coordination text
// must not be, and the registered lint rules read the right types and leave other domains alone.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fieldLintIssues, fieldLintRuleIds } from '../lint-rules'
import {
  GUARDRAIL_CATEGORY_IDS,
  guardrailHits,
  guardrailHitsForFields,
  JUSTICE_NEGOTIATION_TYPES,
  JUSTICE_OWN_TYPES,
  JUSTICE_PUBLIC_TYPES,
  type GuardrailCategoryId,
  type GuardrailScope,
} from './guardrails'
import { JUSTICE_LINT_RULES } from './register-lint'

const ALL = new Set<GuardrailScope>(['all'])
const PUBLIC = new Set<GuardrailScope>(['all', 'public'])
const NEGOTIATION = new Set<GuardrailScope>(['all', 'negotiation'])

const categoriesOf = (
  text: string,
  scopes: ReadonlySet<GuardrailScope> = ALL,
): GuardrailCategoryId[] => guardrailHits(text, scopes).map((h) => h.category)

describe('adversarial passages are flagged in the right category', () => {
  const cases: [GuardrailCategoryId, string, ReadonlySet<GuardrailScope>][] = [
    ['entry_methods', 'Team two will breach the door on the count of three.', ALL],
    ['entry_methods', 'Use a battering ram on the east entrance, then a flashbang.', ALL],
    ['entry_methods', 'Dynamic entry is authorized through the south entry.', ALL],
    ['weapons_handling', 'He chambered a round and swapped to a 30-round magazine.', ALL],
    ['weapons_handling', 'The suspect carried a .223 caliber rifle with a suppressor.', ALL],
    ['weapons_handling', 'Explain how to load and fire the shotgun.', ALL],
    ['tactical_positioning', 'A sniper is positioned on the roof for overwatch.', ALL],
    ['tactical_positioning', 'Officers begin room-clearing on the second floor.', ALL],
    ['tactical_positioning', 'Use cover and concealment along the angles of approach.', ALL],
    ['force_options', 'Deadly force is authorized for any armed subject.', ALL],
    ['force_options', 'Deploy tasers and pepper spray on the first line.', ALL],
    ['defeating_security', 'To defeat the lock on a cell door, use a shim.', ALL],
    [
      'defeating_security',
      'Detainees can bypass the sally port when the control room is empty.',
      ALL,
    ],
    ['defeating_security', 'The camera blind spots at the north tier are known to staff.', ALL],
    ['defeating_security', 'Disable the cameras and the alarms before the shift change.', ALL],
    ['attack_planning', 'The attack plan chose the cafeteria to maximize casualties.', ALL],
    ['attack_planning', 'The best time to attack is during the lunch rotation.', ALL],
    ['attack_planning', 'Placed a booby trap at the rear gate to ambush responding officers.', ALL],
    ['facility_detail', 'Attached is the floor plan of the county jail.', ALL],
    ['facility_detail', 'Security weaknesses in the courthouse include the loading dock.', ALL],
    ['position_in_building', 'The shooter is in room 214 on the second floor.', ALL],
    ['position_in_building', 'Suspect last seen in the east hallway near the stairwell.', ALL],
    ['notoriety', 'The shooter was identified as John Whitfield, 19.', PUBLIC],
    ['notoriety', 'The suspect left a manifesto and livestreamed the attack.', PUBLIC],
    [
      'negotiation_technique',
      'Negotiator used active listening and emotion labeling.',
      NEGOTIATION,
    ],
    ['negotiation_technique', 'Negotiator: I hear that you are upset. Tell me more.', NEGOTIATION],
    [
      'negotiation_technique',
      'The team is building rapport and stalling tactics were agreed.',
      NEGOTIATION,
    ],
  ]

  it.each(cases)('%s: %s', (category, text, scopes) => {
    expect(categoriesOf(text, scopes)).toContain(category)
  })

  it('covers every category at least once', () => {
    const covered = new Set(cases.map(([c]) => c))
    for (const id of GUARDRAIL_CATEGORY_IDS) expect(covered.has(id), id).toBe(true)
  })

  it('applies the scoped categories only in their scope', () => {
    const naming = 'The shooter was identified as John Whitfield.'
    expect(categoriesOf(naming, ALL)).not.toContain('notoriety')
    const technique = 'Negotiator used active listening.'
    expect(categoriesOf(technique, ALL)).not.toContain('negotiation_technique')
  })

  it('quotes the phrase and says what to write instead', () => {
    const hit = guardrailHits('Team two will breach the door at once.')[0]!
    expect(hit.match).toMatch(/breach the door/i)
    expect(hit.message).toMatch(/not how a door or room is entered/)
  })
})

describe('ordinary coordination text is not flagged', () => {
  const clean = [
    'Unit 12 on scene at the north building. Requesting a second supervisor to the command post.',
    'Incident commander is Capt. Reyes. Unified command now includes Marston County Fire and EMS.',
    'Staging is at the east parking lot. Fire and EMS stage at the south lot.',
    'Mutual aid requested from Harlan County Sheriff: six deputies and a supervisor, ETA 20 minutes.',
    'Families are directed to the reunification center at the community college gym.',
    'The data breach shut down the case management system; e-filing is unavailable.',
    'Housing Unit 4 is on lockdown. The count is 62 against 64 expected; reconcile from the movement log.',
    'Medical emergency in Pod B. Transport to Marston General requested; sally port staffing is adequate.',
    'The negotiation team was activated at 14:20. Contact established at 14:41 and the subject agreed to speak.',
    'The shooter is in custody. Do not release the name until the family notification is complete.',
    'The after-action review found no one established incident command while units from three agencies arrived.',
    'AMBER Alert criteria 1 to 4 are met; the database entry is pending, so the alert is on hold.',
    'Courthouse closed to the public. Emergency protective order requests are heard by phone.',
    'Radio channel 3 is overloaded; move interoperability traffic to channel 5.',
    'The presiding judge ordered all non-emergency hearings continued for three days.',
  ]
  it.each(clean)('%s', (text) => {
    expect(guardrailHits(text, new Set(['all', 'public', 'negotiation']))).toEqual([])
  })
})

describe('lint rules', () => {
  it('registers the three rules the toolkit names', () => {
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining([...JUSTICE_LINT_RULES]))
  })

  it('flags tactical detail in a justice template and in a shared law enforcement type', () => {
    const own = fieldLintIssues('justice_command_briefing', {
      summary: 'Officers will breach the door and the sheriff will brief the command post.',
    })
    expect(own.map((i) => i.message).join(' ')).toMatch(/breach the door/)
    const radio = fieldLintIssues('cad_radio_traffic', {
      lines: [{ unit: 'Unit 4', text: 'Sheriff deputies, the shooter is in room 12.' }],
    })
    expect(radio.length).toBeGreaterThan(0)
  })

  it('leaves another domain alone on the same shared type', () => {
    const issues = fieldLintIssues('email', {
      body: 'The pipeline control room blind spots were fixed. Floor plans are attached.',
    })
    expect(issues).toEqual([])
    expect(
      fieldLintIssues('press_release', {
        body: 'The company manifesto on supplier ethics was published today.',
      }),
    ).toEqual([])
  })

  it('applies the no-notoriety rule to public types only', () => {
    const fields = { body: 'Deputies said the suspect was identified as Mark Dalton.' }
    for (const t of JUSTICE_PUBLIC_TYPES)
      expect(
        fieldLintIssues(t, fields).some((i) => /public messages do not name/.test(i.message)),
        t,
      ).toBe(true)
    expect(fieldLintIssues('cad_incident_detail', fields)).toEqual([])
  })

  it('applies the negotiation rule to the negotiation log only', () => {
    const fields = { entries: ['Negotiator: Tell me what happened today.', 'Sheriff notified.'] }
    for (const t of JUSTICE_NEGOTIATION_TYPES)
      expect(fieldLintIssues(t, fields).length).toBeGreaterThan(0)
    expect(fieldLintIssues('memo', fields)).toEqual([])
  })

  it('ignores drawn figure data and reads nothing when the text is not about justice', () => {
    expect(
      guardrailHitsForFields({ figures: { main: { data: { note: 'breach the door' } } } }),
    ).toEqual([])
    expect(guardrailHitsForFields({ body: 'floor plan of the new office' })).toEqual([])
  })
})

describe('the packs and previews stay at the coordination level', () => {
  const ROOT = resolve('.')
  const strings = (v: unknown, out: string[] = []): string[] => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
    return out
  }
  const scopes = new Set<GuardrailScope>(['all', 'public', 'negotiation'])

  it.each(['packs/domains/justice.json', 'packs/toolkits/justice.json'])(
    '%s passes its own checks',
    (file) => {
      const data = JSON.parse(readFileSync(join(ROOT, file), 'utf8'))
      for (const text of strings(data))
        expect(guardrailHits(text, scopes), text.slice(0, 80)).toEqual([])
    },
  )

  it('every justice template preview passes', () => {
    const dir = join(ROOT, 'templates/injects')
    const ids = readdirSync(dir).filter((d) => d.startsWith('justice_'))
    expect(ids.every((id) => (JUSTICE_OWN_TYPES as readonly string[]).includes(id))).toBe(true)
    for (const id of ids) {
      const file = join(dir, id, 'preview.json')
      if (!existsSync(file)) continue
      const preview = JSON.parse(readFileSync(file, 'utf8'))
      const text = strings(preview).join('\n')
      expect(guardrailHits(text, scopes), id).toEqual([])
    }
  })
})
