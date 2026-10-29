import { describe, expect, it } from 'vitest'
import { channelLimit, runChecks } from './checks'
import { answer, reporter, SECRET } from './test-fixtures'
import type { PersonaChannel, SimcellDraftOutput } from '@shared/schemas'

const codes = (
  output: SimcellDraftOutput,
  channel: PersonaChannel = 'message',
  knownNames: string[] = ['Airport Operations Center', 'Incident Commander'],
) => runChecks({ output, card: reporter, channel, knownNames }).map((f) => f.code)

describe('draft checks', () => {
  it('passes a reply that cites its goal and deadline', () => {
    expect(codes(answer())).toEqual([])
  })

  it('flags text the character must never reveal, in any letter case', () => {
    expect(codes(answer({ text: `My source is ${SECRET.toUpperCase()}, ok?` }))).toContain(
      'MUST_NOT_REVEAL',
    )
  })

  it('flags a concession given without the players meeting its condition', () => {
    const given = answer({
      intent: 'concede',
      applied: { goals: ['g1'], deadlines: [], rules: [], concessions: ['c1'] },
    })
    expect(codes(given)).toContain('CONCESSION_UNMET')
    expect(
      codes({ ...given, concessionEvidence: 'Statement with next update at 2:30' }),
    ).not.toContain('CONCESSION_UNMET')
  })

  it('flags giving a concession away in the text without marking it applied', () => {
    expect(codes(answer({ text: 'Fine. Will hold the story for one hour.' }))).toContain(
      'CONCESSION_UNMET',
    )
  })

  it('flags an unknown concession id', () => {
    const out = answer({
      applied: { goals: ['g1'], deadlines: [], rules: [], concessions: ['c9'] },
      concessionEvidence: 'x',
    })
    expect(codes(out)).toContain('CONCESSION_UNMET')
  })

  it('flags agreeing with the players when nothing on the card supports it', () => {
    const agrees = answer({
      text: 'Sure, no problem, we will wait.',
      applied: { goals: [], deadlines: [], rules: [], concessions: [] },
    })
    expect(codes(agrees)).toContain('AGREEABLE_DRIFT')
    expect(codes({ ...agrees, applied: { ...agrees.applied, goals: ['g1'] } })).not.toContain(
      'AGREEABLE_DRIFT',
    )
  })

  it('flags a reply that breaks character', () => {
    expect(codes(answer({ text: 'As an AI I cannot say.' }))).toContain('BROKE_CHARACTER')
    expect(codes(answer({ text: 'This exercise is a simulation.' }))).toContain('BROKE_CHARACTER')
  })

  it('flags a person named in the reply who is not on the card, a role or a fact', () => {
    const stranger = answer({ text: 'Tell Officer Brandt we are waiting.' })
    expect(codes(stranger)).toContain('UNKNOWN_PERSON_NAME')
    expect(codes(stranger, 'message', ['Brandt'])).not.toContain('UNKNOWN_PERSON_NAME')
    expect(codes(answer({ text: 'This is Dana Whitlock again.' }))).not.toContain(
      'UNKNOWN_PERSON_NAME',
    )
  })

  it('flags a reply longer than the channel allows', () => {
    const long = answer({ text: 'x'.repeat(321) })
    expect(codes(long, 'sms')).toContain('TOO_LONG')
    expect(codes(long, 'message')).not.toContain('TOO_LONG')
    expect(codes(answer({ text: 'word '.repeat(151) }), 'call')).toContain('TOO_LONG')
  })

  it('says the model judged a rule that depends on what the players said', () => {
    const card = {
      ...reporter,
      escalationRules: [
        { id: 'r3', when: { kind: 'player_says' as const, text: 'denies' }, then: 'Escalates.' },
      ],
    }
    const out = answer({
      applied: { goals: ['g1'], deadlines: [], rules: ['r3'], concessions: [] },
    })
    const flags = runChecks({ output: out, card, channel: 'message', knownNames: [] })
    expect(flags.map((f) => f.code)).toContain('RULE_JUDGED_BY_MODEL')
  })

  it('uses 320 characters for text messages and 60 seconds for calls', () => {
    expect(channelLimit('sms')).toEqual({ chars: 320 })
    expect(channelLimit('call')).toEqual({ words: 150, seconds: 60 })
  })
})
