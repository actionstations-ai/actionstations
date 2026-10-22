// Injects tab of the scenario screen: the deck overview. One card per MSEL row in time order
// with its inject's thumbnail, type, media and warning badges; deck-wide "Write all injects" /
// "Render all media" jobs with per-inject progress and cancel; filters.
import { AudioLines, Film, Lock, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { TemplateInfo } from '@shared/ipc'
import type { JobKind } from '@shared/schemas/job'
import type { Scenario } from '@shared/schemas/scenario'
import { mediaUrl } from '@shared/media-url'
import { PURPOSE_TAG_INFO, injectTypeInfo, type PurposeTag } from '@shared/taxonomy'
import { Badge, Button, EmptyState, Field, TagChip } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call, IpcError } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { CreateInjectDialog } from './CreateInjectDialog'
import {
  deckEntries,
  filterDeck,
  NO_FILTERS,
  workState,
  type DeckEntry,
  type DeckFilters,
} from './deck-model'
import { JobBanner } from './JobBanner'
import { injectUrl } from './links'
import { useScenarioJob } from './use-scenario-job'
import './inject-editor.css'

function toLabel(row: DeckEntry['row'], scenario: Scenario): string {
  if (row.toLabel) return row.toLabel
  const names = row.toRoleIds.map((id) => {
    const role = scenario.roles.find((r) => r.id === id)
    return role?.abbreviation || role?.name || id
  })
  return names.join(', ') || '—'
}

function Thumb({ entry, projectPath }: { entry: DeckEntry; projectPath: string }) {
  const t = entry.thumbnail
  if (!t)
    return (
      <div className="deck-card__thumb deck-card__thumb--empty">
        <span>{entry.inject ? 'Not rendered' : 'No inject'}</span>
      </div>
    )
  return (
    <div className="deck-card__thumb">
      <img
        src={mediaUrl(projectPath, t.path)}
        alt={`${entry.row.id}: ${entry.inject?.title ?? ''}`}
        loading="lazy"
      />
    </div>
  )
}

function DeckCard(props: {
  entry: DeckEntry
  scenario: Scenario
  projectPath: string
  typeLabel: (t: string) => string
  work: 'working' | 'done' | undefined
  onCreate: () => void
}) {
  const { entry, scenario, projectPath } = props
  const { row, inject } = entry
  const type = inject?.type ?? row.format
  return (
    <li className="deck-card card" data-work={props.work}>
      <Thumb entry={entry} projectPath={projectPath} />
      <div className="deck-card__body">
        <div className="deck-card__meta">
          <span className="mono deck-card__id">{row.id}</span>
          <span className="mono muted">{row.time}</span>
          <TagChip tag={row.purposeTag} />
          {inject?.locked && (
            <span className="deck-card__icon" title="Locked">
              <Lock size={14} aria-label="Locked" />
            </span>
          )}
        </div>
        <h3 className="deck-card__title">
          {inject ? (
            <Link to={injectUrl(projectPath, scenario.id, inject.id)}>
              {inject.title || row.event}
            </Link>
          ) : (
            <span>{row.event}</span>
          )}
        </h3>
        <p className="deck-card__sub muted">
          {type ? props.typeLabel(type) : 'No type'} · To {toLabel(row, scenario)}
        </p>
        <div className="deck-card__badges">
          {entry.audio && (
            <Badge tone="info">
              <AudioLines size={12} aria-hidden /> Audio
            </Badge>
          )}
          {entry.video && (
            <Badge tone="info">
              <Film size={12} aria-hidden /> Video
            </Badge>
          )}
          {entry.warnings.length > 0 && (
            <span title={entry.warnings.map((w) => `${w.code}: ${w.message}`).join('\n')}>
              <Badge tone="warn">
                <TriangleAlert size={12} aria-hidden /> {entry.warnings.length} warning
                {entry.warnings.length === 1 ? '' : 's'}
              </Badge>
            </span>
          )}
          {props.work === 'working' && <Badge tone="info">Working…</Badge>}
          {props.work === 'done' && <Badge tone="ok">Done</Badge>}
          {!inject && (
            <Button size="sm" onClick={props.onCreate} aria-label={`Create inject for ${row.id}`}>
              Create…
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function FilterBar(props: {
  value: DeckFilters
  onChange: (f: DeckFilters) => void
  scenario: Scenario
  types: string[]
  typeLabel: (t: string) => string
}) {
  const { value, onChange, scenario } = props
  const tags = [...new Set(scenario.msel.map((r) => r.purposeTag))]
  const select = (label: string, key: keyof DeckFilters, options: [string, string][]) => (
    <Field label={label}>
      {({ id }) => (
        <select
          id={id}
          className="select"
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        >
          <option value="">All</option>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
  return (
    <div className="deck-filters" role="group" aria-label="Filter injects">
      {select(
        'Phase',
        'phase',
        [...scenario.phases]
          .sort((a, b) => a.index - b.index)
          .map((p) => [p.id, `${p.index + 1}. ${p.title}`]),
      )}
      {select(
        'Type',
        'type',
        props.types.map((t) => [t, props.typeLabel(t)]),
      )}
      {select(
        'Purpose',
        'tag',
        tags.map((t) => [t, PURPOSE_TAG_INFO[t as PurposeTag]?.label ?? t]),
      )}
      {select('Media', 'media', [
        ['with', 'Has media'],
        ['without', 'No media'],
      ])}
    </div>
  )
}

function useDeckJobs(
  projectPath: string,
  scenarioId: string,
  track: (id: string, k: JobKind) => void,
  onJob: ((jobId: string) => void) | undefined,
) {
  const start = async (kind: JobKind, run: () => Promise<{ jobId: string }>) => {
    try {
      const { jobId } = await run()
      track(jobId, kind)
      onJob?.(jobId)
    } catch (e) {
      const conflict = e instanceof IpcError && e.code === 'CONFLICT'
      toast.error(
        conflict ? 'A generation job is already running for this scenario' : 'Could not start',
        e,
      )
    }
  }
  return {
    writeAll: () =>
      start('generate-injects', () => call('generate:injects', { projectPath, scenarioId })),
    renderAll: () =>
      start('render-media', () => call('generate:media', { projectPath, scenarioId })),
  }
}

export function InjectDeck(props: {
  projectPath: string
  scenario: Scenario
  /** Show a started job in the scenario's live log. */
  onJob?: (jobId: string) => void
}) {
  const { projectPath, scenario } = props
  const injects = useIpcQuery('injects:list', { projectPath, scenarioId: scenario.id })
  const templatesQ = useIpcQuery('templates:list', undefined, { staleTime: Infinity })
  const { job, track } = useScenarioJob(projectPath, scenario.id)
  const jobs = useDeckJobs(projectPath, scenario.id, track, props.onJob)
  const [filters, setFilters] = useState<DeckFilters>(NO_FILTERS)
  const [creating, setCreating] = useState<DeckEntry['row'] | null>(null)
  const templates: TemplateInfo[] = useMemo(() => templatesQ.data ?? [], [templatesQ.data])
  const entries = useMemo(
    () => deckEntries(scenario, injects.data ?? [], templates),
    [scenario, injects.data, templates],
  )
  const typeLabel = (t: string) =>
    templates.find((x) => x.type === t)?.label ?? injectTypeInfo(t)?.label ?? t
  const types = [
    ...new Set(entries.map((e) => e.inject?.type ?? e.row.format).filter((t): t is string => !!t)),
  ]
  const shown = filterDeck(entries, filters)
  const written = entries.filter((e) => e.inject).length
  const rendered = entries.filter((e) => e.thumbnail).length

  if (!scenario.msel.length)
    return (
      <EmptyState
        title="No MSEL yet"
        body="Generate the scenario's MSEL first; injects are written from its rows."
      />
    )
  return (
    <div className="deck stack">
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
      <JobBanner job={job} />
      <FilterBar
        value={filters}
        onChange={setFilters}
        scenario={scenario}
        types={types}
        typeLabel={typeLabel}
      />
      {injects.isError && (
        <p className="field__error" role="alert">
          Could not load injects: {injects.error.message}
        </p>
      )}
      {shown.length ? (
        <ul className="deck-grid" aria-label="Inject deck">
          {shown.map((e) => (
            <DeckCard
              key={e.row.id}
              entry={e}
              scenario={scenario}
              projectPath={projectPath}
              typeLabel={typeLabel}
              work={workState(e, job?.items)}
              onCreate={() => setCreating(e.row)}
            />
          ))}
        </ul>
      ) : (
        <p className="muted">No injects match these filters.</p>
      )}
      <CreateInjectDialog
        key={creating?.id ?? 'none'}
        projectPath={projectPath}
        scenarioId={scenario.id}
        row={creating}
        templates={templates}
        typeLabel={typeLabel}
        onClose={() => setCreating(null)}
      />
    </div>
  )
}
