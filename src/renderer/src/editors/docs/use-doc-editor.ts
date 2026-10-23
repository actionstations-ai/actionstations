// State for one markdown document editor: load from disk, dirty tracking, debounced
// autosave, explicit save, source mode, snapshots before regenerate/restore.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ScenarioDocKind } from '@shared/schemas/scenario'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { useMarkdownEditor } from './markdown/use-markdown-editor'
import { pendingKey, peekPending, usePendingSaves } from './pending-saves'
import { useGuardedSave } from './use-guarded-save'
import { useLatest } from './use-latest'
import { useUnsavedSource } from '../unsaved-work'

export const AUTOSAVE_MS = 1500

export interface DocRef {
  projectPath: string
  scenarioId: string
  kind: ScenarioDocKind
}

export function useDocEditor(ref: DocRef, label: string) {
  const surfaceId = useId()
  const doc = useIpcQuery('scenarios:doc-get', ref)
  const saved = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<'rich' | 'source'>('rich')
  const [source, setSource] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveNow = useRef<() => void>(() => {})

  const changed = useCallback(() => {
    setDirty(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveNow.current(), AUTOSAVE_MS)
  }, [])
  const md = useMarkdownEditor({ label, surfaceId, onChange: changed })
  const modeRef = useLatest(mode)
  const sourceRef = useLatest(source)
  const { load, rebase, markdown: serialize, editor } = md
  const current = useCallback(
    () => (modeRef.current === 'source' ? sourceRef.current : serialize()),
    [serialize, modeRef, sourceRef],
  )
  const parkKey = pendingKey(ref.projectPath, ref.scenarioId, `doc:${ref.kind}`)
  const writer = useGuardedSave(
    ({ markdown, note }: { markdown: string; note?: string | undefined }) =>
      call('scenarios:doc-save', { ...ref, markdown, ...(note ? { note } : {}) }),
    ({ markdown }) => {
      saved.current = markdown
      if (modeRef.current === 'rich') rebase(markdown)
      setDirty(current() !== markdown)
    },
    { key: parkKey, scenarioId: ref.scenarioId, label },
  )

  const save = useCallback(
    async (note?: string, force = false): Promise<boolean> => {
      clearTimeout(timer.current)
      const markdown = current()
      if (!force && markdown === saved.current) {
        setDirty(false)
        return true
      }
      return writer.save({ markdown, note })
    },
    [current, writer],
  )
  useLayoutEffect(() => {
    saveNow.current = () => void save()
  })
  const dirtyRef = useLatest(dirty)
  // Leaving the document (switching tabs or documents) saves pending edits.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (dirtyRef.current) saveNow.current()
    },
    [dirtyRef],
  )
  // Before quitting: save now; an edit still refused (job running) is reported as unsaved.
  useUnsavedSource(
    label,
    () => dirtyRef.current,
    () => save(),
  )

  // Load on first data, and again when the file changes underneath a clean editor
  // (regenerate, restore). Unsaved edits are never replaced. On first load an edit parked
  // when this document was last left (save refused during generation) is taken back.
  const data = doc.data?.markdown
  useEffect(() => {
    if (data === undefined || !editor) return
    if (saved.current !== null && (dirty || data === saved.current)) return
    const first = saved.current === null
    saved.current = data
    const parked = first ? peekPending(parkKey) : undefined
    const text = parked ? (parked.value as { markdown: string }).markdown : data
    load(text)
    setSource(text)
    if (parked) {
      usePendingSaves.getState().drop(parkKey)
      changed()
    }
  }, [data, dirty, editor, load, parkKey, changed])

  const toggleSource = useCallback(() => {
    if (modeRef.current === 'rich') {
      setSource(serialize())
      setMode('source')
    } else {
      load(sourceRef.current)
      setMode('rich')
    }
  }, [load, serialize, modeRef, sourceRef])

  const editSource = useCallback(
    (text: string) => {
      setSource(text)
      changed()
    },
    [changed],
  )

  /** Restore a history entry after saving the current text to history. */
  const restore = useCallback(
    async (entryId: string) => {
      if (!(await save('Before restoring an earlier version', true))) return
      await call('scenarios:history-restore', { ...ref, artifact: ref.kind, entryId })
      const { markdown } = await call('scenarios:doc-get', ref)
      saved.current = markdown
      load(markdown)
      setSource(markdown)
      setDirty(false)
    },
    [load, ref, save],
  )

  return {
    ...md,
    surfaceId,
    doc,
    dirty,
    mode,
    source,
    status: writer.status,
    error: writer.error,
    retry: writer.retry,
    save,
    current,
    toggleSource,
    editSource,
    restore,
  }
}
