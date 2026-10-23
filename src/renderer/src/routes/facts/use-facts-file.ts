// State of the facility facts page: the loaded facility-facts.md, the working copy made
// from it, and the writes (save, reset, reload after a conflict) that replace both.
import { useCallback, useEffect, useState } from 'react'
import type { FacilityFactsFile } from '@shared/ipc/project'
import { toast } from '../../components/toast-store'
import { call, subscribe } from '../../lib/api'
import { errorText, isConflictError } from '../../lib/errors'
import { queryClient, useIpcMutation } from '../../lib/query'
import { draftFrom, isDirty, toSaveCategories, type DraftCategory } from './facts-draft'

export const QUERY = 'project:facility-facts'

/** Re-read the file when main reports a project or document change for this project. */
export function useProjectChanged(path: string) {
  useEffect(
    () =>
      subscribe('project:changed', (e) => {
        if (e.path !== path || (e.what !== 'project' && e.what !== 'documents')) return
        void queryClient.invalidateQueries({ queryKey: [QUERY] })
      }),
    [path],
  )
}

/** The loaded file and the working copy made from it. */
export function useFactsDraft(data: FacilityFactsFile | undefined) {
  const [base, setBase] = useState<FacilityFactsFile | undefined>(undefined)
  const [draft, setDraft] = useState<DraftCategory[]>([])
  const dirty = !!base && isDirty(base, draft)
  const adopt = useCallback((view: FacilityFactsFile) => {
    setBase(view)
    setDraft(draftFrom(view))
  }, [])
  // A fresh read replaces the working copy unless it holds unsaved edits (state adjusted
  // during render, React's pattern for state derived from props).
  if (data && data !== base && (!base || !dirty)) {
    setBase(data)
    setDraft(draftFrom(data))
  }
  // The file changed underneath unsaved edits (another editor, or a re-ingest).
  const stale = !!data && !!base && dirty && data.revision !== base.revision
  return { base, draft, setDraft, dirty, stale, adopt }
}

/** Ctrl/Cmd+S runs `onSave` from anywhere on the page. */
export function useSaveShortcut(onSave: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave])
}

interface WriteContext {
  path: string
  base: FacilityFactsFile | undefined
  draft: DraftCategory[]
  dirty: boolean
  adopt: (view: FacilityFactsFile) => void
  /** Re-check the scenarios after a write. */
  relint: () => unknown
}

/** A new version of the file was written or read: cache it, adopt it, clear the conflict. */
function useAdoptView(c: WriteContext, setConflict: (on: boolean) => void) {
  const { path, adopt } = c
  return useCallback(
    (view: FacilityFactsFile) => {
      queryClient.setQueryData([QUERY, { path }], view)
      adopt(view)
      setConflict(false)
    },
    [path, adopt, setConflict],
  )
}

/** A CONFLICT keeps the edits and offers a reload; anything else is a toast. */
function onSaveError(err: unknown, setConflict: (on: boolean) => void) {
  if (isConflictError(err)) setConflict(true)
  else toast.error('Could not save the facility facts', errorText(err))
}

/** Read the file again (after a conflict) and take it as the new base. */
async function reloadFile(path: string, take: (view: FacilityFactsFile) => void) {
  try {
    take(await call(QUERY, { path }))
  } catch (err) {
    toast.error('Could not read the facility facts', errorText(err))
  }
}

/** Save, reset and reload of facility-facts.md, with the conflict and announcement they set. */
export function useFactsWrites(c: WriteContext) {
  const save = useIpcMutation('project:facility-facts-save', { invalidates: ['scenarios:lint'] })
  const reset = useIpcMutation('project:facility-facts-reset', { invalidates: ['scenarios:lint'] })
  const [conflict, setConflict] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [announce, setAnnounce] = useState('')
  const take = useAdoptView(c, setConflict)
  const { path, base, dirty, draft, relint } = c

  const written = useCallback(
    (view: FacilityFactsFile, message: string) => {
      take(view)
      setAnnounce(message)
      toast.success(message)
      void relint()
    },
    [take, relint],
  )

  const onSave = useCallback(() => {
    if (!base || !dirty || save.isPending) return
    save.mutate(
      { path, revision: base.revision, categories: toSaveCategories(draft) },
      {
        onSuccess: (view) => written(view, 'Facility facts saved'),
        onError: (err) => onSaveError(err, setConflict),
      },
    )
  }, [base, dirty, draft, path, save, written])

  const onReset = () =>
    reset.mutate(
      { path },
      {
        onSuccess: (view) => {
          setConfirmReset(false)
          written(view, 'Facility facts reset to the extracted version')
        },
        onError: (err) => toast.error('Could not reset the facility facts', errorText(err)),
      },
    )

  return {
    saving: save.isPending,
    resetting: reset.isPending,
    conflict,
    confirmReset,
    setConfirmReset,
    announce,
    onSave,
    onReset,
    reload: () => reloadFile(path, take),
  }
}
