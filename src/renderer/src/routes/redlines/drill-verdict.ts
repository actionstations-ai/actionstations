// The latest regression drill verdict for a proposed plan edit (#504, spec 0431 FR-12): the
// newest run of any drill that tests the redline, judged from the ratings of the criteria the
// redline was proposed to fix (all of the run's criteria when none of them match).
import { verdictOf, type Drill, type DrillVerdict, type Redline } from '@shared/schemas'

export interface RedlineVerdict {
  verdict: DrillVerdict
  ranAt: string
  drillTitle: string
}

export const VERDICT_LABEL: Record<DrillVerdict, string> = {
  pass: 'Passed',
  partial: 'Partly passed',
  fail: 'Failed',
}

export function latestRedlineVerdict(
  redline: Pick<Redline, 'id' | 'source'>,
  drills: readonly Drill[],
): RedlineVerdict | undefined {
  let best: { drill: Drill; run: Drill['runs'][number] } | undefined
  for (const drill of drills) {
    if (!drill.redlineIds.includes(redline.id)) continue
    for (const run of drill.runs) if (!best || run.ranAt > best.run.ranAt) best = { drill, run }
  }
  if (!best) return undefined
  const wanted = new Set(redline.source.criterionIds)
  const matched = best.run.criteria.filter(
    (c) => wanted.has(c.criterionId) || wanted.has(`${c.rowId}|${c.criterionId}`),
  )
  const ratings = (matched.length ? matched : best.run.criteria).map((c) => c.rating)
  return {
    verdict: verdictOf(ratings).verdict,
    ranAt: best.run.ranAt,
    drillTitle: best.drill.title,
  }
}
