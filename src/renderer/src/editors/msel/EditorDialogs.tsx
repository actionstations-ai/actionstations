// The MSEL editor's dialogs and panels: delete with inject, time jump, renumber, reporting
// clocks a row starts (#426), history.
import type { Scenario } from '@shared/schemas/scenario'
import { DeleteRowDialog, RenumberDialog, TimeJumpDialog } from './dialogs'
import { HistoryPanel } from './HistoryPanel'
import { TriggersDialog } from './TriggersDialog'
import { draftMsel, type Draft, type Inserted } from './model'
import { applyRenames, insertTimeJump } from './operations'
import type { DialogState } from './use-editor-dialogs'

/** Default phase for a new time jump: the one after the active row's phase. */
function nextPhaseId(d: Draft, phaseId: string | undefined): string {
  const i = d.phases.findIndex((p) => p.id === phaseId)
  return (d.phases[i + 1] ?? d.phases[i] ?? d.phases[0])?.id ?? ''
}

interface Props {
  dialogs: DialogState
  draft: Draft
  projectPath: string
  scenario: Scenario
  dirty: boolean
  /** The grid's active line: a time jump defaults to the phase after its row's phase. */
  activeLine: string | undefined
  edit: (next: Draft) => void
  applyInsert: (ins: Inserted | null) => void
  removeRow: (key: string) => void
  onRestored: () => Promise<void>
}

export function EditorDialogs(p: Props) {
  const { dialogs: s, draft } = p
  return (
    <>
      <DeleteRowDialog
        row={draft.rows.find((r) => r.key === s.confirmDelete)?.row ?? null}
        onCancel={() => s.setConfirmDelete(null)}
        onConfirm={() => {
          if (s.confirmDelete) p.removeRow(s.confirmDelete)
          s.setConfirmDelete(null)
        }}
      />
      <TimeJumpDialog
        open={s.timeJump}
        phases={draft.phases}
        rows={draft.rows.map((r) => r.row)}
        defaultPhaseId={nextPhaseId(
          draft,
          draft.rows.find((r) => r.key === p.activeLine)?.row.phaseId,
        )}
        onCancel={() => s.setTimeJump(false)}
        onInsert={(input) => {
          s.setTimeJump(false)
          p.applyInsert(insertTimeJump(draft, input))
        }}
      />
      <RenumberDialog
        renames={s.renames}
        onCancel={() => s.setRenames(null)}
        onApply={() => {
          if (s.renames) p.edit(applyRenames(draft, s.renames))
          s.setRenames(null)
        }}
      />
      <TriggersDialog
        projectPath={p.projectPath}
        row={draft.rows.find((r) => r.key === s.triggersFor)?.row ?? null}
        onCancel={() => s.setTriggersFor(null)}
        onSave={(triggers) => {
          const key = s.triggersFor
          s.setTriggersFor(null)
          if (key)
            p.edit({
              ...draft,
              rows: draft.rows.map((r) =>
                r.key === key ? { ...r, row: { ...r.row, triggers } } : r,
              ),
            })
        }}
      />
      <HistoryPanel
        open={s.historyOpen}
        projectPath={p.projectPath}
        scenarioId={p.scenario.id}
        current={draftMsel(draft)}
        dirty={p.dirty}
        onClose={() => s.setHistoryOpen(false)}
        onRestored={p.onRestored}
      />
    </>
  )
}
