// Lints for a draft that ends early or wanders off the brief (#364): a row that ends the
// exercise by its content ("ENDEX:", "the exercise is concluded", "the hot wash begins", an
// endex_card) with rows after it, whatever its tag; a brief whose named identifiers (plan
// steps, systems, places: CIRP-4, V-2418, HUSD-VPN01) mostly never appear in the MSEL; and a
// ransomware story in an MSEL whose brief never mentions ransomware. Pure; lint.ts adds them.
import type { LintWarning, MselRow, Scenario } from '@shared/schemas'

export const ENDEX_EARLY = 'ENDEX_EARLY'
export const BRIEF_IDS_MISSING = 'BRIEF_IDS_MISSING'
export const BRIEF_THREAT_ADDED = 'BRIEF_THREAT_ADDED'

type W = LintWarning
const warn = (code: string, message: string, extra: Partial<W>): W => ({
  code,
  severity: 'warning',
  message,
  source: 'lint',
  ...extra,
})

// ---- ENDEX by content --------------------------------------------------------------------

/** Wording that ends the exercise. "Before ENDEX" or "by the end of the exercise" does not. */
const ENDS_EXERCISE = [
  /^\W*(?:[\p{L} ]{0,20}:\s*)?ENDEX\b/iu,
  /\bENDEX\s*[:—–]/i,
  /\bENDEX (?:is |has been )?(?:called|declared)\b/i,
  /\b(?:the |this )?exercise (?:is|has) (?:now )?(?:concluded|over|ended|complete|completed|finished)\b/i,
  /\b(?:this|that) concludes (?:the|this|our|today's|today’s) exercise\b/i,
  /^\W*end of (?:the )?exercise\b/i,
  /\b(?:this is|marks|signals) the end of (?:the )?exercise\b/i,
  /\b(?:the )?hot ?wash (?:now )?(?:begins|starts|will (?:now )?begin|is next)\b/i,
  /\b(?:begin|start|move|proceed|transition)(?:s|ing)? (?:in)?to (?:the )?hot ?wash\b/i,
  /\b(?:begin|start)(?:s|ing)? the hot ?wash\b/i,
]

export const endsExercise = (row: Pick<MselRow, 'event' | 'format'>): boolean =>
  row.format === 'endex_card' || ENDS_EXERCISE.some((re) => re.test(row.event))

/**
 * A row before the last that ends the exercise by its content, under another tag: everything
 * after it is played after ENDEX. A row tagged ENDEX is ENDEX_LAST's; STARTEX states the plan.
 */
function lintEarlyEndex(s: Scenario): W[] {
  const last = s.msel.length - 1
  return s.msel.flatMap((row, i): W[] => {
    if (i === last || row.purposeTag === 'ENDEX' || row.purposeTag === 'STARTEX') return []
    if (!endsExercise(row)) return []
    const after = s.msel.length - i - 1
    return [
      warn(
        ENDEX_EARLY,
        `Row ${row.id} (${row.time}, ${row.purposeTag}) ends the exercise, but ${after} row(s) up to ${s.msel[last]!.time} come after it`,
        {
          rowId: row.id,
          suggestion:
            'Rewrite it as an inject that moves the story on (a resolution step, a last demand) and keep the end of the exercise and the hot wash for the ENDEX row at the end',
        },
      ),
    ]
  })
}

// ---- drift from the brief ----------------------------------------------------------------

/** Plan steps, systems and places with an id: CIRP-4, V-2418, HUSD-VPN01, ZS-612, RP-1. */
const IDENT = /(?<![\w-])(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]+(?:-[A-Z0-9]+)+(?![\w-])/g
/** The brief names this many identifiers before the check applies. */
export const MIN_BRIEF_IDS = 4

const briefText = (s: Scenario): string =>
  [s.brief?.userPrompt ?? '', ...(s.brief?.constraints ?? [])].join('\n')

const mselText = (s: Scenario): string =>
  s.msel
    .map((r) =>
      [r.event, r.expectedAction, ...r.citations.map((c) => JSON.stringify(c))].join('\n'),
    )
    .join('\n')

/**
 * The brief names at least four identifiers and the MSEL uses fewer than half of them: the
 * draft tells another story than the one asked for (a vendor-laptop PLC attack for a
 * ransomware brief, a ransomware attack for a main break).
 */
function lintBriefIds(s: Scenario): W[] {
  const ids = [...new Set([...briefText(s).matchAll(IDENT)].map((m) => m[0]))]
  if (ids.length < MIN_BRIEF_IDS) return []
  const msel = mselText(s)
  const missing = ids.filter((id) => !msel.includes(id))
  if (missing.length * 2 <= ids.length) return []
  const shown = missing.slice(0, 8).join(', ') + (missing.length > 8 ? ', …' : '')
  return [
    warn(
      BRIEF_IDS_MISSING,
      `The MSEL never mentions ${missing.length} of the ${ids.length} plan steps, systems and places the brief names (${shown})`,
      {
        suggestion:
          'Build the story the brief describes, on its systems, places and plan steps; regenerate the MSEL or rewrite the rows that drifted',
      },
    ),
  ]
}

const RANSOM = /\bransom(?:ware| note| demand|ed)?\b/i
/** Rows that may carry a rumour or a false lead without changing the story. */
const ASIDE = new Set<MselRow['purposeTag']>([
  'NOISE',
  'RED_HERRING',
  'MISINFORMATION',
  'DISTRACTION',
])

/** A ransomware attack the brief never asked for (a main break turned into a cyber attack). */
function lintThreatAdded(s: Scenario): W[] {
  if (RANSOM.test(`${s.title}\n${briefText(s)}`)) return []
  const row = s.msel.find((r) => !ASIDE.has(r.purposeTag) && RANSOM.test(r.event))
  if (!row) return []
  return [
    warn(
      BRIEF_THREAT_ADDED,
      `Row ${row.id} brings ransomware into the story, which the brief never mentions`,
      {
        rowId: row.id,
        suggestion:
          'Keep the incident the brief describes; rewrite the row around it, or put ransomware in the brief if the designer wants it',
      },
    ),
  ]
}

/** Every drift lint. */
export function lintDrift(s: Scenario): LintWarning[] {
  return [...lintEarlyEndex(s), ...lintBriefIds(s), ...lintThreatAdded(s)]
}
