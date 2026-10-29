import { describe, expect, it } from 'vitest'
import { PersonasFile, type PersonasOutput } from '@shared/schemas'
import { fromSimcellScripts, guessKind, mergeGenerated, realNameProblem } from './personas'

const scripts = [
  {
    rolePlayed: 'Local TV reporter',
    trigger: 'After the first public statement',
    hardQuestions: ['Is anyone in danger?', 'Who is in charge?'],
    concessions: ['Hold the story for one hour if given a statement'],
  },
  { rolePlayed: 'Ransom email sender', trigger: 'At 1:00', hardQuestions: [], concessions: [] },
]

describe('personas from SimCell scripts', () => {
  it('makes one valid card per script, with the role as name and title', () => {
    const file = fromSimcellScripts({ simcellScripts: scripts })
    expect(PersonasFile.safeParse(file).success).toBe(true)
    expect(file.personas.map((p) => p.displayName)).toEqual([
      'Local TV reporter',
      'Ransom email sender',
    ])
    expect(file.personas[0]!.roleTitle).toBe('Local TV reporter')
  })

  it('carries hard questions and concessions over, with concessions still needing a condition', () => {
    const [first] = fromSimcellScripts({ simcellScripts: scripts }).personas
    expect(first!.hardQuestions).toEqual(['Is anyone in danger?', 'Who is in charge?'])
    expect(first!.concessions).toEqual([
      { id: 'c1', give: 'Hold the story for one hour if given a statement', onlyIf: '' },
    ])
    expect(first!.source).toEqual({ simcellScriptIndex: 0 })
  })

  it('guesses the kind from the role and defaults to other', () => {
    expect(guessKind('Local TV reporter')).toBe('reporter')
    expect(guessKind('Ransom email sender')).toBe('attacker')
    expect(guessKind('State regulator inspector')).toBe('regulator')
    expect(guessKind('Somebody')).toBe('other')
  })

  it('limits an attacker to not knowing how the attack was done', () => {
    const [, attacker] = fromSimcellScripts({ simcellScripts: scripts }).personas
    expect(attacker!.knowledge.doesNotKnow).toContain('How the attack was carried out')
  })
})

describe('filling cards from a model reply', () => {
  const out: PersonasOutput = {
    personas: [
      {
        scriptIndex: 0,
        displayName: 'Dana Whitlock',
        roleTitle: 'Reporter',
        organizationName: 'Harbor Ledger',
        organizationFictional: true,
        kind: 'reporter',
        register: 'plain-spoken',
        goals: ['Publish before the evening edition.'],
        deadlines: [
          { at: '1:30', wants: 'A statement.', ifMissed: 'Publishes without comment.' },
          { at: 'soon', wants: 'x', ifMissed: 'y' },
        ],
        escalationRules: [
          { whenKind: 'no_reply', minutes: 10, then: 'Calls again.' },
          { whenKind: 'time', at: 'later', then: 'dropped: not an exercise time' },
        ],
        knows: ['Delays are posted online.'],
        doesNotKnow: [],
        mustNotReveal: ['source name'],
        concessions: [{ give: 'Holds the story.', onlyIf: 'A statement with a next-update time.' }],
      },
      { ...({} as PersonasOutput['personas'][number]), scriptIndex: 9 },
    ],
  }

  it('keeps valid parts, drops malformed times, and assigns ids', () => {
    const file = mergeGenerated(out, { simcellScripts: scripts })
    expect(file.personas).toHaveLength(1)
    const card = file.personas[0]!
    expect(card.displayName).toBe('Dana Whitlock')
    expect(card.goals).toEqual([{ id: 'g1', text: 'Publish before the evening edition.' }])
    expect(card.deadlines.map((d) => d.id)).toEqual(['d1'])
    expect(card.escalationRules).toEqual([
      { id: 'r1', when: { kind: 'no_reply', minutes: 10 }, then: 'Calls again.' },
    ])
    expect(card.concessions[0]!.onlyIf).toContain('statement')
  })
})

describe('real names', () => {
  it('refuses a public office bound to a name', () => {
    expect(realNameProblem('Governor Ames', [])).toMatch(/public office/)
    expect(realNameProblem('Mayor Lopez', [])).toMatch(/fictional name/)
  })

  it('accepts a title alone and a fictional name', () => {
    expect(realNameProblem("the Governor's press secretary", [])).toBeUndefined()
    expect(realNameProblem('Dana Whitlock', [])).toBeUndefined()
  })

  it('refuses a name that matches an agency contact from the project facts', () => {
    const facts = ['Patricia Hollowell, Airport Security Coordinator']
    expect(realNameProblem('Patricia Hollowell, Airport Security Coordinator', facts)).toMatch(
      /agencies and contacts/,
    )
    expect(realNameProblem('Dana Whitlock', facts)).toBeUndefined()
  })
})
