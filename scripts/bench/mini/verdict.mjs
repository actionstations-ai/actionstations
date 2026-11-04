// The Mini's verdict: a band from stated requirements (#606). Pure.
//
// The bands are requirements, written in the methods, not calibrated against any other
// benchmark (bench/suites/mini.json, `bands`):
//   Recommended          completion >= 90%, quality >= 80 and review damage <= 5%
//   Usable with editing  completion >= 75% and quality >= 60
//   Not recommended      otherwise
// A slow draft time is reported, never a failure. Completion is the chance that a full
// scenario drafts with no failed stage, so it falls fast: with 14 model calls in a scenario,
// 98% of calls succeeding first time is 75%, and one failure in eight Mini calls is 15%.
// The band is judged on the reported figures. When the range over the two repeats reaches into
// another band, the band is marked uncertain and the verdict lists every band the range reaches
// (`uncertain`, `reaches`; #613). No extra run is made to settle it.
// The failure evidence ("1 failure in 10 calls") is shown beside every completion figure (#614);
// no extra call is made for a model with a single failure.

export const LEVELS = ['recommended', 'usable', 'not_recommended']
export const LEVEL_LABEL = {
  recommended: 'Recommended',
  usable: 'Usable with editing',
  not_recommended: 'Not recommended',
}

// A figure printed next to the threshold it misses must not round across it (#611): "Quality 80,
// under 80" was 79.6. One decimal, cut toward the threshold side, so a miss never reads as a tie.
const tenth = (n) => Number((n * 10).toFixed(6))
export const shortOf = (n) => (Math.floor(tenth(n)) / 10).toFixed(1)
export const overBy = (n) => (Math.ceil(tenth(n)) / 10).toFixed(1)

/** The band for one set of figures (completion and quality in 0..100, damage in percent). */
export function bandOf({ completion, quality, damage }, bands) {
  const r = bands.recommended
  if (completion >= r.completion && quality >= r.quality && (damage ?? 0) <= r.damage)
    return 'recommended'
  const u = bands.usable
  if (completion >= u.completion && quality >= u.quality) return 'usable'
  return 'not_recommended'
}

/** The observed count behind completion, e.g. "1 failure in 10 calls". */
export function failureEvidence(result) {
  const n = result.failedCalls
  return `${n} failure${n === 1 ? '' : 's'} in ${result.calls} call${result.calls === 1 ? '' : 's'}`
}

/** Why the figures fall short of the next band up, in plain words. */
function shortfalls({ completion, quality, damage }, level, bands, evidence) {
  const out = []
  const target = level === 'usable' ? bands.recommended : bands.usable
  if (level === 'recommended') return out
  if (completion < target.completion)
    out.push(
      `Completion ${shortOf(completion)}% (${evidence}): the chance a full scenario drafts with no failed stage is under ${target.completion}%`,
    )
  if (quality < target.quality) out.push(`Quality ${shortOf(quality)}, under ${target.quality}`)
  if (level === 'usable' && damage !== undefined && damage > bands.recommended.damage)
    out.push(
      `Review damage ${overBy(damage)}%, over ${bands.recommended.damage}%: turn the review step off or check its changes`,
    )
  return out
}

/** One line per failed call: what happened, with the raw tail of a stall or a loop. */
function callNotes(repeats) {
  return repeats.flatMap((r, i) =>
    (r.failures ?? []).map((f) => {
      const run = repeats.length > 1 ? ` (run ${i + 1})` : ''
      if (f.failure) {
        const tail = f.failure.tail ? ` Last output: "${f.failure.tail.slice(-120)}"` : ''
        return `${f.probe}${run}: ${f.failure.kind}: ${f.failure.detail}.${tail}`
      }
      return `${f.probe}${run}: failed`
    }),
  )
}

const corner = (range, pick) => (range ? range[pick] : undefined)

/**
 * { level, reasons, notes, uncertain?, reaches? }. `result` is miniResult(); `repeats` the
 * per-repeat results (for the call notes). `uncertain` lists the other bands the ranges reach and
 * `reaches` every band the ranges reach, best first, the reported one included.
 */
export function verdictOf({ result, repeats = [], bands }) {
  const at = (pick, damagePick) => ({
    completion: corner(result.completion, pick),
    quality: corner(result.quality, pick),
    damage: corner(result.damage, damagePick),
  })
  const level = bandOf(
    {
      completion: result.completion.value,
      quality: result.quality?.value ?? 0,
      damage: result.damage?.value,
    },
    bands,
  )
  const worst = bandOf(at('min', 'max'), bands)
  const best = bandOf(at('max', 'min'), bands)
  const reasons = shortfalls(
    {
      completion: result.completion.value,
      quality: result.quality?.value ?? 0,
      damage: result.damage?.value,
    },
    level,
    bands,
    failureEvidence(result),
  )
  if (level === 'recommended')
    reasons.push('Completion, quality and review damage all meet the bands')
  const uncertain = [worst, best].filter((l) => l !== level)
  return {
    level,
    reasons,
    notes: callNotes(repeats),
    ...(uncertain.length
      ? {
          uncertain: [...new Set(uncertain)],
          reaches: LEVELS.filter((l) => l === level || uncertain.includes(l)),
        }
      : {}),
  }
}

const range = (r, unit = '') =>
  r
    ? r.min === r.max
      ? `${r.value}${unit}`
      : `${r.value}${unit} (${r.min} to ${r.max})`
    : 'not measured'

/** The summary printed after a run. */
export function summaryMarkdown(run) {
  const { result, verdict } = run
  const lines = [
    `### ${run.model.ref} (Tabletop Mini Benchmark v${run.suiteVersion})`,
    '',
    `**${LEVEL_LABEL[verdict.level]}${verdict.uncertain ? ' (uncertain)' : ''}.** Mini score ${range(result.score)} = Quality ${range(result.quality)} x Completion ${range(result.completion, '%')} (${failureEvidence(result)}).`,
    ...verdict.reasons.map((r) => `- ${r}`),
    ...(verdict.uncertain
      ? [
          `- Band uncertain: the range over the two runs reaches ${(verdict.reaches ?? verdict.uncertain).map((l) => LEVEL_LABEL[l]).join(', ')}. Two runs do not settle which applies; the reported band follows the averaged figures.`,
        ]
      : []),
    ...verdict.notes.map((n) => `- ${n}`),
    '',
    `Completion rests on ${failureEvidence(result)} (per-call success ${range(result.perCallRate, '%')}, raised to the 14 calls of a scenario).${result.failedCalls === 1 ? ` A single failure is one call in ${result.calls}, and completion reads it as that rate at every stage of a scenario.` : ''} About ten calls detect frequent failures, not rare ones.`,
    `Repair rate ${range(result.repairRate, '%')} (calls that needed a repair round or a longer-answer retry; not a failure).`,
    `Review damage ${range(result.damage, '%')}.`,
    `Draft time ${range(result.draftMinutes, ' min')} for a full scenario on this hardware` +
      (result.outputTokensPerSecond
        ? ` (at least ${range(result.outputTokensPerSecond)} output tokens/s and ${range(result.promptTokensPerSecond)} prompt tokens/s)`
        : '') +
      '. Reported, never scored.',
  ]
  return lines.join('\n')
}
