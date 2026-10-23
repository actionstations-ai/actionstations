// Injects tab of the scenario screen: the deck overview. One card per MSEL row in time order
// with its inject's thumbnail, type, media and warning badges; deck-wide "Write all injects" /
// "Render all media" jobs with per-inject progress and cancel; filters. The cards form an
// ARIA grid with one tab stop: arrow keys, Home/End move between cards (deck-nav.ts), Enter
// opens the inject editor (or "Create…" for a row without an inject).
import { AudioLines, Film, Lock, PencilLine, TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
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
import { useHasDraft } from './draft'
import {
  deckEntries,
  filterDeck,
  NO_FILTERS,
  workState,
  type DeckEntry,
  type DeckFilters,
} from './deck-model'
import { gridColumns, nextDeckIndex } from './deck-nav'
import { JobBanner } from './JobBanner'
import { injectUrl } from './links'
import { useScenarioJob } from './use-scenario-job'
import './inject-editor.css'
import { errorText } from '../../lib/errors'
import { injectAlt } from '../../lib/inject-alt'

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
        alt={injectAlt(entry.inject ?? { mselRowId: entry.row.id }, `MSEL row ${entry.row.id}`)}
        loading="lazy"
      />
    </div>
  )
}

function CardBadges(props: {
  entry: DeckEntry
  scenarioId: string
  work: 'working' | 'done' | undefined
  onCreate: () => void
}) {
  const { entry } = props
  // Unsaved edits made in the inject editor (#202): the deck, export and render use the saved copy.
  const draft = useHasDraft(props.scenarioId, entry.inject)
  return (
    <div className="deck-card__badges">
      {draft && (
        <span title="Unsaved edits in the inject editor. The deck, export and render use the saved version until you save.">
          <Badge tone="warn">
            <PencilLine size={12} aria-hidden /> Draft
          </Badge>
        </span>
      )}
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
      {!entry.inject && (
        <Button
          size="sm"
          tabIndex={-1}
          onClick={props.onCreate}
          aria-label={`Create inject for ${entry.row.id}`}
        >
          Create…
        </Button>
      )}
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
  /** Roving tab stop: only the active card is in the tab order. */
  active: boolean
  index: number
  onFocusCell: () => void
}) {
  const { entry, scenario, projectPath } = props
  const { row, inject } = entry
  const type = inject?.type ?? row.format
  return (
    <div
      role="row"
      aria-rowindex={props.index + 1}
      className="deck-card card"
      data-work={props.work}
    >
      <div
        role="gridcell"
        tabIndex={props.active ? 0 : -1}
        className="deck-card__cell"
        onFocus={props.onFocusCell}
      >
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
              <Link to={injectUrl(projectPath, scenario.id, inject.id)} tabIndex={-1}>
                {inject.title || row.event}
              </Link>
            ) : (
              <span>{row.event}</span>
            )}
          </h3>
          <p className="deck-card__sub muted">
            {type ? props.typeLabel(type) : 'No type'} · To {toLabel(row, scenario)}
          </p>
          <CardBadges
            entry={entry}
            scenarioId={scenario.id}
            work={props.work}
            onCreate={props.onCreate}
          />
        </div>
      </div>
    </div>
  )
}

function DeckGrid(props: {
  entries: DeckEntry[]
  scenario: Scenario
  projectPath: string
  typeLabel: (t: string) => string
  items: string[] | undefined
  onCreate: (row: DeckEntry['row']) => void
}) {
  const { entries, scenario, projectPath } = props
  const navigate = useNavigate()
  const [active, setActive] = useState(0)
  const grid = useRef<HTMLDivElement>(null)
  const current = Math.min(active, entries.length - 1)
  const cell = (i: number) =>
    grid.current?.querySelectorAll<HTMLElement>('[role="gridcell"]').item(i) ?? null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== cell(current)) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const entry = entries[current]
      if (entry?.inject) navigate(injectUrl(projectPath, scenario.id, entry.inject.id))
      else if (entry) props.onCreate(entry.row)
      return
    }
    const next = nextDeckIndex(current, e.key, entries.length, gridColumns(grid.current))
    if (next === undefined) return
    e.preventDefault()
    setActive(next)
    cell(next)?.focus()
  }

  return (
    <div
      ref={grid}
      role="grid"
      aria-label="Inject deck"
      aria-rowcount={entries.length}
      aria-describedby="deck-keys"
      className="deck-grid"
      onKeyDown={onKeyDown}
    >
      {entries.map((e, i) => (
        <DeckCard
          key={e.row.id}
          entry={e}
          scenario={scenario}
          projectPath={projectPath}
          typeLabel={props.typeLabel}
          work={workState(e, props.items)}
          onCreate={() => props.onCreate(e.row)}
          active={i === current}
          index={i}
          onFocusCell={() => setActive(i)}
        />
      ))}
    </div>
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
  const { job, interrupted, track } = useScenarioJob(projectPath, scenario.id)
  const jobs = useDeckJobs(projectPath, scenario.id, track, props.onJob)
  const [filters, setFilters] = useState<DeckFilters>(NO_FILTERS)
  const [creating, setCreating] = useState<DeckEntry['row'] | null>(null)
  const templates: TemplateInfo[] = useMemo(() => templatesQ.data ?? [], [templatesQ.data])
  const entries = useMemo(() => deckEntries(scenario, injects.data ?? []), [scenario, injects.data])
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
        body="Injects are written from MSEL rows. Generate the scenario's MSEL from the stages above, or add rows by hand in the MSEL tab."
        actions={
          <Link className="btn btn--primary" to="?tab=msel">
            Open the MSEL
          </Link>
        }
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
      <JobBanner
        job={job}
        interrupted={interrupted}
        {...(props.onJob ? { onResumed: props.onJob } : {})}
      />
      <FilterBar
        value={filters}
        onChange={setFilters}
        scenario={scenario}
        types={types}
        typeLabel={typeLabel}
      />
      {injects.isError && (
        <p className="field__error" role="alert">
          Could not load injects: {errorText(injects.error)}
        </p>
      )}
      {shown.length ? (
        <>
          <p id="deck-keys" className="sr-only">
            Arrow keys move between injects, Enter opens the selected inject.
          </p>
          <DeckGrid
            entries={shown}
            scenario={scenario}
            projectPath={projectPath}
            typeLabel={typeLabel}
            items={job?.items}
            onCreate={setCreating}
          />
        </>
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
