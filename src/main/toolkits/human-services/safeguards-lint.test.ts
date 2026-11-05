// The behavioral health safeguards as pure checks (spec 0464 FR-13) and as registered rules.
import { describe, expect, it } from 'vitest'
import { fieldLintIssues } from '../lint-rules'
import {
  lintHelplineBanner,
  lintNoRealLineForPlayers,
  lintSafeMessaging,
  mentionsRealHelpline,
} from './safeguards-lint'

describe('safe messaging', () => {
  it('flags a method named beside a suicide reference', () => {
    const text = 'The caller said he planned suicide and described the pills he had saved.'
    expect(lintSafeMessaging(text).map((p) => p.message)[0]).toMatch(/method, means or place/)
  })

  it('accepts a shooting in the news next to a crisis line surge', () => {
    const text =
      'After the shooting downtown, 988 contacts doubled. Counselors reported many callers in grief.'
    expect(lintSafeMessaging(text)).toEqual([])
  })

  it('flags suicide presented as a solution or an escape', () => {
    expect(lintSafeMessaging('He saw suicide as the answer to his debts.').length).toBe(1)
    expect(lintSafeMessaging('The note said suicide was the escape.').length).toBe(1)
    expect(lintSafeMessaging('Suicide was a solution for him.').length).toBe(1)
    expect(lintSafeMessaging('Suicide prevention is a solution the county funds.')).toEqual([])
  })

  it.each(['committed suicide', 'a successful suicide', 'failed attempt', 'completed suicide'])(
    'asks for preferred language instead of "%s"',
    (phrase) => {
      expect(lintSafeMessaging(`Staff discussed a ${phrase} last year.`).length).toBeGreaterThan(0)
    },
  )

  it('accepts "died by suicide" and flags a single cause', () => {
    expect(lintSafeMessaging('A student died by suicide in March.')).toEqual([])
    expect(lintSafeMessaging('A student died by suicide because of exams.').length).toBe(1)
  })
})

describe('helpline banner and exercise lines', () => {
  it('recognizes real helpline numbers, not ordinary numbers', () => {
    expect(mentionsRealHelpline('Call or text 988 any time.')).toBe(true)
    expect(mentionsRealHelpline('Text HOME to 741741.')).toBe(true)
    expect(mentionsRealHelpline('1-800-273-8255')).toBe(true)
    expect(mentionsRealHelpline('There were 1,988 contacts and a fee of $988.')).toBe(false)
    expect(mentionsRealHelpline('Exercise line 555-0142')).toBe(false)
  })

  it('requires the EXERCISE banner next to a real number', () => {
    expect(lintHelplineBanner('Call or text 988.').length).toBe(1)
    expect(lintHelplineBanner('EXERCISE: call or text 988.')).toEqual([])
    expect(lintHelplineBanner('No number here.')).toEqual([])
  })

  it('flags telling a player to contact a real line', () => {
    expect(lintNoRealLineForPlayers('Players should call 988 to practice the script.').length).toBe(
      1,
    )
    expect(lintNoRealLineForPlayers('Participants will text 741741 to test.').length).toBe(1)
    expect(lintNoRealLineForPlayers('The public is told to call 988.')).toEqual([])
  })
})

describe('registered rules', () => {
  it('runs on a public post and on a handout', () => {
    const post = fieldLintIssues('tweet', { text: 'Feeling low? Call or text 988 today.' })
    expect(post.map((i) => i.message).join(' ')).toMatch(/EXERCISE banner/)
    const ok = fieldLintIssues('tweet', { text: 'EXERCISE. Feeling low? Call 555-0142.' })
    expect(ok).toEqual([])
  })

  it('reads nested fields and ignores drawn figure data', () => {
    const issues = fieldLintIssues('sitrep', {
      sections: [{ body: 'Staff discussed a committed suicide case.' }],
      figures: { x: { kind: 'bar', data: { label: 'committed suicide' } } },
    })
    expect(issues.length).toBe(1)
  })
})
