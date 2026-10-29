// The dashboard's filter lives in the URL query (FR-9) so a filtered view can be bookmarked:
// ?project=<id>&year=2026&area=response&doc=<key>&stale=24
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { MISSION_AREAS } from '@shared/core-capabilities'
import type { HealthFilter } from '@shared/schemas'

export interface HealthChoice {
  project: string
  year: string
  area: string
  doc: string
  stale: string
}

export function choiceFromQuery(params: URLSearchParams): HealthChoice {
  const get = (k: keyof HealthChoice) => params.get(k) ?? ''
  return {
    project: get('project'),
    year: get('year'),
    area: get('area'),
    doc: get('doc'),
    stale: get('stale'),
  }
}

/** The IPC filter for a set of choices; unknown or malformed values are ignored. */
export function filterFromChoice(c: HealthChoice): HealthFilter {
  const filter: HealthFilter = {}
  if (c.project) filter.projectIds = [c.project]
  const year = Number(c.year)
  if (Number.isInteger(year) && year > 1989) filter.years = [year]
  if ((MISSION_AREAS as readonly string[]).includes(c.area))
    filter.missionAreas = [c.area as (typeof MISSION_AREAS)[number]]
  if (c.doc) filter.documentKeys = [c.doc]
  const stale = Number(c.stale)
  if (Number.isInteger(stale) && stale >= 1 && stale <= 120) filter.staleAfterMonths = stale
  return filter
}

export function useHealthFilter() {
  const [params, setParams] = useSearchParams()
  const choice = useMemo(() => choiceFromQuery(params), [params])
  const filter = useMemo(() => filterFromChoice(choice), [choice])
  const setChoice = useCallback(
    (patch: Partial<HealthChoice>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v)
            else next.delete(k)
          }
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  return { choice, filter, setChoice }
}
