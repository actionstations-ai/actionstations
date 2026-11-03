// The Mini's summary: "will work", "risky" or "won't work" with the reasons (#604). Pure.
//
// Won't work: a generation call failed (format, long prompt or long output: an unparsable,
// cut-off or timed-out reply), or the Mini score is under `riskyScore`.
// Risky: everything ran but something would hurt in practice: a low probe score, repair
// rounds, a looping handbook, a review that rewrites correct rows or finds little, or a model
// too slow for a 22K-token prompt.
// Will work: none of the above.

const GENERATION = [
  ['format', 'scenario overview'],
  ['longContext', 'MSEL phase on a long prompt'],
  ['longOutput', 'controller handbook'],
]

const pct = (n) => `${Math.round(n)}%`

/** Reasons the model will not work: failed generation calls and a very low score. */
function blockers(probes, score, t) {
  const out = []
  for (const [key, label] of GENERATION) {
    const p = probes[key]
    if (!p) out.push(`${label}: not run`)
    else if (!p.ok) out.push(p.reason)
  }
  if (!out.length && score < t.riskyScore) out.push(`Mini score ${score}, under ${t.riskyScore}`)
  return out
}

function reviewRisks(review, label, t) {
  if (!review) return []
  if (!review.ok) return [review.reason]
  const m = review.metrics
  const out = []
  if (m.damage >= t.criticDamageWarn)
    out.push(
      `${label} rewrites correct rows (${pct(m.damage)} damaged, warning at ${t.criticDamageWarn}%): ` +
        'turn the review step off or check its changes',
    )
  if (m.recall < t.reviewRecallWarn)
    out.push(
      `${label} finds ${pct(m.recall)} of planted defects (warning under ${t.reviewRecallWarn}%)`,
    )
  return out
}

function risks(probes, speed, score, t) {
  const out = []
  if (score < t.workScore) out.push(`Mini score ${score}, under ${t.workScore}`)
  for (const [key, label] of GENERATION) {
    const p = probes[key]
    if (p?.ok && p.metrics.repairAttempts >= t.repairWarn)
      out.push(`${label} needed ${p.metrics.repairAttempts} repair round(s)`)
  }
  const lo = probes.longOutput
  if (lo?.ok && lo.metrics.repetition >= t.repetitionWarn)
    out.push(
      `the handbook repeats itself (${pct(lo.metrics.repetition * 100)} of phrases repeated)`,
    )
  out.push(...reviewRisks(probes.review, 'The review', t))
  out.push(...reviewRisks(probes.heldOutReview, 'The held-out review', t))
  if (
    speed.outputTokensPerSecond !== undefined &&
    speed.outputTokensPerSecond < t.slowTokensPerSecond
  )
    out.push(`slow: ${speed.outputTokensPerSecond} output tokens per second`)
  if (speed.longPromptSeconds > t.slowLongPromptSeconds)
    out.push(
      `slow: ${Math.round(speed.longPromptSeconds)} s for a ${speed.longPromptTokens}-token prompt`,
    )
  return out
}

/** { level: 'will_work' | 'risky' | 'wont_work', reasons: string[] } */
export function verdictOf({ probes, speed, score, thresholds }) {
  const stop = blockers(probes, score, thresholds)
  if (stop.length) return { level: 'wont_work', reasons: stop }
  const flags = risks(probes, speed, score, thresholds)
  return flags.length
    ? { level: 'risky', reasons: flags }
    : { level: 'will_work', reasons: ['all probes ran, scored and timed within the limits'] }
}

export const LEVEL_LABEL = { will_work: 'Will work', risky: 'Risky', wont_work: "Won't work" }

/** The summary printed after a run and used in the spec's validation table. */
export function summaryMarkdown(run) {
  const { probes, speed, verdict } = run
  const row = (name, p) =>
    p
      ? `| ${name} | ${p.ok ? Math.round(p.score) : 'failed'} | ${p.seconds ?? ''} | ${p.note ?? ''} |`
      : null
  const lines = [
    `### ${run.model.ref} (Tabletop Mini Benchmark v${run.suiteVersion})`,
    '',
    `**${LEVEL_LABEL[verdict.level]}.** Mini score ${run.score}.`,
    ...verdict.reasons.map((r) => `- ${r}`),
    '',
    '| Probe | Score | Seconds | Notes |',
    '|---|---|---|---|',
    row('Format', probes.format),
    row('Long prompt', probes.longContext),
    row('Long output', probes.longOutput),
    row('Review', probes.review),
    row('Held-out review', probes.heldOutReview),
  ].filter((l) => l !== null)
  lines.push(
    '',
    `Speed: ${speed.outputTokensPerSecond ?? 'unknown'} output tokens per second` +
      (speed.longPromptTokens
        ? `; ${speed.longPromptTokens} prompt tokens took ${speed.longPromptSeconds} s`
        : '') +
      `; ${speed.totalSeconds} s of model time in all.`,
  )
  return lines.join('\n')
}
