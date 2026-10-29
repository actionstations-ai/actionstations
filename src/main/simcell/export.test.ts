import { describe, expect, it } from 'vitest'
import { PersonaCard, PersonasFile } from '@shared/schemas'
import { assertPlayersOnly } from '../export/zip'
import { documentFileNames } from '../export/naming'
import { personasMarkdown } from './export'
import { reporter } from './test-fixtures'

describe('personas.md', () => {
  const md = personasMarkdown({ version: 1, personas: [reporter] }, 'Flight to Nowhere')

  it('lists what each card says, in plain headings', () => {
    expect(md).toContain('# Persona cards: Flight to Nowhere')
    expect(md).toContain('## Dana Whitlock')
    expect(md).toContain('Harbor Ledger (fictional)')
    expect(md).toContain('- Publish a first report before the evening edition.')
    expect(md).toContain('By 1:30: wants A written statement from the operator.')
    expect(md).toContain('When 10 minutes pass without a reply: Calls again and mentions a source.')
    expect(md).toContain('Only if: The players give a written statement')
    expect(md).toContain('### Must never reveal\n- the night-shift supervisor')
  })

  it('says for controllers only', () => {
    expect(md).toContain('For controllers and the SimCell only')
  })

  it('can never go to players/: the ZIP allow-list refuses it', () => {
    const names = documentFileNames('Flight to Nowhere', { scenarioNo: '1', scenarioId: 'scn' })
    expect(() =>
      assertPlayersOnly([{ source: '/tmp/personas.md', name: 'players/personas.md' }], names),
    ).toThrow(/Refusing to put facilitator material in players/)
  })
})

describe('persona schema', () => {
  it('has no free-text personality field and fills defaults', () => {
    const card = PersonaCard.parse({
      id: 'p1',
      displayName: 'Dana',
      organization: { name: '', fictional: true },
      kind: 'reporter',
      goals: [],
    })
    expect(Object.keys(card)).not.toContain('personality')
    expect(card.voice.postFx).toEqual(['phone'])
    expect(card.channels).toEqual(['message'])
  })

  it('limits register to a short style note and goals to five', () => {
    const base = {
      id: 'p1',
      displayName: 'Dana',
      organization: { name: '', fictional: true },
      kind: 'reporter',
    }
    expect(PersonaCard.safeParse({ ...base, register: 'x'.repeat(41), goals: [] }).success).toBe(
      false,
    )
    const goals = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, text: 'x' }))
    expect(PersonaCard.safeParse({ ...base, goals }).success).toBe(false)
  })

  it('rejects an escalation time that is not H:MM and an unknown kind', () => {
    const base = {
      id: 'p1',
      displayName: 'Dana',
      organization: { name: '', fictional: true },
      goals: [],
    }
    const rule = (when: unknown) => ({
      ...base,
      kind: 'reporter',
      escalationRules: [{ id: 'r1', when, then: 'x' }],
    })
    expect(PersonaCard.safeParse(rule({ kind: 'time', at: 'soon' })).success).toBe(false)
    expect(PersonaCard.safeParse({ ...base, kind: 'pirate' }).success).toBe(false)
    expect(PersonaCard.safeParse(rule({ kind: 'time', at: '1:30' })).success).toBe(true)
  })

  it('accepts a file with no cards, so a scenario without personas loads as before', () => {
    expect(PersonasFile.parse({})).toEqual({ version: 1, personas: [] })
  })
})
