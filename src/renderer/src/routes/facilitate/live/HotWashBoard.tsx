// The Hot wash board (#415): what devices posted, in three columns, with the moves a
// facilitator needs: group, name, edit, tag, promote, hide. Everything works with checkboxes and
// buttons; nothing needs a drag. New items are announced once as a count, not one by one.
import { useEffect, useRef, useState } from 'react'
import type { BoardView, HotWashItem } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { errorText } from '../../../lib/errors'
import type { UpdateState } from '../use-delivery-actions'
import { BoardItem } from './BoardItem'
import { EditDialog, LabelDialog, TagDialog } from './GroupDialog'
import {
  COLUMNS,
  cellsFor,
  hidden,
  inbox,
  promoteKey,
  selectionFacts,
  shownItems,
  type Cell,
} from './hotwash-model'
import { HotWashControls } from './HotWashControls'
import { useLiveHotwash, type LiveHotwash } from './use-live-hotwash'

type Dialog = 'label' | 'edit' | 'tag' | undefined

/** One polite line for a burst of new items ("3 new items"). */
function useArrivalNote(count: number): string {
  const seen = useRef(count)
  const [note, setNote] = useState('')
  useEffect(() => {
    if (count <= seen.current) {
      seen.current = count
      return
    }
    const id = setTimeout(() => {
      setNote(`${count - seen.current} new ${count - seen.current === 1 ? 'item' : 'items'}`)
      seen.current = count
    }, 1000)
    return () => clearTimeout(id)
  }, [count])
  return note
}

function CellView(props: {
  cell: Cell
  scenario: Scenario
  selected: ReadonlySet<string>
  toggle: (ids: string[], on: boolean) => void
}) {
  const { cell } = props
  if (cell.type === 'item')
    return (
      <BoardItem
        item={cell.item}
        scenario={props.scenario}
        selected={props.selected.has(cell.item.itemId)}
        onSelect={(on) => props.toggle([cell.item.itemId], on)}
      />
    )
  const ids = cell.items.map((i) => i.itemId)
  const all = ids.every((id) => props.selected.has(id))
  const name = cell.group.label || 'Unnamed group'
  return (
    <li className="fac-hw__group" data-promoted={cell.group.promoted || undefined}>
      <label className="fac-hw__group-head">
        <input
          type="checkbox"
          checked={all}
          aria-label={`Select all ${ids.length} items in group ${name}`}
          onChange={(e) => props.toggle(ids, e.target.checked)}
        />
        <strong>{name}</strong>
        <span className="fac-hint">
          {ids.length} items · ▲ {cell.plus}
        </span>
        {cell.group.promoted ? <span className="fac-hw__star">Promoted</span> : null}
      </label>
      <ul className="fac-hw__list" aria-label={`Items in ${name}`}>
        {cell.items.map((item) => (
          <BoardItem
            key={item.itemId}
            item={item}
            scenario={props.scenario}
            selected={props.selected.has(item.itemId)}
            onSelect={(on) => props.toggle([item.itemId], on)}
          />
        ))}
      </ul>
    </li>
  )
}

function Waiting(props: {
  title: string
  items: HotWashItem[]
  scenario: Scenario
  label: string
  run: (id: string) => void
}) {
  if (props.items.length === 0) return null
  return (
    <section className="fac-hw__aside" aria-label={props.title}>
      <h3>
        {props.title} ({props.items.length})
      </h3>
      <ul className="fac-hw__list">
        {props.items.map((item) => (
          <BoardItem
            key={item.itemId}
            item={item}
            scenario={props.scenario}
            selected={false}
            onSelect={() => undefined}
            action={{ label: props.label, run: () => props.run(item.itemId) }}
          />
        ))}
      </ul>
    </section>
  )
}

function Toolbar(props: {
  board: BoardView
  selected: ReadonlySet<string>
  live: LiveHotwash
  run: (fn: () => Promise<unknown>) => void
  open: (d: Dialog) => void
  clear: () => void
}) {
  const { board, selected, live } = props
  const f = selectionFacts(board, selected)
  const ids = [...selected]
  const chosen = board.items.filter((i) => selected.has(i.itemId))
  const keys = [...new Set(chosen.map(promoteKey))]
  const promote = () =>
    props.run(async () => {
      for (const k of keys) await (f.allPromoted ? live.unpromote(k) : live.promote(k))
      props.clear()
    })
  return (
    <div className="fac-hw__toolbar" role="toolbar" aria-label={`Actions for ${f.count} selected`}>
      <span className="fac-hint">{f.count} selected</span>
      <Button
        size="sm"
        disabled={!f.canGroup}
        onClick={() => props.run(() => live.act({ action: 'group', itemIds: ids }))}
      >
        Group selected
      </Button>
      <Button
        size="sm"
        disabled={!f.canUngroup}
        onClick={() => props.run(() => live.act({ action: 'ungroup', itemIds: ids }))}
      >
        Ungroup
      </Button>
      <Button size="sm" disabled={!f.canLabel} onClick={() => props.open('label')}>
        Name group
      </Button>
      <Button size="sm" disabled={f.count === 0} onClick={promote}>
        {f.allPromoted ? 'Unpromote' : 'Promote'}
      </Button>
      <Button size="sm" disabled={f.count === 0} onClick={() => props.open('tag')}>
        Tag
      </Button>
      <Button size="sm" disabled={!f.canEdit} onClick={() => props.open('edit')}>
        Edit text
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={f.count === 0}
        onClick={() =>
          props.run(async () => {
            await live.act({ action: 'hide', itemIds: ids })
            props.clear()
          })
        }
      >
        Hide
      </Button>
    </div>
  )
}

export function HotWashBoard(props: {
  projectPath: string
  scenario: Scenario
  update: UpdateState
}) {
  const live = useLiveHotwash(props.projectPath, props.scenario.id, props.update)
  return <HotWashBoardView scenario={props.scenario} live={live} />
}

export function HotWashBoardView(props: { scenario: Scenario; live: LiveHotwash }) {
  const { live } = props
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<Dialog>()
  const board = live.board
  const note = useArrivalNote(board ? shownItems(board).length + inbox(board).length : 0)
  const run = (fn: () => Promise<unknown>) =>
    void fn().catch((err: unknown) => toast.error('That did not work', errorText(err)))
  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  const only = board?.items.find((i) => selected.has(i.itemId))
  const grouped = board?.items.find((i) => selected.has(i.itemId) && i.groupId)
  const groupLabel = board?.groups.find((g) => g.groupId === grouped?.groupId)?.label ?? ''
  const close = () => setDialog(undefined)
  const ids = [...selected]
  return (
    <div className="fac-hw">
      <HotWashControls live={live} />
      {!board ? null : (
        <>
          <p className="sr-only" role="status">
            {note}
          </p>
          <Waiting
            title="Waiting for review"
            items={inbox(board)}
            scenario={props.scenario}
            label="Accept"
            run={(id) => run(() => live.act({ action: 'accept', itemIds: [id] }))}
          />
          <Toolbar
            board={board}
            selected={selected}
            live={live}
            run={run}
            open={setDialog}
            clear={() => setSelected(new Set())}
          />
          <div className="fac-hw__columns">
            {COLUMNS.map((col) => {
              const cells = cellsFor(board, col.kind)
              return (
                <section
                  key={col.kind}
                  className="fac-hw__col"
                  aria-labelledby={`hw-col-${col.kind}`}
                >
                  <h3 id={`hw-col-${col.kind}`}>
                    {col.title} ({cells.length})
                  </h3>
                  {cells.length === 0 ? (
                    <p className="fac-hint">Nothing here yet.</p>
                  ) : (
                    <ul className="fac-hw__list">
                      {cells.map((cell) => (
                        <CellView
                          key={cell.type === 'group' ? cell.group.groupId : cell.item.itemId}
                          cell={cell}
                          scenario={props.scenario}
                          selected={selected}
                          toggle={toggle}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
          <Waiting
            title="Hidden"
            items={hidden(board)}
            scenario={props.scenario}
            label="Restore"
            run={(id) => run(() => live.act({ action: 'restore', itemIds: [id] }))}
          />
          {dialog === 'label' && (
            <LabelDialog
              open
              initial={groupLabel}
              onClose={close}
              onSave={(label) => {
                close()
                run(() => live.act({ action: 'label', itemIds: [grouped!.itemId], label }))
              }}
            />
          )}
          {dialog === 'edit' && only && (
            <EditDialog
              open
              initial={only.text}
              onClose={close}
              onSave={(text) => {
                close()
                run(() => live.act({ action: 'edit', itemIds: [only.itemId], text }))
              }}
            />
          )}
          {dialog === 'tag' && (
            <TagDialog
              open
              scenario={props.scenario}
              onClose={close}
              onSave={(tags) => {
                close()
                run(() => live.act({ action: 'tag', itemIds: ids, tags }))
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
