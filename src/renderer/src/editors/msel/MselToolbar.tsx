// Toolbar (add row, control cards, renumber, undo/redo, snap, history) and the bulk bar.
import { DropdownMenu } from 'radix-ui'
import { History, Plus, Redo2, Undo2 } from 'lucide-react'
import { useId, useState } from 'react'
import type { Phase } from '@shared/schemas/scenario'
import { Button } from '../../components/ui'
import type { ControlCard } from './operations'

const SNAP_STEPS = [1, 5, 10, 15] as const

interface ToolbarProps {
  canUndo: boolean
  canRedo: boolean
  snap: number
  onSnap: (step: number) => void
  onAddRow: () => void
  onControl: (card: ControlCard) => void
  onRenumber: () => void
  onUndo: () => void
  onRedo: () => void
  onHistory: () => void
  /** The Criteria column (#421): shown, and the toggle. */
  showCriteria: boolean
  onToggleCriteria: () => void
}

const isMac = () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

export function MselToolbar(p: ToolbarProps) {
  const snapId = useId()
  const mod = isMac() ? '⌘' : 'Ctrl+'
  return (
    <div className="msel-editor__toolbar" role="toolbar" aria-label="MSEL tools">
      <Button size="sm" onClick={p.onAddRow}>
        <Plus size={14} aria-hidden /> Add row
      </Button>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <Button size="sm">Insert control card</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="msel-menu" align="start" sideOffset={4}>
            <DropdownMenu.Item className="msel-menu__item" onSelect={() => p.onControl('STARTEX')}>
              STARTEX
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="msel-menu__item"
              onSelect={() => p.onControl('TIME_JUMP')}
            >
              Time jump…
            </DropdownMenu.Item>
            <DropdownMenu.Item className="msel-menu__item" onSelect={() => p.onControl('ENDEX')}>
              ENDEX
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Button size="sm" onClick={p.onRenumber}>
        Renumber IDs…
      </Button>
      <span className="msel-editor__sep" aria-hidden />
      <Button
        size="sm"
        variant="ghost"
        icon
        disabled={!p.canUndo}
        onClick={p.onUndo}
        aria-label="Undo"
        title={`Undo (${mod}Z)`}
      >
        <Undo2 size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon
        disabled={!p.canRedo}
        onClick={p.onRedo}
        aria-label="Redo"
        title={`Redo (${mod}Shift+Z)`}
      >
        <Redo2 size={14} aria-hidden />
      </Button>
      <Button size="sm" variant="ghost" onClick={p.onHistory}>
        <History size={14} aria-hidden /> History
      </Button>
      <Button size="sm" variant="ghost" aria-pressed={p.showCriteria} onClick={p.onToggleCriteria}>
        Criteria column
      </Button>
      <label className="msel-editor__snap" htmlFor={snapId}>
        Drag snaps to
        <select
          id={snapId}
          className="select"
          value={p.snap}
          onChange={(e) => p.onSnap(Number(e.target.value))}
        >
          {SNAP_STEPS.map((s) => (
            <option key={s} value={s}>
              {s} min
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

interface BulkProps {
  count: number
  phases: Phase[]
  onShift: (delta: number) => void
  onMove: (phaseId: string) => void
  onClear: () => void
}

export function BulkBar(p: BulkProps) {
  const [delta, setDelta] = useState('10')
  const [phaseId, setPhaseId] = useState(p.phases[0]?.id ?? '')
  const shiftId = useId()
  const phaseSel = useId()
  const n = Number(delta)
  const valid = delta.trim() !== '' && Number.isInteger(n) && n !== 0
  return (
    <section className="msel-editor__bulk" aria-label="Selected rows">
      <strong role="status">
        {p.count} row{p.count === 1 ? '' : 's'} selected
      </strong>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) p.onShift(n)
        }}
      >
        <label htmlFor={shiftId}>Shift times by</label>
        <input
          id={shiftId}
          className="input msel-editor__num"
          type="number"
          step={5}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
        <span>min</span>
        <Button size="sm" type="submit" disabled={!valid}>
          Shift
        </Button>
      </form>
      <div className="row">
        <label htmlFor={phaseSel}>Move to</label>
        <select
          id={phaseSel}
          className="select msel-editor__phase-select"
          value={phaseId}
          onChange={(e) => setPhaseId(e.target.value)}
        >
          {p.phases.map((ph) => (
            <option key={ph.id} value={ph.id}>
              Phase {ph.index + 1}: {ph.title}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => p.onMove(phaseId)}>
          Move
        </Button>
      </div>
      <Button size="sm" variant="ghost" onClick={p.onClear}>
        Clear selection
      </Button>
    </section>
  )
}
