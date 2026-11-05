// Safeguards for sensitive content (spec 0464 FR-13) as pure checks over text. They run on the
// injects of the types listed in register-lint.ts. Sources: Recommendations for Reporting on
// Suicide (SAVE with partner organizations, 2024) and the AFSP ethical reporting guidelines for
// the safe messaging points; FR-13(b) of the spec for the helpline and exercise-line rules.

export interface SafeguardProblem {
  message: string
}

const SUICIDE_TERMS =
  /\b(?:suicid\w*|self[- ]harm\w*|self[- ]injur\w*|overdos\w*|took (?:his|her|their) own life|end(?:ed|ing)? (?:his|her|their|my) life)\b/i

const METHOD_TERMS =
  /\b(?:hang(?:ed|ing)|noose|ligature|lethal (?:dose|means)|firearms?|guns?|pills?|tablets?|jump(?:ed|ing)? (?:from|off)|carbon monoxide|poison\w*|razor|slit\w*|wrists?|bridge|rooftop|railway|train tracks?|exhaust)\b/i

const SOLUTION_FRAMING =
  /\bsuicide\b(?! (?:prevention|awareness|hotline|line|lifeline|rates?|program))[^.]{0,40}\b(?:is|was|as) (?:a|the) (?:solution|answer|way out|escape|relief|release)\b|\b(?:solution|answer|way out|escape) (?:to|from) (?:his|her|their|the)? ?(?:pain|problems?|suffering)\b[^.]{0,30}\bsuicide\b/i

const PREFERRED_LANGUAGE: { pattern: RegExp; use: string }[] = [
  { pattern: /\bcommitted suicide\b/i, use: '"died by suicide"' },
  { pattern: /\bcompleted suicide\b/i, use: '"died by suicide"' },
  { pattern: /\bsuccessful(?:ly)? (?:suicide|attempt)\b/i, use: '"died by suicide"' },
  { pattern: /\bfailed (?:suicide|attempt)\b/i, use: '"survived an attempt"' },
  { pattern: /\bsuicide epidemic\b/i, use: 'a statement of the actual numbers' },
]

const SINGLE_CAUSE = /\b(?:died by suicide|took (?:his|her|their) own life)\b[^.]{0,20}\bbecause\b/i

/** Whether a method or means term sits within `window` characters of a suicide term. */
function methodNearSuicide(text: string, window = 140): boolean {
  const s = new RegExp(SUICIDE_TERMS.source, 'gi')
  for (let m = s.exec(text); m; m = s.exec(text)) {
    const from = Math.max(0, m.index - window)
    const near = text.slice(from, m.index + m[0].length + window)
    if (METHOD_TERMS.test(near)) return true
  }
  return false
}

/** Safe messaging checks (spec 0464 FR-13(a)) on one text. */
export function lintSafeMessaging(text: string): SafeguardProblem[] {
  const out: SafeguardProblem[] = []
  if (methodNearSuicide(text))
    out.push({
      message:
        'Names a method, means or place next to a suicide reference. Safe messaging leaves method and location detail out entirely.',
    })
  if (SOLUTION_FRAMING.test(text))
    out.push({ message: 'Presents suicide as a solution or an escape. Safe messaging never does.' })
  for (const { pattern, use } of PREFERRED_LANGUAGE)
    if (pattern.test(text))
      out.push({ message: `Uses language safe messaging avoids; write ${use} instead.` })
  if (SINGLE_CAUSE.test(text))
    out.push({
      message:
        'Gives one cause for a suicide. Safe messaging avoids simple explanations because suicide has many causes.',
    })
  return out
}

/** Real helpline numbers an exercise must not show without the EXERCISE banner. */
const HELPLINE_PATTERNS: RegExp[] = [
  /(?<![\d,.$#-])988(?![\d,%])/,
  /\b1[-. ]?800[-. ]?273[-. ]?(?:8255|TALK)\b/i,
  /\b741741\b/,
  /\b1[-. ]?800[-. ]?422[-. ]?4453\b/,
  /\b1[-. ]?800[-. ]?799[-. ]?(?:7233|SAFE)\b/i,
  /\b1[-. ]?800[-. ]?656[-. ]?4673\b/,
]

export function mentionsRealHelpline(text: string): boolean {
  return HELPLINE_PATTERNS.some((p) => p.test(text))
}

/** The word EXERCISE in capitals, as the banner and marking line print it. */
export function hasExerciseBanner(text: string): boolean {
  return /\bEXERCISE\b/.test(text)
}

/** FR-13(b): a public-facing text with a real helpline number must carry the EXERCISE banner. */
export function lintHelplineBanner(text: string): SafeguardProblem[] {
  if (!mentionsRealHelpline(text) || hasExerciseBanner(text)) return []
  return [
    {
      message:
        'Shows a real helpline number without an EXERCISE banner. Add the EXERCISE marking, or use a fictional 555 number.',
    },
  ]
}

const PLAYER_WORDS = String.raw`(?:players?|participants?|controllers?|evaluators?|facilitators?|observers?)`
const ASK_TO_CONTACT = new RegExp(
  String.raw`\b${PLAYER_WORDS}\b[^.]{0,80}\b(?:call|text|dial|phone|contact|ring)\b[^.]{0,40}(?:${HELPLINE_PATTERNS.map((p) => p.source).join('|')})`,
  'i',
)

/** FR-13(b): exercise materials never ask a player to contact a real line. */
export function lintNoRealLineForPlayers(text: string): SafeguardProblem[] {
  return ASK_TO_CONTACT.test(text)
    ? [
        {
          message:
            'Asks a player to contact a real helpline. Exercise materials use a fictional exercise line and never direct players to a real one.',
        },
      ]
    : []
}
