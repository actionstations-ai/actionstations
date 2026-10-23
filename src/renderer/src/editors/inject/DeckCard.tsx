// One card of the inject deck: thumbnail, id / time / tag, title, type and recipients, and
// badges (draft, media, warnings, job state). Memoized (#201): it re-renders only when its
// entry, its job state or its tab stop changes.
import { AudioLines, Film, Lock, PencilLine, TriangleAlert } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router'
import type { Role } from '@shared/schemas/project'
import { mediaUrl } from '@shared/media-url'
import { Badge, Button, TagChip } from '../../components/ui'
import { injectAlt } from '../../lib/inject-alt'
import type { DeckEntry } from './deck-model'
import { useHasDraft } from './draft'
import { injectUrl } from './links'

export type WorkState = 'working' | 'done' | undefined

function toLabel(row: DeckEntry['row'], roles: Role[]): string {
  if (row.toLabel) return row.toLabel
  const names = row.toRoleIds.map((id) => {
    const role = roles.find((r) => r.id === id)
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

function MediaBadges({ entry }: { entry: DeckEntry }) {
  return (
    <>
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
    </>
  )
}

function CardBadges(props: {
  entry: DeckEntry
  scenarioId: string
  work: WorkState
  onCreate: (row: DeckEntry['row']) => void
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
      <MediaBadges entry={entry} />
      {props.work === 'working' && <Badge tone="info">Working…</Badge>}
      {props.work === 'done' && <Badge tone="ok">Done</Badge>}
      {!entry.inject && (
        <Button
          size="sm"
          tabIndex={-1}
          onClick={() => props.onCreate(entry.row)}
          aria-label={`Create inject for ${entry.row.id}`}
        >
          Create…
        </Button>
      )}
    </div>
  )
}

export interface DeckCardProps {
  entry: DeckEntry
  scenarioId: string
  roles: Role[]
  projectPath: string
  typeLabel: (t: string) => string
  work: WorkState
  onCreate: (row: DeckEntry['row']) => void
  /** Roving tab stop: only the active card is in the tab order. */
  active: boolean
  index: number
  onActivate: (index: number) => void
  /** Ref callback measuring the card's visual row (first card of a row in a windowed deck). */
  measure?: ((el: HTMLElement | null) => void) | undefined
  /** The visual row index the virtualizer knows this card by (with `measure`). */
  windowRow?: number | undefined
}

function CardBody(props: DeckCardProps) {
  const { entry, projectPath } = props
  const { row, inject } = entry
  const type = inject?.type ?? row.format
  return (
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
          <Link to={injectUrl(projectPath, props.scenarioId, inject.id)} tabIndex={-1}>
            {inject.title || row.event}
          </Link>
        ) : (
          <span>{row.event}</span>
        )}
      </h3>
      <p className="deck-card__sub muted">
        {type ? props.typeLabel(type) : 'No type'} · To {toLabel(row, props.roles)}
      </p>
      <CardBadges
        entry={entry}
        scenarioId={props.scenarioId}
        work={props.work}
        onCreate={props.onCreate}
      />
    </div>
  )
}

function DeckCardImpl(props: DeckCardProps) {
  const { measure, windowRow } = props
  return (
    <div
      role="row"
      aria-rowindex={props.index + 1}
      className="deck-card card"
      data-work={props.work}
      data-index={measure ? windowRow : undefined}
      ref={measure}
    >
      <div
        role="gridcell"
        tabIndex={props.active ? 0 : -1}
        className="deck-card__cell"
        data-card={props.index}
        onFocus={() => props.onActivate(props.index)}
      >
        <Thumb entry={props.entry} projectPath={props.projectPath} />
        <CardBody {...props} />
      </div>
    </div>
  )
}

export const DeckCard = memo(DeckCardImpl)
