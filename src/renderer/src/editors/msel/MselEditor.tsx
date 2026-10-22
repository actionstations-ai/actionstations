// MSEL grid editor (FR-6): inline editing, drag to retime, bulk shift, control cards,
// renumbering, lint warnings, undo/redo and snapshot history. Saves are optimistic and
// debounced; a running generation job (CONFLICT) never loses the user's edits.
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import type { Scenario } from '@shared/schemas/scenario'
import { toast } from '../../components/toast-store'
import { Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import type { Move } from './CellEditors'
import { commitCell, tabTarget } from './cell-commit'
import { isDirty, type EditorState } from './editor-state'
import { DeleteRowDialog, RenumberDialog, TimeJumpDialog } from './dialogs'
import type { GridContextValue, RowAction } from './grid-context'
import type { Cell } from './grid-nav'
import { HistoryPanel } from './HistoryPanel'
import { LintBar } from './LintBar'
import { warningsByRow } from './cell-format'
import { MselGrid } from './MselGrid'
import { BulkBar, MselToolbar } from './MselToolbar'
import {
  addRowAfter,
  deleteRows,
  draftMsel,
  duplicateRow,
  moveToPhase,
  shiftTimes,
  type Draft,
  type Inserted,
} from './model'
import {
  applyDrop,
  applyRenames,
  insertEndex,
  insertStartex,
  insertTimeJump,
  lineKeys,
  renumberPreview,
  type ControlCard,
  type Rename,
} from './operations'
import { useMselEditor } from './use-msel-editor'
import { useSelection } from './use-selection'
import './msel-editor.css'

const SNAP_KEY = 'ttx.msel.snap'

function readSnap(): number {
  try {
    const v = Number(localStorage.getItem(SNAP_KEY))
    return v > 0 ? v : 5
  } catch {
    return 5
  }
}

function saveSnap(step: number): void {
  try {
    localStorage.setItem(SNAP_KEY, String(step))
  } catch {
    // Storage may be unavailable; the default step still works.
  }
}

const STATUS_TEXT: Record<EditorState['status'], string> = {
  idle: '',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  saved: 'All changes saved',
  conflict: 'Waiting for generation to finish',
  error: 'Not saved',
}

function SaveBanner(props: { state: EditorState; onRetry: () => void }) {
  const { status, error } = props.state
  if (status !== 'conflict' && status !== 'error') return null
  return (
    <div className="msel-editor__banner" role="alert">
      <span>
        {status === 'conflict'
          ? 'Generation is running for this scenario. Your edits are kept here and will be saved when it finishes.'
          : `Could not save: ${error ?? 'unknown error'}. Your edits are kept here.`}
      </span>
      <Button size="sm" onClick={props.onRetry}>
        Retry now
      </Button>
    </div>
  )
}

const isTextTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

export function MselEditor(props: { projectPath: string; scenario: Scenario }) {
  const { projectPath, scenario } = props
  const editor = useMselEditor(projectPath, scenario)
  const { state, edit } = editor
  const draft = state.draft
  const lint = useIpcQuery('scenarios:lint', { projectPath, scenarioId: scenario.id })
  const warnings = useMemo(() => warningsByRow(lint.data), [lint.data])
  const sel = useSelection(draft)

  const [activeRaw, setActive] = useState<Cell | null>(null)
  const [editing, setEditing] = useState<Cell | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [snap, setSnap] = useState(readSnap)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [timeJump, setTimeJump] = useState(false)
  const [renames, setRenames] = useState<Rename[] | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const lines = useMemo(
    () =>
      lineKeys(draft).map((key) => ({
        key,
        kind: key.startsWith('phase:') ? ('phase' as const) : ('row' as const),
      })),
    [draft],
  )
  // Fall back to the first cell so the grid always has one tab stop.
  const active = useMemo<Cell | null>(() => {
    if (activeRaw && lines.some((l) => l.key === activeRaw.line)) return activeRaw
    const first = lines.find((l) => l.kind === 'row') ?? lines[0]
    return first ? { line: first.key, col: first.kind === 'row' ? 'time' : 'event' } : null
  }, [activeRaw, lines])

  const focus = useCallback((cell: Cell) => {
    setActive(cell)
    setFocusTick((t) => t + 1)
  }, [])

  const applyInsert = useCallback(
    (ins: Inserted | null) => {
      if (!ins) return
      edit(ins.draft)
      focus({ line: ins.key, col: 'event' })
    },
    [edit, focus],
  )

  const removeRow = useCallback(
    (key: string) => {
      const row = draft.rows.find((r) => r.key === key)?.row
      const idx = lines.findIndex((l) => l.key === key)
      edit(deleteRows(draft, new Set([key])))
      const neighbour = lines[idx + 1]?.key ?? lines[idx - 1]?.key
      if (neighbour) focus({ line: neighbour, col: 'id' })
      if (row) toast.info(`Deleted ${row.id}`, 'Undo with Cmd/Ctrl+Z.')
    },
    [draft, lines, edit, focus],
  )

  const rowAction = useCallback(
    (key: string, action: RowAction) => {
      if (action === 'add-after') return applyInsert(addRowAfter(draft, key))
      if (action === 'duplicate') return applyInsert(duplicateRow(draft, key))
      if (action.startsWith('move:')) {
        edit(moveToPhase(draft, new Set([key]), action.slice(5)))
        return focus({ line: key, col: 'time' })
      }
      const row = draft.rows.find((r) => r.key === key)?.row
      if (row?.injectId) setConfirmDelete(key)
      else removeRow(key)
    },
    [draft, edit, focus, applyInsert, removeRow],
  )

  const commit = useCallback(
    (cell: Cell, value: unknown, move: Move) => {
      edit(commitCell(draft, cell, value))
      if (move === 'blur') return setEditing(null)
      const tab = move && !cell.line.startsWith('phase:') ? tabTarget(lines, cell, move) : null
      setEditing(tab)
      if (tab) setActive(tab)
      else focus(cell)
    },
    [draft, lines, edit, focus],
  )

  const ctx: GridContextValue = {
    active,
    editing,
    dragging,
    roles: scenario.roles,
    phases: draft.phases,
    selected: sel.selected,
    warnings,
    activate: setActive,
    startEdit: (cell) => {
      setActive(cell)
      setEditing(cell)
    },
    commit,
    cancelEdit: () => {
      setEditing(null)
      setFocusTick((t) => t + 1)
    },
    toggleSelect: sel.toggle,
    togglePhaseSelect: sel.togglePhase,
    toggleLock: (key) => {
      const row = draft.rows.find((r) => r.key === key)?.row
      if (row)
        edit({
          ...draft,
          rows: draft.rows.map((r) =>
            r.key === key ? { ...r, row: { ...row, locked: !row.locked } } : r,
          ),
        })
    },
    rowAction,
  }

  const insertControl = (card: ControlCard) => {
    if (card === 'TIME_JUMP') return setTimeJump(true)
    applyInsert(
      card === 'STARTEX' ? insertStartex(draft, scenario.brief.startWallClock) : insertEndex(draft),
    )
  }

  const jumpTo = (rowId: string) => {
    const r = draft.rows.find((x) => x.row.id === rowId)
    if (r) focus({ line: r.key, col: 'id' })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || isTextTarget(e.target) || editing) return
    const k = e.key.toLowerCase()
    if (k === 'z' || k === 'y') {
      e.preventDefault()
      if (k === 'y' || e.shiftKey) editor.redo()
      else editor.undo()
    }
  }

  const activeRow = draft.rows.find((r) => r.key === active?.line)
  const dirty = isDirty(state)

  return (
    <div className="msel-editor" onKeyDown={onKeyDown}>
      <SaveBanner state={state} onRetry={editor.retryNow} />
      <div className="msel-editor__top">
        <MselToolbar
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
          snap={snap}
          onSnap={(s) => {
            setSnap(s)
            saveSnap(s)
          }}
          onAddRow={() =>
            applyInsert(
              addRowAfter(
                draft,
                activeRow?.key ?? null,
                active?.line.startsWith('phase:') ? active.line.slice(6) : undefined,
              ),
            )
          }
          onControl={insertControl}
          onRenumber={() => setRenames(renumberPreview(draft))}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onHistory={() => setHistoryOpen(true)}
        />
        <span className="msel-editor__status muted" role="status" aria-live="polite">
          {STATUS_TEXT[state.status]}
        </span>
      </div>
      <LintBar warnings={lint.data} checking={lint.isFetching} onJump={jumpTo} />
      {sel.selected.size > 0 && (
        <BulkBar
          count={sel.selected.size}
          phases={draft.phases}
          onShift={(delta) => edit(shiftTimes(draft, sel.selected, delta))}
          onMove={(phaseId) => edit(moveToPhase(draft, sel.selected, phaseId))}
          onClear={sel.clear}
        />
      )}
      {draft.rows.length || draft.phases.length ? (
        <MselGrid
          ctx={ctx}
          draft={draft}
          focusTick={focusTick}
          setDragging={setDragging}
          onFocusRequest={() => setFocusTick((t) => t + 1)}
          onDrop={(order, key) => {
            edit(applyDrop(draft, order, key, snap) as Draft)
            focus({ line: key, col: 'drag' })
          }}
        />
      ) : (
        <p className="muted">The MSEL has no rows yet.</p>
      )}
      <DeleteRowDialog
        row={draft.rows.find((r) => r.key === confirmDelete)?.row ?? null}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeRow(confirmDelete)
          setConfirmDelete(null)
        }}
      />
      <TimeJumpDialog
        open={timeJump}
        phases={draft.phases}
        rows={draft.rows.map((r) => r.row)}
        defaultPhaseId={nextPhaseId(draft, activeRow?.row.phaseId)}
        onCancel={() => setTimeJump(false)}
        onInsert={(input) => {
          setTimeJump(false)
          applyInsert(insertTimeJump(draft, input))
        }}
      />
      <RenumberDialog
        renames={renames}
        onCancel={() => setRenames(null)}
        onApply={() => {
          if (renames) edit(applyRenames(draft, renames))
          setRenames(null)
        }}
      />
      <HistoryPanel
        open={historyOpen}
        projectPath={projectPath}
        scenarioId={scenario.id}
        current={draftMsel(draft)}
        dirty={dirty}
        onClose={() => setHistoryOpen(false)}
        onRestored={editor.reload}
      />
    </div>
  )
}

/** Default phase for a new time jump: the one after the active row's phase. */
function nextPhaseId(d: Draft, phaseId: string | undefined): string {
  const i = d.phases.findIndex((p) => p.id === phaseId)
  return (d.phases[i + 1] ?? d.phases[i] ?? d.phases[0])?.id ?? ''
}
