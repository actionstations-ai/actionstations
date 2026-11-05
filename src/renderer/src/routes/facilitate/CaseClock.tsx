// The case clock beside the exercise clock (spec 0448 FR-9). Shown only when the scenario has
// case data with a time mapping. The origin words (historical, simulated) always appear with it.
import type { CaseManifest } from '@shared/schemas/case-data'
import { caseTimeMs, formatCaseTime } from '@shared/case-time'
import { useIpcQuery } from '../../lib/query'
import { originWords } from './case-origin'

export function CaseClockView(props: { manifest: CaseManifest; minutes: number }) {
  const { manifest, minutes } = props
  const map = manifest.timeMapping
  if (!map || !manifest.datasets.length) return null
  return (
    <section className="fac-clock fac-clock--case" aria-label="Case clock">
      <div className="fac-clock__time">
        <span className="fac-clock__label">Case clock · {originWords(manifest)}</span>
        <span className="fac-clock__value mono" role="timer" aria-label="Case time">
          {formatCaseTime(caseTimeMs(minutes, map))}
        </span>
        <span className="fac-clock__meta">
          {map.speed !== 1 && <>{map.speed}× case time · </>}
          Shows the case data for this moment of the exercise
        </span>
      </div>
    </section>
  )
}

export function CaseClock(props: { projectPath: string; scenarioId: string; minutes: number }) {
  const { projectPath, scenarioId, minutes } = props
  const summary = useIpcQuery('case:get', { projectPath, scenarioId })
  const manifest = summary.data?.manifest
  if (!manifest) return null
  return <CaseClockView manifest={manifest} minutes={minutes} />
}
