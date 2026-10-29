// A past session's hot wash board (#415 FR-11): the same columns and items as the live board,
// rebuilt from the session log and read only.
import type { BoardView } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { useIpcQuery } from '../../../lib/query'
import { BoardItem } from './BoardItem'
import { COLUMNS, cellsFor, type Cell } from './hotwash-model'

function CellRow({ cell, scenario }: { cell: Cell; scenario: Scenario }) {
  if (cell.type === 'item')
    return (
      <BoardItem
        item={cell.item}
        scenario={scenario}
        selected={false}
        onSelect={() => undefined}
        readOnly
      />
    )
  const name = cell.group.label || 'Unnamed group'
  return (
    <li className="fac-hw__group" data-promoted={cell.group.promoted || undefined}>
      <strong>{name}</strong>{' '}
      <span className="fac-hint">
        {cell.items.length} items · ▲ {cell.plus}
        {cell.group.promoted ? ' · Promoted' : ''}
      </span>
      <ul className="fac-hw__list" aria-label={`Items in ${name}`}>
        {cell.items.map((item) => (
          <BoardItem
            key={item.itemId}
            item={item}
            scenario={scenario}
            selected={false}
            onSelect={() => undefined}
            readOnly
          />
        ))}
      </ul>
    </li>
  )
}

export function PastHotWashView({ board, scenario }: { board: BoardView; scenario: Scenario }) {
  if (board.items.length === 0) {
    return <p className="muted">This session has no hot wash items.</p>
  }
  return (
    <div className="fac-hw__columns">
      {COLUMNS.map((col) => {
        const cells = cellsFor(board, col.kind)
        return (
          <section key={col.kind} className="fac-hw__col" aria-labelledby={`past-hw-${col.kind}`}>
            <h4 id={`past-hw-${col.kind}`}>
              {col.title} ({cells.length})
            </h4>
            {cells.length === 0 ? (
              <p className="fac-hint">Nothing here.</p>
            ) : (
              <ul className="fac-hw__list">
                {cells.map((cell) => (
                  <CellRow
                    key={cell.type === 'group' ? cell.group.groupId : cell.item.itemId}
                    cell={cell}
                    scenario={scenario}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

export function PastHotWash(props: { projectPath: string; scenario: Scenario; sessionId: string }) {
  const board = useIpcQuery('live:hotwash-past', {
    projectPath: props.projectPath,
    scenarioId: props.scenario.id,
    sessionId: props.sessionId,
  })
  if (board.isLoading) return <p className="muted">Loading…</p>
  if (board.error) {
    return (
      <p className="field__error" role="alert">
        {board.error.message}
      </p>
    )
  }
  if (!board.data) return null
  return (
    <section aria-label="Hot wash of this session" className="fac-hw">
      <h3 className="room-heading">Hot wash of this session</h3>
      <PastHotWashView board={board.data} scenario={props.scenario} />
    </section>
  )
}
