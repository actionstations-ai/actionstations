// Safeguards for synthetic media (spec 0467 FR-6): the flag, the markings and the check that a
// prompt never names or imitates a real person.
import { describe, expect, it } from 'vitest'
import {
  REAL_PERSON_NAMES,
  SYNTHETIC_FILE_PREFIX,
  SYNTHETIC_LABEL,
  isSyntheticAsset,
  isSyntheticInject,
  realPersonInBrief,
  realPersonReference,
  syntheticFileName,
  syntheticHeaderPage,
} from './synthetic-media'

describe('the flag', () => {
  it('is on only when set to true', () => {
    expect(isSyntheticInject({ syntheticMedia: true })).toBe(true)
    expect(isSyntheticInject({})).toBe(false)
    expect(isSyntheticInject({ syntheticMedia: false })).toBe(false)
    expect(isSyntheticAsset({ synthetic: true })).toBe(true)
    expect(isSyntheticAsset({})).toBe(false)
  })
})

describe('markings', () => {
  it('prefixes an exported file name once', () => {
    const name = syntheticFileName('S3-I04-voicemail.wav')
    expect(name).toBe(`${SYNTHETIC_FILE_PREFIX}S3-I04-voicemail.wav`)
    expect(syntheticFileName(name)).toBe(name)
  })

  it('writes a header page that says fictional, not for release and lists the files', () => {
    const page = syntheticHeaderPage(['media/EXERCISE-SYNTHETIC-a.wav'])
    expect(page.startsWith(SYNTHETIC_LABEL)).toBe(true)
    expect(page).toMatch(/fictional/)
    expect(page).toMatch(/excluded from pack exports/)
    expect(page).toMatch(/transcript/)
    expect(page).toContain('- media/EXERCISE-SYNTHETIC-a.wav')
  })
})

describe('real person check', () => {
  it('rejects a name on the maintained list, in any case and with accents folded', () => {
    expect(realPersonReference('A calm voice, like Elon Musk on a call')).toBe('Elon Musk')
    expect(realPersonReference('portrait of TAYLOR SWIFT at a podium')).toBe('Taylor Swift')
    expect(realPersonReference('Beyoncé backstage')).toBe('Beyonce')
  })

  it('rejects a likeness request that names any person', () => {
    expect(realPersonReference('a voice that sounds like Dana Whitlock')).toBe('Dana Whitlock')
    expect(realPersonReference('clone Marcus Hale reading the script')).toBe('Marcus Hale')
    expect(realPersonReference('in the style of Jane Roe')).toBe('Jane Roe')
  })

  it('accepts a description of a fictional person made from scratch', () => {
    expect(
      realPersonReference(
        'A man in his fifties, steady baritone, slight rasp, in a gray suit at a long table',
      ),
    ).toBeUndefined()
    expect(
      realPersonReference('The voice of the chief financial officer, tired and brisk'),
    ).toBeUndefined()
  })

  it('does not trip on a name that only contains a listed word', () => {
    expect(realPersonReference('Bill Gatesworth, a fictional clerk')).toBeUndefined()
  })

  it('checks every prompt of a brief, including voice lines', () => {
    expect(realPersonInBrief({ imagePrompt: 'an office, a monitor, a lanyard' })).toBeUndefined()
    expect(
      realPersonInBrief({
        voiceLines: [{ speaker: 'CFO', voiceStyle: 'brisk', text: 'This is Jeff Bezos.' }],
      }),
    ).toBe('Jeff Bezos')
    expect(realPersonInBrief({ soundNote: 'sounds like Pat Doe' })).toBe('Pat Doe')
  })

  it('keeps a list of names to maintain', () => {
    expect(REAL_PERSON_NAMES.length).toBeGreaterThan(25)
    expect(new Set(REAL_PERSON_NAMES).size).toBe(REAL_PERSON_NAMES.length)
  })
})
