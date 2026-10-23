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

type Timer = { current: ReturnType<typeof setTimeout> | undefined }
type Ref<T> = { current: T }

/** Marks the editor dirty and (re)starts the autosave timer; `saveNow` is what it runs. */
function useAutosave(setDirty: (dirty: boolean) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveNowRef = useRef<() => void>(() => {})
  const changed = useCallback(() => {
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => saveNowRef.current(), AUTOSAVE_MS)
  }, [setDirty])
  return { timerRef, saveNowRef, changed }
}

/**
 * Leaving the document (switching tabs or documents) saves pending edits. Before quitting:
 * save now; an edit still refused (job running) is reported as unsaved.
 */
function useSaveOnLeave(
  label: string,
  dirty: boolean,
  timerRef: Timer,
  saveNowRef: Ref<() => void>,
  save: () => Promise<boolean>,
) {
  const dirtyRef = useLatest(dirty)
  useEffect(
    () => () => {
      clearTimeout(timerRef.current)
      if (dirtyRef.current) saveNowRef.current()
    },
    [dirtyRef, timerRef, saveNowRef],
  )
  useUnsavedSource(
    label,
    () => dirtyRef.current,
    () => save(),
  )
}

interface LoadDeps {
  data: string | undefined
  dirty: boolean
  editor: unknown
  savedRef: Ref<string | null>
  parkKey: string
  load: (markdown: string) => void
  setSource: (text: string) => void
  changed: () => void
}

/**
 * Load on first data, and again when the file changes underneath a clean editor
 * (regenerate, restore). Unsaved edits are never replaced. On first load an edit parked
 * when this document was last left (save refused during generation) is taken back.
 */
function useLoadDoc(d: LoadDeps) {
  const { data, dirty, editor, savedRef, parkKey, load, setSource, changed } = d
  useEffect(() => {
    if (data === undefined || !editor) return
    if (savedRef.current !== null && (dirty || data === savedRef.current)) return
    const first = savedRef.current === null
    savedRef.current = data
    const parked = first ? peekPending(parkKey) : undefined
    const text = parked ? (parked.value as { markdown: string }).markdown : data
    load(text)
    setSource(text)
    if (parked) {
      usePendingSaves.getState().drop(parkKey)
      changed()
    }
  }, [data, dirty, editor, savedRef, load, setSource, parkKey, changed])
}

/** Rich / source mode: switching carries the text across; source edits mark the doc dirty. */
function useSourceMode(
  load: (markdown: string) => void,
  serialize: () => string,
  changed: () => void,
) {
  const [mode, setMode] = useState<'rich' | 'source'>('rich')
  const [source, setSource] = useState('')
  const modeRef = useLatest(mode)
  const sourceRef = useLatest(source)
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
  return { mode, source, setSource, modeRef, sourceRef, toggleSource, editSource }
}

interface SaveDeps {
  ref: DocRef
  label: string
  parkKey: string
  savedRef: Ref<string | null>
  timerRef: Timer
  /** The editor's current text (rich or source). */
  current: () => string
  setDirty: (dirty: boolean) => void
  onSaved: (markdown: string) => void
}

/**
 * Saves through useGuardedSave (parked while a job owns the scenario). `save` skips the write
 * when nothing changed, unless forced (a history snapshot before regenerate / restore).
 */
function useDocSave(d: SaveDeps) {
  const { ref, savedRef, timerRef, current, setDirty } = d
  const writer = useGuardedSave(
    ({ markdown, note }: { markdown: string; note?: string | undefined }) =>
      call('scenarios:doc-save', { ...ref, markdown, ...(note ? { note } : {}) }),
    ({ markdown }) => {
      savedRef.current = markdown
      d.onSaved(markdown)
      setDirty(current() !== markdown)
    },
    { key: d.parkKey, scenarioId: ref.scenarioId, label: d.label },
  )
  const save = useCallback(
    async (note?: string, force = false): Promise<boolean> => {
      clearTimeout(timerRef.current)
      const markdown = current()
      if (!force && markdown === savedRef.current) {
        setDirty(false)
        return true
      }
      return writer.save({ markdown, note })
    },
    [current, writer, timerRef, savedRef, setDirty],
  )
  return { writer, save }
}

export function useDocEditor(ref: DocRef, label: string) {
  const surfaceId = useId()
  const doc = useIpcQuery('scenarios:doc-get', ref)
  const savedRef = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const { timerRef, saveNowRef, changed } = useAutosave(setDirty)
  const md = useMarkdownEditor({ label, surfaceId, onChange: changed })
  const { load, rebase, markdown: serialize, editor } = md
  const src = useSourceMode(load, serialize, changed)
  const { modeRef, sourceRef, setSource } = src
  const current = useCallback(
    () => (modeRef.current === 'source' ? sourceRef.current : serialize()),
    [serialize, modeRef, sourceRef],
  )
  const parkKey = pendingKey(ref.projectPath, ref.scenarioId, `doc:${ref.kind}`)
  const { writer, save } = useDocSave({
    ref,
    label,
    parkKey,
    savedRef,
    timerRef,
    current,
    setDirty,
    onSaved: (markdown) => {
      if (modeRef.current === 'rich') rebase(markdown)
    },
  })
  useLayoutEffect(() => {
    saveNowRef.current = () => void save()
  })
  useSaveOnLeave(label, dirty, timerRef, saveNowRef, save)
  const data = doc.data?.markdown
  useLoadDoc({ data, dirty, editor, savedRef, parkKey, load, setSource, changed })

  /** Restore a history entry after saving the current text to history. */
  const restore = useCallback(
    async (entryId: string) => {
      if (!(await save('Before restoring an earlier version', true))) return
      await call('scenarios:history-restore', { ...ref, artifact: ref.kind, entryId })
      const { markdown } = await call('scenarios:doc-get', ref)
      savedRef.current = markdown
      load(markdown)
      setSource(markdown)
      setDirty(false)
    },
    [load, ref, save, setSource],
  )

  return {
    ...md,
    surfaceId,
    doc,
    dirty,
    mode: src.mode,
    source: src.source,
    status: writer.status,
    error: writer.error,
    retry: writer.retry,
    save,
    current,
    toggleSource: src.toggleSource,
    editSource: src.editSource,
    restore,
  }
}
