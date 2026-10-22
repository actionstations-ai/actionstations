// "Check scenarios" (#155): runs scenarios:lint for the project's scenarios (archived ones
// skipped) and counts FACILITY_UNKNOWN_ID warnings, so the page can say how an edit to the
// facts changed them. The first check is the baseline the later ones compare with.
import { useCallback, useRef, useState } from 'react'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'

export const FACILITY_UNKNOWN_ID = 'FACILITY_UNKNOWN_ID'

export interface LintCount {
  scenarios: number
  warnings: number
  /** Scenarios with at least one warning, by title. */
  flagged: { id: string; title: string; warnings: number }[]
}

export interface FacilityLintState {
  baseline: LintCount | undefined
  latest: LintCount | undefined
  running: boolean
  error: string | undefined
}

export async function countFacilityWarnings(projectPath: string): Promise<LintCount> {
  const scenarios = (await call('scenarios:list', { projectPath })).filter(
    (s) => s.status !== 'archived',
  )
  const flagged: LintCount['flagged'] = []
  let warnings = 0
  for (const s of scenarios) {
    const lint = await call('scenarios:lint', { projectPath, scenarioId: s.id })
    const n = lint.filter((w) => w.code === FACILITY_UNKNOWN_ID).length
    warnings += n
    if (n) flagged.push({ id: s.id, title: s.title, warnings: n })
  }
  return { scenarios: scenarios.length, warnings, flagged }
}

export function useFacilityLint(projectPath: string) {
  const [state, setState] = useState<FacilityLintState>({
    baseline: undefined,
    latest: undefined,
    running: false,
    error: undefined,
  })
  const baseline = useRef<LintCount | undefined>(undefined)
  const run = useCallback(async () => {
    setState((s) => ({ ...s, running: true, error: undefined }))
    try {
      const count = await countFacilityWarnings(projectPath)
      baseline.current ??= count
      setState({ baseline: baseline.current, latest: count, running: false, error: undefined })
    } catch (err) {
      setState((s) => ({ ...s, running: false, error: errorText(err) }))
    }
  }, [projectPath])
  return { ...state, run }
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** "3 facility-ID warnings in 2 scenarios (was 5)." */
export function describeCount(baseline: LintCount | undefined, latest: LintCount): string {
  if (!latest.scenarios) return 'No scenarios to check yet.'
  const now = `${plural(latest.warnings, 'unknown-identifier warning')} across ${plural(latest.scenarios, 'scenario')}`
  if (!baseline || baseline === latest || baseline.warnings === latest.warnings) return `${now}.`
  const delta = latest.warnings - baseline.warnings
  return `${now} (${delta < 0 ? `${-delta} fewer` : `${delta} more`} than when you opened this page: ${baseline.warnings}).`
}
