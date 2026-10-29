// Citation accuracy of a drafted scenario (#434, FR-11), scoring version 1:
//   resolution  share of cited keys that resolved to a retrieved chunk (the mappers keep those
//               and record the rest as CITATION_DROPPED)
//   coverage    share of content rows (not STARTEX, ENDEX, TIME_JUMP) with a citation
// Support (FR-11 b, grounding labels from #423) joins in scoring version 2.
import { contentRows, droppedKeys, share } from './util.mjs'

export function citationScore(scenario) {
  const rows = contentRows(scenario.msel)
  const kept =
    scenario.msel.reduce((n, r) => n + (r.citations?.length ?? 0), 0) +
    (scenario.overview?.coreSectionsTested?.length ?? 0)
  const dropped = scenario.warnings
    .filter((w) => w.code === 'CITATION_DROPPED')
    .reduce((n, w) => n + droppedKeys(w.message).length, 0)
  const resolution = share(kept, kept + dropped)
  const coverage = share(rows.filter((r) => r.citations?.length).length, rows.length)
  return { resolution: resolution * 100, coverage: coverage * 100, kept, dropped }
}
