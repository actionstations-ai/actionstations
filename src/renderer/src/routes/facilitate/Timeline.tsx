import { useEffect, useRef, type KeyboardEvent } from 'react'
import { clsx } from 'clsx'
import { AudioLines, MessageSquare } from 'lucide-react'
import type { Inject } from '@shared/schemas/inject'
import type { MselRow, Phase } from '@shared/schemas/scenario'
import { INJECT_TYPES } from '@shared/taxonomy'
import { Badge, Button, TagChip } from '../../components/ui'
import { groupByPhase } from '../scenarios/msel-utils'

export interface TimelineEntry {
  row: MselRow
  inject: Inject | undefined
  target: string
  thumbUrl: string | undefined
  hasAudio: boolean
  due: boolean
  deliveredAt: string | undefined
  hasNote: boolean
}

export interface TimelineProps {
  phases: Phase[]
  entries: TimelineEntry[]
  selectedId: string | undefined
  onSelect: (rowId: string) => void
  onDeliver: (rowId: string) => void
  onUndo: (rowId: string) => void
}

const typeLabel = (type: string | undefined) =>
  INJECT_TYPES.find((t) => t.id === type)?.label ?? type ?? '—'

function Thumb({ entry }: { entry: TimelineEntry }) {
  if (entry.thumbUrl)
    return <img className="fac-row__thumb" src={entry.thumbUrl} alt="" loading="lazy" />
  return (
    <span className="fac-row__thumb fac-row__thumb--empty" aria-hidden>
      {entry.hasAudio && <AudioLines size={18} />}
    </span>
  )
}

function RowStatus({ entry }: { entry: TimelineEntry }) {
  if (entry.deliveredAt) return <Badge tone="ok">Delivered {entry.deliveredAt}</Badge>
  if (entry.due) return <Badge tone="warn">Due now</Badge>
  return null
}

function TimelineRow(props: {
  entry: TimelineEntry
  selected: boolean
  onSelect: () => void
  onDeliver: () => void
  onUndo: () => void
}) {
  const { entry } = props
  const { row } = entry
  return (
    <li
      className={clsx(
        'fac-row',
        entry.due && 'fac-row--due',
        entry.deliveredAt && 'fac-row--delivered',
        props.selected && 'fac-row--selected',
      )}
    >
      <button
        type="button"
        className="fac-row__main"
        data-row-id={row.id}
        aria-current={props.selected ? 'true' : undefined}
        onClick={props.onSelect}
      >
        <span className="fac-row__time mono">{row.time}</span>
        <span className="fac-row__id mono">{row.id}</span>
        <Thumb entry={entry} />
        <span className="fac-row__body">
          <span className="fac-row__event">{entry.inject?.title || row.event}</span>
          <span className="fac-row__meta">
            <span>To {entry.target}</span>
            <TagChip tag={row.purposeTag} />
            <span>{typeLabel(entry.inject?.type ?? row.format)}</span>
            {entry.hasNote && (
              <span className="fac-row__note">
                <MessageSquare size={12} aria-hidden /> Note
              </span>
            )}
          </span>
        </span>
        <RowStatus entry={entry} />
      </button>
      {entry.deliveredAt ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onUndo}
          aria-label={`Undo deliver ${row.id}`}
        >
          Undo
        </Button>
      ) : (
        <Button
          size="sm"
          variant={entry.due ? 'primary' : 'default'}
          onClick={props.onDeliver}
          aria-label={`Deliver ${row.id}`}
        >
          Deliver
        </Button>
      )}
    </li>
  )
}

/** Up/Down move between row buttons (and select), like a list of options. */
function moveFocus(e: KeyboardEvent<HTMLElement>, onSelect: (rowId: string) => void) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.fac-row__main')]
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (i < 0) return
  const next = buttons[e.key === 'ArrowDown' ? i + 1 : i - 1]
  if (!next) return
  e.preventDefault()
  next.focus()
  onSelect(next.dataset.rowId!)
}

export function Timeline(props: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const groups = groupByPhase(
    props.phases,
    props.entries.map((e) => e.row),
  )
  const byId = new Map(props.entries.map((e) => [e.row.id, e]))

  useEffect(() => {
    if (!props.selectedId) return
    const el = ref.current?.querySelector(`[data-row-id="${CSS.escape(props.selectedId)}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [props.selectedId])

  return (
    <div
      ref={ref}
      className="fac-timeline"
      role="region"
      aria-label="Timeline"
      onKeyDown={(e) => moveFocus(e, props.onSelect)}
    >
      {groups.map((g) => (
        <section
          key={g.phase?.id ?? 'other'}
          className="fac-phase"
          aria-label={g.phase ? `Phase ${g.phase.index + 1}: ${g.phase.title}` : 'Other rows'}
        >
          <h2 className="fac-phase__title">
            {g.phase ? `Phase ${g.phase.index + 1}: ${g.phase.title}` : 'Other rows'}
            {g.phase && (
              <span className="fac-phase__span mono">
                {g.phase.startTime}–{g.phase.endTime}
              </span>
            )}
          </h2>
          <ol className="fac-phase__rows">
            {g.rows.map((row) => (
              <TimelineRow
                key={row.id}
                entry={byId.get(row.id)!}
                selected={row.id === props.selectedId}
                onSelect={() => props.onSelect(row.id)}
                onDeliver={() => props.onDeliver(row.id)}
                onUndo={() => props.onUndo(row.id)}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
