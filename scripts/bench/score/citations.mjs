// Citation accuracy of a drafted scenario (#434, FR-11):
//   resolution  share of cited keys that resolved to a retrieved chunk (the mappers keep those
//               and record the rest as CITATION_DROPPED)
//   support     share of claim-bearing rows the source check (#423) labels grounded, with
//               unsupported rows counted against (grounding:scenario)
//   coverage    share of content rows (not STARTEX, ENDEX, TIME_JUMP) with a citation
// Without grounding results (`grounding` undefined) support is left out of the parts.
import { rowResults, supportScore } from './grounding.mjs'
import { contentRows, droppedKeys, share } from './util.mjs'

export function citationScore(scenario, grounding) {
  const rows = contentRows(scenario.msel)
  const kept =
    scenario.msel.reduce((n, r) => n + (r.citations?.length ?? 0), 0) +
    (scenario.overview?.coreSectionsTested?.length ?? 0)
  const dropped = scenario.warnings
    .filter((w) => w.code === 'CITATION_DROPPED')
    .reduce((n, w) => n + droppedKeys(w.message).length, 0)
  const resolution = share(kept, kept + dropped)
  const coverage = share(rows.filter((r) => r.citations?.length).length, rows.length)
  const support = grounding ? supportScore(rowResults(grounding)) : undefined
  return {
    resolution: resolution * 100,
    coverage: coverage * 100,
    ...(support ? { support: support.support } : {}),
    kept,
    dropped,
    ...(support ? { grounding: support } : {}),
  }
}
