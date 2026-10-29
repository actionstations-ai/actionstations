// MSEL grid editor (FR-6): inline editing, drag to retime, bulk shift, control cards,
// renumbering, lint warnings, undo/redo and snapshot history. Saves are optimistic and
// debounced; a running generation job (CONFLICT) never loses the user's edits.
import { useState, type KeyboardEvent } from 'react'
import type { Scenario } from '@shared/schemas/scenario'
import { useIpcQuery } from '../../lib/query'
import { isDirty } from './editor-state'
import { EditorDialogs } from './EditorDialogs'
import { useEditorDialogs, type DialogState } from './use-editor-dialogs'
import type { GridContextValue } from './grid-context'
import { LintBar } from './LintBar'
import { SourceCheckBar } from './SourceCheckBar'
import { GroundingDetails } from '../../components/GroundingDetails'
import { MselGrid } from './MselGrid'
import { BulkBar, MselToolbar } from './MselToolbar'
import { addRowAfter, moveToPhase, shiftTimes, type Draft, type Inserted } from './model'
import {
  applyDrop,
  insertEndex,
  insertStartex,
  renumberPreview,
  type ControlCard,
} from './operations'
import { SaveBanner, SaveStatus } from './SaveBanner'
import { useGridState, useRowWarnings, useSnap, type GridState } from './use-grid-state'
import { useMselEditor, type MselEditorApi } from './use-msel-editor'
import { useRowOps } from './use-row-ops'
import { useSelection } from './use-selection'
import './msel-editor.css'

const isTextTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** A request to focus a row from outside the editor ("Go to row" on Warnings); `n` repeats it. */
export interface RowJump {
  rowId: string
  n: number
}

/** Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y redoes (outside text fields and editors). */
function undoKeys(editor: MselEditorApi, editing: boolean) {
  return (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || isTextTarget(e.target) || editing) return
    const k = e.key.toLowerCase()
    if (k === 'z' || k === 'y') {
      e.preventDefault()
      if (k === 'y' || e.shiftKey) editor.redo()
      else editor.undo()
    }
  }
}

function EditorTop(props: {
  editor: MselEditorApi
  grid: GridState
  dialogs: DialogState
  scenario: Scenario
  applyInsert: (ins: Inserted | null) => void
  snap: [number, (step: number) => void]
}) {
  const { editor, grid, dialogs, scenario, applyInsert } = props
  const { state } = editor
  const draft = state.draft
  const [snap, setSnap] = props.snap
  const active = grid.active
  const insertControl = (card: ControlCard) => {
    if (card === 'TIME_JUMP') return dialogs.setTimeJump(true)
    applyInsert(
      card === 'STARTEX' ? insertStartex(draft, scenario.brief.startWallClock) : insertEndex(draft),
    )
  }
  const addRow = () =>
    applyInsert(
      addRowAfter(
        draft,
        draft.rows.find((r) => r.key === active?.line)?.key ?? null,
        active?.line.startsWith('phase:') ? active.line.slice(6) : undefined,
      ),
    )
  return (
    <div className="msel-editor__top">
      <MselToolbar
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        snap={snap}
        onSnap={setSnap}
        onAddRow={addRow}
        onControl={insertControl}
        onRenumber={() => dialogs.setRenames(renumberPreview(draft))}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onHistory={() => dialogs.setHistoryOpen(true)}
      />
      <SaveStatus status={state.status} />
    </div>
  )
}

/** Focus a row asked for from outside ("Go to row"), once per request. */
function useRowJump(jump: RowJump | undefined, jumpTo: (rowId: string) => void) {
  // State adjusted while rendering: a new request moves focus once.
  const [seenJump, setSeenJump] = useState<RowJump | undefined>()
  if (jump && jump !== seenJump) {
    setSeenJump(jump)
    jumpTo(jump.rowId)
  }
}

function useEditorModel(projectPath: string, scenario: Scenario, jump: RowJump | undefined) {
  const editor = useMselEditor(projectPath, scenario)
  const draft = editor.state.draft
  const lint = useIpcQuery('scenarios:lint', { projectPath, scenarioId: scenario.id })
  const warnings = useRowWarnings(lint.data)
  const sel = useSelection(draft)
  const grid = useGridState(draft)
  const dialogs = useEditorDialogs()
  const snap = useSnap()
  const grounding = useIpcQuery('grounding:scenario', { projectPath, scenarioId: scenario.id })
  const [sourcesRow, setSourcesRow] = useState<string | null>(null)
  const ops = useRowOps({
    draft,
    edit: editor.edit,
    grid,
    confirmDelete: dialogs.setConfirmDelete,
    toggleSelect: sel.toggle,
    togglePhaseSelect: sel.togglePhase,
    openSources: (key) => setSourcesRow(draft.rows.find((r) => r.key === key)?.row.id ?? null),
  })
  const ctx: GridContextValue = {
    actions: ops.actions,
    active: grid.active,
    editing: grid.editing,
    dragging: grid.dragging,
    roles: scenario.roles,
    phases: draft.phases,
    selected: sel.selected,
    warnings,
    grounding: grounding.data?.items,
  }
  const jumpTo = (rowId: string) => {
    const r = draft.rows.find((x) => x.row.id === rowId)
    if (r) grid.focus({ line: r.key, col: 'id' })
  }
  useRowJump(jump, jumpTo)
  const sources = { grounding, row: sourcesRow, open: setSourcesRow }
  return { editor, draft, lint, sel, grid, dialogs, ops, ctx, snap, jumpTo, sources }
}

export function MselEditor(props: { projectPath: string; scenario: Scenario; jump?: RowJump }) {
  const { projectPath, scenario } = props
  const m = useEditorModel(projectPath, scenario, props.jump)
  const { editor, draft, lint, sel, grid, dialogs, ops, ctx, snap, jumpTo, sources } = m
  const { state, edit } = editor

  return (
    <div className="msel-editor" onKeyDown={undoKeys(editor, !!grid.editing)}>
      <SaveBanner state={state} onRetry={editor.retryNow} />
      <EditorTop
        editor={editor}
        grid={grid}
        dialogs={dialogs}
        scenario={scenario}
        applyInsert={ops.applyInsert}
        snap={snap}
      />
      <LintBar warnings={lint.data} checking={lint.isFetching} onJump={jumpTo} />
      <SourceCheckBar
        projectPath={projectPath}
        scenarioId={scenario.id}
        items={sources.grounding.data?.items}
        loading={sources.grounding.isFetching}
        rowOrder={draft.rows.map((r) => r.row.id)}
        onJump={jumpTo}
        onDetails={sources.open}
      />
      {sel.selected.size > 0 && (
        <BulkBar
          count={sel.selected.size}
          phases={draft.phases}
          onShift={(delta) => edit(shiftTimes(draft, sel.selected, delta))}
          onMove={(phaseId) => edit(moveToPhase(draft, sel.selected, phaseId))}
          onClear={sel.clear}
        />
      )}
      <EditorGrid draft={draft} ctx={ctx} grid={grid} edit={edit} snap={snap[0]} />
      <EditorDialogs
        dialogs={dialogs}
        draft={draft}
        projectPath={projectPath}
        scenario={scenario}
        dirty={isDirty(state)}
        activeLine={grid.active?.line}
        edit={edit}
        applyInsert={ops.applyInsert}
        removeRow={ops.removeRow}
        onRestored={editor.reload}
      />
      <GroundingDetails
        projectPath={projectPath}
        scenarioId={scenario.id}
        itemKey={`row:${sources.row ?? ''}`}
        title={`Row ${sources.row ?? ''}`}
        result={sources.row ? sources.grounding.data?.items[`row:${sources.row}`] : undefined}
        open={!!sources.row}
        onOpenChange={(o) => !o && sources.open(null)}
      />
    </div>
  )
}

function EditorGrid(props: {
  draft: Draft
  ctx: GridContextValue
  grid: GridState
  edit: (next: Draft) => void
  snap: number
}) {
  const { draft, grid, edit, snap } = props
  if (!draft.rows.length && !draft.phases.length)
    return <p className="muted">The MSEL has no rows yet.</p>
  return (
    <MselGrid
      ctx={props.ctx}
      draft={draft}
      focusTick={grid.focusTick}
      setDragging={grid.setDragging}
      onFocusRequest={grid.requestFocus}
      onDrop={(order, key) => {
        edit(applyDrop(draft, order, key, snap) as Draft)
        grid.focus({ line: key, col: 'drag' })
      }}
    />
  )
}
