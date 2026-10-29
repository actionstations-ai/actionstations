// Regulatory clocks on the presentation screen (#426, FR-9): only the clocks the facilitator
// ticked "Show on screen", as "CIRCIA incident report due in 61 h 12 m". Never notes. Reads the
// facilitator state every few seconds (the presentation window has no other link to it).
import { useEffect, useMemo, useState } from 'react'
import { CLOCK_STATUS_LABEL } from '@shared/compliance/clock'
import { formatSpan, scenarioStart } from '@shared/compliance/scenario-time'
import { regulationLabel, sessionOf } from '@shared/schemas/compliance'
import { useIpcQuery } from '../../lib/query'
import { clockMinutes } from '../facilitate/clock'
import { regulationClocks } from '../facilitate/compliance'
import { STATUS_ICON } from '../facilitate/clock-icons'

const POLL_MS = 3000

function useSecondTick(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function ClocksOnScreen({
  projectPath,
  scenarioId,
}: {
  projectPath: string
  scenarioId: string
}) {
  const req = { projectPath, scenarioId }
  const state = useIpcQuery('facilitator:state-get', req, { refetchInterval: POLL_MS })
  const list = useIpcQuery('compliance:list', { projectPath })
  const scenario = useIpcQuery('scenarios:get', req)
  const now = useSecondTick()
  const onScreen = state.data ? sessionOf(state.data).onScreen : []
  const start = useMemo(() => {
    const s = scenario.data
    if (!s) return undefined
    const startex = s.msel.find((r) => r.purposeTag === 'STARTEX')?.event
    return scenarioStart(
      {
        startDate: s.brief.startDate,
        startWallClock: s.brief.startWallClock,
        startexText: startex,
      },
      new Date(),
    )
  }, [scenario.data])
  if (!state.data || !list.data || !start || !onScreen.length) return null
  const regs = list.data.regulations.map((r) => r.regulation)
  const groups = regulationClocks(regs, state.data, start.at, clockMinutes(state.data, now))
  const shown = groups.flatMap((g) =>
    g.views.filter((v) => onScreen.includes(v.key)).map((v) => ({ g, v })),
  )
  if (!shown.length) return null
  return (
    <ul className="present__clocks" aria-label="Reporting clocks">
      {shown.map(({ g, v }) => {
        const Icon = STATUS_ICON[v.status]
        const left = v.minutesLeft
        return (
          <li key={v.key} className={`present__clock present__clock--${v.status}`}>
            <span className="present__clock-name">
              {regulationLabel(g.regulation)} {v.label.toLowerCase()}
            </span>
            <span className="present__clock-time">
              {left === undefined
                ? CLOCK_STATUS_LABEL[v.status]
                : left >= 0
                  ? `due in ${formatSpan(left)}`
                  : `overdue ${formatSpan(-left)}`}
            </span>
            <span className="present__clock-status">
              <Icon size={28} aria-hidden /> {CLOCK_STATUS_LABEL[v.status]}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
