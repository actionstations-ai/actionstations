import { describe, expect, it } from 'vitest'
import type { MselRow } from '@shared/schemas'
import { docsInScope, isControllerOnlyRow } from './scope'
import { effectiveGlossary, flagText, glossaryFlags } from './glossary'

const roles = [
  { id: 'pio', name: 'Public Information Officer', abbreviation: 'PIO', team: '' },
  { id: 'sim', name: 'SimCell', abbreviation: '', team: '' },
  { id: 'ctl', name: 'Exercise Controller', abbreviation: 'EC', team: 'Control' },
]
const scenario = { roles } as never

const row = (over: Partial<MselRow>): MselRow =>
  ({
    id: 'I-01',
    toRoleIds: [],
    purposeTag: 'CORE_NARRATIVE',
    ...over,
  }) as MselRow

describe('translation scope (spec 0435 FR-2)', () => {
  it('skips rows only controllers or the SimCell receive', () => {
    expect(isControllerOnlyRow(row({ toRoleIds: ['sim'] }), scenario)).toBe(true)
    expect(isControllerOnlyRow(row({ toRoleIds: ['sim', 'ctl'] }), scenario)).toBe(true)
    expect(isControllerOnlyRow(row({ toLabel: 'Controllers' }), scenario)).toBe(true)
  })

  it('keeps rows that reach any player', () => {
    expect(isControllerOnlyRow(row({ toRoleIds: ['pio'] }), scenario)).toBe(false)
    expect(isControllerOnlyRow(row({ toRoleIds: ['pio', 'sim'] }), scenario)).toBe(false)
    expect(isControllerOnlyRow(row({ toLabel: 'All' }), scenario)).toBe(false)
    expect(isControllerOnlyRow(row({}), scenario)).toBe(false)
  })

  it('skips rows that only run the clock', () => {
    expect(isControllerOnlyRow(row({ purposeTag: 'STARTEX' }), scenario)).toBe(true)
    expect(isControllerOnlyRow(row({ purposeTag: 'TIME_JUMP' }), scenario)).toBe(true)
  })

  it('translates controller documents only when the scenario asks', () => {
    expect(docsInScope({})).toEqual(['briefing', 'handouts'])
    expect(docsInScope({ languages: { player: ['es'], controller: false } })).toEqual([
      'briefing',
      'handouts',
    ])
    expect(docsInScope({ languages: { player: ['es'], controller: true } })).toEqual([
      'briefing',
      'handouts',
      'handbook',
      'controller_handouts',
    ])
  })
})

describe('glossary (spec 0435 FR-8)', () => {
  it('starts with the exercise marking and lets the project replace a term', () => {
    expect(effectiveGlossary('es', undefined)).toEqual([
      { term: 'EXERCISE', translation: 'EJERCICIO' },
    ])
    expect(
      effectiveGlossary('es', { es: [{ term: 'exercise', translation: 'SIMULACRO' }] }),
    ).toEqual([{ term: 'exercise', translation: 'SIMULACRO' }])
  })

  it('flags a translation that leaves out a fixed term the English uses', () => {
    const entries = [
      { term: 'boil water advisory', translation: 'aviso de hervir el agua' },
      { term: 'Zone 3', translation: 'Zona 3' },
    ]
    const flags = glossaryFlags(
      'A Boil Water Advisory covers Zone 3.',
      'Un aviso para la Zona 3.',
      entries,
    )
    expect(flags.map(flagText)).toEqual([
      'Expected "aviso de hervir el agua" for "boil water advisory"',
    ])
  })

  it('matches whole words only and ignores terms the English does not have', () => {
    const entries = [{ term: 'EXERCISE', translation: 'EJERCICIO' }]
    expect(glossaryFlags('Exercises are fun', 'Los ejercicios', entries)).toEqual([])
    expect(glossaryFlags('EXERCISE EXERCISE', 'EJERCICIO EJERCICIO', entries)).toEqual([])
  })
})
