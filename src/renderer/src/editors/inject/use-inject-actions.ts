// Editor actions over IPC. Saves merge the draft onto the latest stored inject. While a
// generation job owns the scenario a save answers CONFLICT: the draft is kept, a banner says
// so, and the save runs again when the job finishes (the caller calls retryPending on job:done).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Inject } from '@shared/schemas/inject'
import type { JobKind } from '@shared/schemas/job'
import { toast } from '../../components/toast-store'
import { call, IpcError } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { applyDraft, draftKey, useDrafts, type InjectDraft } from './draft'
import type { RenderPathId } from './media-utils'

export interface ActionContext {
  projectPath: string
  scenarioId: string
  injectId: string
  draft: InjectDraft
  dirty: boolean
  track: (jobId: string, kind: JobKind) => void
}

const isConflict = (e: unknown) => e instanceof IpcError && e.code === 'CONFLICT'
const WAIT = 'Generation is running for this scenario; try again when it finishes'

function refresh() {
  for (const key of ['injects:get', 'injects:list', 'scenarios:get'])
    void queryClient.invalidateQueries({ queryKey: [key] })
}

const idsOf = (c: ActionContext) => ({
  projectPath: c.projectPath,
  scenarioId: c.scenarioId,
  injectId: c.injectId,
})

async function writeInject(c: ActionContext, build: (latest: Inject) => Inject, note?: string) {
  const ids = idsOf(c)
  const latest = await call('injects:get', ids)
  const saved = await call('injects:save', {
    projectPath: c.projectPath,
    scenarioId: c.scenarioId,
    inject: build(latest),
    ...(note ? { note } : {}),
  })
  queryClient.setQueryData(['injects:get', ids], saved)
  refresh()
  return saved
}

export function useInjectActions(ctx: ActionContext) {
  const [pendingSave, setPendingSave] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const ctxRef = useRef(ctx)
  useEffect(() => {
    ctxRef.current = ctx
  })

  /** Save the draft. Resolves true when stored; false when queued behind a job or failed. */
  const save = useCallback(async (): Promise<boolean> => {
    const c = ctxRef.current
    setBusy('save')
    try {
      await writeInject(c, (latest) => applyDraft(latest, c.draft))
      useDrafts.getState().drop(draftKey(c.scenarioId, c.injectId))
      setPendingSave(false)
      toast.success('Inject saved')
      return true
    } catch (e) {
      if (isConflict(e)) setPendingSave(true)
      else toast.error('Save failed', e)
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  const retryPending = useCallback(() => {
    if (pendingSave) void save()
  }, [pendingSave, save])

  const render = useCallback(async () => {
    if (ctxRef.current.dirty && !(await save())) return null
    setBusy('render')
    try {
      const assets = await call('render:inject', idsOf(ctxRef.current))
      refresh()
      const files = assets.filter((a) => a.role === 'rendered' || a.role === 'composite')
      toast.success('Rendered', `${files.length} file(s) written`)
      return assets
    } catch (e) {
      toast.error(isConflict(e) ? WAIT : 'Render failed', e)
      return null
    } finally {
      setBusy(null)
    }
  }, [save])

  const setLocked = async (locked: boolean) => {
    setBusy('lock')
    try {
      await writeInject(ctxRef.current, (l) => ({ ...l, locked }), locked ? 'locked' : 'unlocked')
      toast.info(locked ? 'Inject locked' : 'Inject unlocked')
    } catch (e) {
      toast.error(isConflict(e) ? WAIT : 'Could not change the lock', e)
    } finally {
      setBusy(null)
    }
  }

  const startJob = async (kind: JobKind, start: () => Promise<{ jobId: string }>) => {
    try {
      const { jobId } = await start()
      ctxRef.current.track(jobId, kind)
      return jobId
    } catch (e) {
      toast.error(
        isConflict(e)
          ? 'Another generation job is running for this scenario'
          : 'Could not start the job',
        e,
      )
      return null
    }
  }

  const regenerateText = (instructions: string) =>
    startJob('generate-injects', () =>
      call('injects:regenerate-text', {
        ...idsOf(ctxRef.current),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      }),
    )

  const regenerateMedia = (paths: RenderPathId[]) =>
    startJob('render-media', () =>
      call('injects:regenerate-media', { ...idsOf(ctxRef.current), paths }),
    )

  const restore = async (versionIndex: number) => {
    const c = ctxRef.current
    setBusy('restore')
    try {
      const saved = await call('injects:restore-version', { ...idsOf(c), versionIndex })
      useDrafts.getState().drop(draftKey(c.scenarioId, c.injectId))
      queryClient.setQueryData(['injects:get', idsOf(c)], saved)
      refresh()
      toast.success(`Restored version ${versionIndex + 1}`)
    } catch (e) {
      toast.error(isConflict(e) ? WAIT : 'Restore failed', e)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (): Promise<boolean> => {
    const c = ctxRef.current
    try {
      await call('injects:delete', idsOf(c))
      useDrafts.getState().drop(draftKey(c.scenarioId, c.injectId))
      refresh()
      toast.success('Inject deleted')
      return true
    } catch (e) {
      toast.error(isConflict(e) ? WAIT : 'Delete failed', e)
      return false
    }
  }

  const saveToLibrary = async (name: string) => {
    if (ctxRef.current.dirty && !(await save())) return
    try {
      await call('library:save', { ...idsOf(ctxRef.current), name })
      void queryClient.invalidateQueries({ queryKey: ['library:list'] })
      toast.success('Saved to library', name)
    } catch (e) {
      toast.error('Could not save to the library', e)
    }
  }

  return {
    busy,
    pendingSave,
    save,
    retryPending,
    render,
    setLocked,
    regenerateText,
    regenerateMedia,
    restore,
    remove,
    saveToLibrary,
  }
}
