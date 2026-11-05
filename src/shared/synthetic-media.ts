// Safeguards for synthetic media injects (spec 0467 FR-6, ADR-0140). A deepfake-style voicemail,
// audio clip or video still in an exercise is scene content that a configured voice or video
// provider may produce, under these rules: voices and faces are fictional and never modeled on
// a real person; every item is marked as exercise material; items stay in the project; critical
// facts ride in template text. This module holds the pure parts: the flag, the markings and the
// check on prompts. Pure data and functions: no Node imports, so the renderer can use them.
import type { MediaAsset } from './schemas/media'

/** The mark every synthetic item carries in its metadata, packet and facilitator view. */
export const SYNTHETIC_LABEL = 'SYNTHETIC MEDIA · EXERCISE MATERIAL · NOT REAL'
/** Prefix of an exported synthetic file name. */
export const SYNTHETIC_FILE_PREFIX = 'EXERCISE-SYNTHETIC-'
/** The header page written beside exported synthetic media. */
export const SYNTHETIC_HEADER_FILE = '00-SYNTHETIC-EXERCISE-MEDIA.txt'

/** Whether an inject's generated voice, video or image is synthetic exercise media. */
export function isSyntheticInject(inject: { syntheticMedia?: boolean | undefined }): boolean {
  return inject.syntheticMedia === true
}

export const isSyntheticAsset = (asset: Pick<MediaAsset, 'synthetic'>): boolean =>
  asset.synthetic === true

/** An exported file name with the exercise marking. Idempotent. */
export function syntheticFileName(name: string): string {
  return name.startsWith(SYNTHETIC_FILE_PREFIX) ? name : `${SYNTHETIC_FILE_PREFIX}${name}`
}

/** The text of the header page: what the files are, and the rules they stay under. */
export function syntheticHeaderPage(files: readonly string[]): string {
  return [
    SYNTHETIC_LABEL,
    '',
    'The files listed below are synthetic media made for a tabletop exercise.',
    'Every voice and face in them is fictional. None is cloned from, or modeled on, a real person.',
    'Do not publish, post or forward them outside the exercise. They are excluded from pack exports.',
    'Amounts, account numbers and instructions are in the text products of the exercise, not in the audio.',
    'Each item has a transcript and a text description in the packet.',
    '',
    ...files.map((f) => `- ${f}`),
    '',
  ].join('\n')
}

/**
 * Well-known real people whose names must not appear in a synthetic media prompt. The list is
 * maintained by hand and is a floor, not a guarantee: the rule is that a prompt describes a
 * fictional person from scratch (age, build, voice quality), never a likeness of anyone.
 */
export const REAL_PERSON_NAMES: readonly string[] = [
  'Joe Biden',
  'Donald Trump',
  'Barack Obama',
  'Kamala Harris',
  'Vladimir Putin',
  'Xi Jinping',
  'Volodymyr Zelensky',
  'Emmanuel Macron',
  'Keir Starmer',
  'Rishi Sunak',
  'Narendra Modi',
  'Olaf Scholz',
  'Justin Trudeau',
  'Pope Francis',
  'King Charles',
  'Elon Musk',
  'Jeff Bezos',
  'Mark Zuckerberg',
  'Bill Gates',
  'Tim Cook',
  'Sundar Pichai',
  'Satya Nadella',
  'Sam Altman',
  'Jensen Huang',
  'Warren Buffett',
  'Jamie Dimon',
  'Jerome Powell',
  'Christine Lagarde',
  'Taylor Swift',
  'Tom Hanks',
  'Morgan Freeman',
  'Scarlett Johansson',
  'Oprah Winfrey',
  'Beyonce',
  'Kim Kardashian',
  'Cristiano Ronaldo',
  'Lionel Messi',
]

const LIKENESS_PHRASE =
  /\b(?:clone[ds]?|cloning|voice of|sounds? like|sounding like|looks? like|looking like|likeness of|face of|deepfake of|impersonat(?:e|es|ing)|in the style of)\s+(?:the\s+|real\s+)?([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+)+)/

const fold = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * What in `text` asks for a real person: a name from the maintained list, or a likeness phrase
 * ("sounds like", "voice of", "clone") followed by a person's name. Undefined when it is clean.
 */
export function realPersonReference(text: string): string | undefined {
  const folded = fold(text)
  for (const name of REAL_PERSON_NAMES) {
    const re = new RegExp(`\\b${fold(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (re.test(folded)) return name
  }
  return LIKENESS_PHRASE.exec(text)?.[1]
}

/** The prompt texts of a media brief that a provider would receive. */
export function briefPromptTexts(brief: {
  imagePrompt?: string | undefined
  videoPrompt?: string | undefined
  soundNote?: string | undefined
  voiceLines?: { speaker: string; voiceStyle: string; text: string }[] | undefined
}): string[] {
  return [
    brief.imagePrompt,
    brief.videoPrompt,
    brief.soundNote,
    ...(brief.voiceLines ?? []).flatMap((l) => [l.speaker, l.voiceStyle, l.text]),
  ].filter((t): t is string => typeof t === 'string' && t.length > 0)
}

/** The first real-person reference in a brief's prompts, if any. */
export function realPersonInBrief(
  brief: Parameters<typeof briefPromptTexts>[0],
): string | undefined {
  for (const t of briefPromptTexts(brief)) {
    const hit = realPersonReference(t)
    if (hit) return hit
  }
  return undefined
}
