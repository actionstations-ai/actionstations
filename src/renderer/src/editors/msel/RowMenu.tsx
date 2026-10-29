// The "Row actions" menu of an MSEL row: add after, duplicate, move to phase, delete.
import { DropdownMenu } from 'radix-ui'
import { MoreHorizontal } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { focusProps, useGridActions, useGridShared, type RowAction } from './grid-context'
import type { DraftRow } from './model'

/**
 * React passes key events from the portalled menu up to the grid, whose arrow keys and Enter
 * would move the active cell and close the menu: keep them in the menu.
 */
const keepInMenu = (e: KeyboardEvent): void => e.stopPropagation()

function MoveToPhase({ r }: { r: DraftRow }) {
  const g = useGridActions()
  const { phases } = useGridShared()
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="msel-menu__item">Move to phase</DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className="msel-menu" onKeyDown={keepInMenu}>
          {phases.map((p) => (
            <DropdownMenu.Item
              key={p.id}
              className="msel-menu__item"
              disabled={p.id === r.row.phaseId}
              onSelect={() => g.rowAction(r.key, `move:${p.id}`)}
            >
              Phase {p.index + 1}: {p.title}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  )
}

export function RowMenu({ r, active }: { r: DraftRow; active: boolean }) {
  const g = useGridActions()
  const item = (action: RowAction, label: string) => (
    <DropdownMenu.Item className="msel-menu__item" onSelect={() => g.rowAction(r.key, action)}>
      {label}
    </DropdownMenu.Item>
  )
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--icon"
          aria-label={`Actions for ${r.row.id}`}
          {...focusProps(g, r.key, 'actions', active)}
        >
          <MoreHorizontal size={14} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="msel-menu"
          align="end"
          sideOffset={4}
          onKeyDown={keepInMenu}
        >
          {item('add-after', 'Add row after')}
          {item('duplicate', 'Duplicate row')}
          <MoveToPhase r={r} />
          {item('sources', 'Source check…')}
          {item(
            'clocks',
            r.row.triggers?.length ? 'Reporting clocks (on)…' : 'Starts reporting clocks…',
          )}
          <DropdownMenu.Separator className="msel-menu__separator" />
          <DropdownMenu.Item
            className="msel-menu__item msel-menu__item--danger"
            onSelect={() => g.rowAction(r.key, 'delete')}
          >
            Delete row…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
