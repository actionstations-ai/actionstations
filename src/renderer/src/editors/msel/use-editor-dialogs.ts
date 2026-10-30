// Which of the MSEL editor's dialogs and panels is open.
import { useState } from 'react'
import type { Rename } from './operations'

export function useEditorDialogs() {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [timeJump, setTimeJump] = useState(false)
  const [renames, setRenames] = useState<Rename[] | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [triggersFor, setTriggersFor] = useState<string | null>(null)
  const [controlsFor, setControlsFor] = useState<string | null>(null)
  return {
    controlsFor,
    setControlsFor,
    triggersFor,
    setTriggersFor,
    confirmDelete,
    setConfirmDelete,
    timeJump,
    setTimeJump,
    renames,
    setRenames,
    historyOpen,
    setHistoryOpen,
  }
}

export type DialogState = ReturnType<typeof useEditorDialogs>
