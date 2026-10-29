// The timeline filter's value, kept per scenario on this computer (spec 0428 FR-7).
import { useCallback, useState } from 'react'

export interface TimelineFilterValue {
  team?: string
  roleId?: string
}

const key = (scenarioId: string) => `ttx.facilitate.filter.${scenarioId}`

function load(scenarioId: string): TimelineFilterValue {
  try {
    const raw = localStorage.getItem(key(scenarioId))
    const parsed = raw ? (JSON.parse(raw) as TimelineFilterValue) : {}
    return {
      ...(typeof parsed.team === 'string' ? { team: parsed.team } : {}),
      ...(typeof parsed.roleId === 'string' ? { roleId: parsed.roleId } : {}),
    }
  } catch {
    return {}
  }
}

export function useTimelineFilter(
  scenarioId: string,
): [TimelineFilterValue, (v: TimelineFilterValue) => void] {
  const [value, setValue] = useState(() => load(scenarioId))
  const set = useCallback(
    (v: TimelineFilterValue) => {
      setValue(v)
      try {
        localStorage.setItem(key(scenarioId), JSON.stringify(v))
      } catch {
        /* the filter lasts for this session */
      }
    },
    [scenarioId],
  )
  return [value, set]
}
