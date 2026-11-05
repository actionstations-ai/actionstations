// ai_detector_scores (spec 0467 FR-5, FR-6e): the distribution of a deepfake detector's scores
// for authentic and synthetic items, with the decision threshold, the score reported for the
// item in question with its stated uncertainty, and the false positive and false negative
// counts. The two classes overlap, which is the point: a detector can be wrong. The score is
// always written in words as well as numbers.
import { scaleBand, scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { AXIS, GRID, INK, MUTED, seriesStyle } from '../theme'
import { fmt, frame, hashId, heading, legend, n, patternDef, text, wrap } from '../svg'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

const Bin = z.object({
  from: z.number().min(0).max(1),
  to: z.number().min(0).max(1),
  authentic: z.number().int().min(0).max(1_000_000),
  synthetic: z.number().int().min(0).max(1_000_000),
})

export const AiDetectorScoresData = z
  .object({
    title: z.string().max(200).optional(),
    bins: z.array(Bin).min(2).max(20),
    /** Scores at or above this are flagged as synthetic. Must be a bin edge. */
    threshold: z.number().min(0).max(1),
    /** The score of the item under review, with its stated uncertainty (plus or minus). */
    reported: z
      .object({
        score: z.number().min(0).max(1),
        uncertainty: z.number().min(0).max(1),
        label: z.string().min(1).max(80).default('Item under review'),
      })
      .optional(),
    simulated: z.boolean().default(true),
  })
  .refine((d) => d.bins.every((b) => b.to > b.from), { message: 'a bin must end after it starts' })
  .refine((d) => d.bins.every((b, i) => i === 0 || Math.abs(b.from - d.bins[i - 1]!.to) < 1e-9), {
    message: 'bins must be contiguous and in order',
  })
  .refine((d) => d.bins.some((b) => Math.abs(b.from - d.threshold) < 1e-9), {
    message: 'the threshold must be the lower edge of a bin',
  })
export type AiDetectorScoresData = z.infer<typeof AiDetectorScoresData>

const M = { left: 58, right: 20, bottom: 58 }
const pct = (v: number): string => `${Math.round(v * 100)}%`

export interface DetectorTally {
  authentic: number
  synthetic: number
  falsePositives: number
  falseNegatives: number
}

/** Counts at the threshold: authentic items flagged, and synthetic items passed as authentic. */
export function detectorTally(d: AiDetectorScoresData): DetectorTally {
  let falsePositives = 0
  let falseNegatives = 0
  let authentic = 0
  let synthetic = 0
  for (const b of d.bins) {
    authentic += b.authentic
    synthetic += b.synthetic
    if (b.from >= d.threshold - 1e-9) falsePositives += b.authentic
    else falseNegatives += b.synthetic
  }
  return { authentic, synthetic, falsePositives, falseNegatives }
}

/** The reported score in words, always with the number and the uncertainty. */
export function scoreInWords(score: number, uncertainty: number, threshold: number): string {
  const side = score >= threshold ? 'above' : 'below'
  const lean = score >= threshold ? 'leans synthetic' : 'leans authentic'
  const closeness = Math.abs(score - threshold) <= uncertainty ? 'within its uncertainty of' : side
  return `score ${score.toFixed(2)} plus or minus ${uncertainty.toFixed(2)}, ${closeness} the threshold of ${threshold.toFixed(2)}; ${lean}, and a detector can be wrong`
}

function render(d: AiDetectorScoresData, o: FigureOptions): FigureResult {
  const t = detectorTally(d)
  const id = hashId(JSON.stringify(d))
  const defs = [0, 1].map((i) => patternDef(`p${id}-${i}`, seriesStyle(i))).join('')
  const top = (d.title ? 42 : 14) + 26
  const plotH = o.height - top - M.bottom - 44
  const plotR = o.width - M.right
  const labels = d.bins.map((b) => `${b.from.toFixed(1)}`)
  const max = Math.max(1, ...d.bins.flatMap((b) => [b.authentic, b.synthetic]))
  const y = scaleLinear()
    .domain([0, max])
    .nice()
    .range([top + plotH, top])
  const band = scaleBand<string>().domain(labels).range([M.left, plotR]).padding(0.2)
  const inner = scaleBand<string>().domain(['a', 's']).range([0, band.bandwidth()]).padding(0.08)

  const lg = legend(
    [
      ['Authentic items', 0],
      ['Synthetic items', 1],
    ].map(([name, i]) => ({
      name: name as string,
      swatch: (x: number, yy: number) =>
        `<rect x="${n(x)}" y="${n(yy - 7)}" width="26" height="14" fill="url(#p${id}-${i})" stroke="${INK}" stroke-width="0.8"/>`,
    })),
    M.left,
    d.title ? 42 : 14,
    plotR,
  )
  let body = heading(d.title, M.left) + lg.svg
  for (const tick of y.ticks(5)) {
    const py = y(tick)
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(py)}" y2="${n(py)}" stroke="${GRID}"/>`
    body += text(M.left - 8, py + 4, fmt(tick), { size: 11, anchor: 'end', fill: MUTED })
  }
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(top + plotH)}" y2="${n(top + plotH)}" stroke="${AXIS}" stroke-width="1.5"/>`
  d.bins.forEach((b, i) => {
    const x0 = band(labels[i]!)!
    for (const [key, count, k] of [
      ['a', b.authentic, 0],
      ['s', b.synthetic, 1],
    ] as const) {
      const bx = x0 + inner(key)!
      const h = top + plotH - y(count)
      body += `<rect x="${n(bx)}" y="${n(y(count))}" width="${n(inner.bandwidth())}" height="${n(h)}" fill="url(#p${id}-${k})"/>`
    }
    body += text(x0 + band.bandwidth() / 2, top + plotH + 16, b.from.toFixed(1), {
      size: 11,
      anchor: 'middle',
    })
  })
  body += text(
    (M.left + plotR) / 2,
    top + plotH + 34,
    'Detector score (0 = authentic, 1 = synthetic)',
    {
      size: 12,
      anchor: 'middle',
      fill: MUTED,
    },
  )
  const firstAtThreshold = labels[d.bins.findIndex((b) => Math.abs(b.from - d.threshold) < 1e-9)]!
  const tx = band(firstAtThreshold)! - (band.step() - band.bandwidth()) / 2
  body += `<line x1="${n(tx)}" x2="${n(tx)}" y1="${n(top)}" y2="${n(top + plotH)}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="3 3"/>`
  body += text(tx + 4, top + 12, `Threshold ${d.threshold.toFixed(2)}`, { size: 11, weight: 600 })

  let line = top + plotH + 54
  const counts = `At the threshold: ${t.falsePositives} of ${t.authentic} authentic items flagged (false positives), ${t.falseNegatives} of ${t.synthetic} synthetic items passed (false negatives).`
  for (const l of wrap(counts, Math.floor((plotR - M.left) / 6.4), 2)) {
    body += text(M.left, line, l, { size: 12 })
    line += 15
  }
  let reportedText = ''
  if (d.reported) {
    reportedText = `${d.reported.label}: ${scoreInWords(d.reported.score, d.reported.uncertainty, d.threshold)}.`
    for (const l of wrap(reportedText, Math.floor((plotR - M.left) / 6.4), 2)) {
      body += text(M.left, line, l, { size: 12, weight: 700 })
      line += 15
    }
  }
  const note = d.simulated ? ' Simulated scores for the exercise, not a real detector.' : ''
  const summary =
    `${d.title ?? 'Detector score distribution'}: histogram of detector scores for ${t.authentic} authentic and ${t.synthetic} synthetic items. ` +
    `The classes overlap. ${counts}${reportedText ? ` ${reportedText}` : ''}${note}`
  return {
    svg: frame({
      ...o,
      title: d.title ?? 'Detector score distribution',
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title ?? 'Detector scores by bin',
      columns: ['Score from', 'Score to', 'Authentic items', 'Synthetic items'],
      rows: d.bins.map((b) => [pct(b.from), pct(b.to), String(b.authentic), String(b.synthetic)]),
    },
  }
}

export const aiDetectorScoresKind: FigureKind<AiDetectorScoresData> = {
  kind: 'ai_detector_scores',
  schema: AiDetectorScoresData,
  render,
}
