// Injects tab of the scenario screen: the deck overview. One card per MSEL row in time order
// with its inject's thumbnail, type, media and warning badges; deck-wide "Write all injects" /
// "Render all media" jobs with per-inject progress and cancel; filters. The cards form an
// ARIA grid with one tab stop (DeckGrid.tsx).
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { TemplateInfo } from '@shared/ipc'
import type { Scenario } from '@shared/schemas/scenario'
import { injectTypeInfo } from '@shared/taxonomy'
import { Button, EmptyState } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { CreateInjectDialog } from './CreateInjectDialog'
import { DeckFilterBar } from './DeckFilterBar'
import { DeckGrid } from './DeckGrid'
import {
  deckEntries,
  filterDeck,
  NO_FILTERS,
  reuseEntries,
  type DeckEntry,
  type DeckFilters,
} from './deck-model'
import { JobBanner } from './JobBanner'
import { useDeckJobs } from './use-deck-jobs'
import { useScenarioJob, type ScenarioJob } from './use-scenario-job'
import './inject-editor.css'

interface DeckProps {
  projectPath: string
  scenario: Scenario
  /** Show a started job in the scenario's live log. */
  onJob?: (jobId: string) => void
}

/** Deck entries for the scenario and its injects, reusing unchanged entry objects. */
function useEntries(scenario: Scenario, injects: Parameters<typeof deckEntries>[1] | undefined) {
  const next = useMemo(() => deckEntries(scenario, injects ?? []), [scenario, injects])
  const [cache, setCache] = useState({ next, entries: next })
  if (cache.next === next) return cache.entries
  const entries = reuseEntries(cache.entries, next)
  setCache({ next, entries })
  return entries
}

function DeckToolbar(props: {
  entries: DeckEntry[]
  job: ScenarioJob | null
  jobs: ReturnType<typeof useDeckJobs>
}) {
  const { job, entries, jobs } = props
  const written = entries.filter((e) => e.inject).length
  const rendered = entries.filter((e) => e.thumbnail).length
  return (
    <div className="deck__toolbar">
      <p className="muted" aria-live="polite">
        {written} of {entries.length} rows have an inject · {rendered} rendered
      </p>
      <div className="row">
        <Button variant="primary" disabled={!!job} onClick={() => void jobs.writeAll()}>
          Write all injects
        </Button>
        <Button disabled={!!job || !written} onClick={() => void jobs.renderAll()}>
          Render all media
        </Button>
      </div>
    </div>
  )
}

function NoMsel() {
  return (
    <EmptyState
      title="No MSEL yet"
      body="Injects are written from MSEL rows. Generate the scenario's MSEL from the stages above, or add rows by hand in the MSEL tab."
      actions={
        <Link className="btn btn--primary" to="?tab=msel">
          Open the MSEL
        </Link>
      }
    />
  )
}

/** The keyboard hint and the grid of cards. */
function DeckCards(props: Parameters<typeof DeckGrid>[0]) {
  return (
    <>
      <p id="deck-keys" className="sr-only">
        Arrow keys move between injects, Enter opens the selected inject.
      </p>
      <DeckGrid {...props} />
    </>
  )
}

function useDeckModel(props: DeckProps) {
  const { projectPath, scenario } = props
  const injects = useIpcQuery('injects:list', { projectPath, scenarioId: scenario.id })
  const templatesQ = useIpcQuery('templates:list', undefined, { staleTime: Infinity })
  const scenarioJob = useScenarioJob(projectPath, scenario.id)
  const jobs = useDeckJobs(projectPath, scenario.id, scenarioJob.track, props.onJob)
  const templates: TemplateInfo[] = useMemo(() => templatesQ.data ?? [], [templatesQ.data])
  const entries = useEntries(scenario, injects.data)
  const typeLabel = useCallback(
    (t: string) => templates.find((x) => x.type === t)?.label ?? injectTypeInfo(t)?.label ?? t,
    [templates],
  )
  const types = [
    ...new Set(entries.map((e) => e.inject?.type ?? e.row.format).filter((t): t is string => !!t)),
  ]
  const [filters, setFilters] = useState<DeckFilters>(NO_FILTERS)
  const [creating, setCreating] = useState<DeckEntry['row'] | null>(null)
  const shown = useMemo(() => filterDeck(entries, filters), [entries, filters])
  const filtering = { filters, setFilters, creating, setCreating, shown }
  return { injects, templates, entries, typeLabel, types, jobs, ...scenarioJob, ...filtering }
}

export function InjectDeck(props: DeckProps) {
  const { projectPath, scenario } = props
  const m = useDeckModel(props)
  const { typeLabel, job, filters, setFilters, creating, setCreating, shown } = m

  if (!scenario.msel.length) return <NoMsel />
  return (
    <div className="deck stack">
      <DeckToolbar entries={m.entries} job={job} jobs={m.jobs} />
      <JobBanner
        job={job}
        interrupted={m.interrupted}
        {...(props.onJob ? { onResumed: props.onJob } : {})}
      />
      <DeckFilterBar
        value={filters}
        onChange={setFilters}
        scenario={scenario}
        types={m.types}
        typeLabel={typeLabel}
      />
      {m.injects.isError && (
        <p className="field__error" role="alert">
          Could not load injects: {errorText(m.injects.error)}
        </p>
      )}
      {shown.length ? (
        <DeckCards
          entries={shown}
          scenario={scenario}
          projectPath={projectPath}
          typeLabel={typeLabel}
          items={job?.items}
          onCreate={setCreating}
        />
      ) : (
        <p className="muted">No injects match these filters.</p>
      )}
      <CreateInjectDialog
        key={creating?.id ?? 'none'}
        projectPath={projectPath}
        scenarioId={scenario.id}
        row={creating}
        templates={m.templates}
        typeLabel={typeLabel}
        onClose={() => setCreating(null)}
      />
    </div>
  )
}
