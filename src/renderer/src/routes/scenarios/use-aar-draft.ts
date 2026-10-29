// The AAR/IP's structured data (#419) on the AAR page: loaded from aar:get, edited locally
// (ratings a person confirms, plan rows, organizations, acronyms) and saved a moment after
// each change through aar:save with the updatedAt it was based on, so an edit made elsewhere
// (a re-draft that finished meanwhile) stops the save with a "changed elsewhere" state and a
// reload instead of being overwritten.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Aar } from '@shared/schemas/aar'
import { useUnsavedSource } from '../../editors/unsaved-work'
import { call, IpcError } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient } from '../../lib/query'

export type AarDraftStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

export const AAR_SAVE_DELAY_MS = 800

export interface AarDraft {
  /** undefined while loading; null when no draft exists yet. */
  aar: Aar | null | undefined
  loadError: string | undefined
  status: AarDraftStatus
  problem: string | undefined
  update: (fn: (a: Aar) => Aar) => void
  reload: () => void
  flush: () => Promise<unknown>
}

/** Queries whose answers a saved AAR changes (the document's tables are re-rendered). */
const REFRESH = ['aar:get', 'scenarios:doc-get', 'scenarios:history', 'export:preview-html']

export function useAarDraft(projectPath: string, scenarioId: string): AarDraft {
  const [aar, setAar] = useState<Aar | null>()
  const [loadError, setLoadError] = useState<string>()
  const [status, setStatus] = useState<AarDraftStatus>('idle')
  const [problem, setProblem] = useState<string>()
  const [loads, setLoads] = useState(0)
  const latest = useRef<Aar | null | undefined>(undefined)
  const base = useRef<string | undefined>(undefined)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chain = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    let live = true
    call('aar:get', { projectPath, scenarioId }).then(
      (a) => {
        if (!live) return
        latest.current = a
        base.current = a?.updatedAt
        dirty.current = false
        setAar(a)
        setStatus('idle')
        setProblem(undefined)
      },
      (err: unknown) => live && setLoadError(errorText(err)),
    )
    return () => {
      live = false
    }
  }, [projectPath, scenarioId, loads])

  const flush = useCallback((): Promise<unknown> => {
    clearTimeout(timer.current)
    timer.current = undefined
    const draft = latest.current
    if (!dirty.current || !draft) return chain.current
    dirty.current = false
    setStatus('saving')
    chain.current = chain.current
      .catch(() => undefined)
      .then(() =>
        call('aar:save', {
          projectPath,
          scenarioId,
          aar: draft,
          ...(base.current ? { baseUpdatedAt: base.current } : {}),
        }),
      )
      .then(
        (saved) => {
          base.current = saved.updatedAt
          if (latest.current) latest.current = { ...latest.current, updatedAt: saved.updatedAt }
          setProblem(undefined)
          setStatus(dirty.current ? 'saving' : 'saved')
          for (const key of REFRESH) void queryClient.invalidateQueries({ queryKey: [key] })
        },
        (err: unknown) => {
          const conflict = err instanceof IpcError && err.code === 'CONFLICT'
          dirty.current = !conflict
          setStatus(conflict ? 'conflict' : 'error')
          setProblem(errorText(err))
        },
      )
    return chain.current
  }, [projectPath, scenarioId])

  const update = useCallback(
    (fn: (a: Aar) => Aar) => {
      if (!latest.current) return
      const next = fn(latest.current)
      latest.current = next
      setAar(next)
      dirty.current = true
      setStatus('saving')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), AAR_SAVE_DELAY_MS)
    },
    [flush],
  )

  // Leaving the page saves pending edits at once.
  useEffect(
    () => () => {
      void flush()
    },
    [flush],
  )
  useUnsavedSource(
    'After-Action Report',
    () => dirty.current,
    () => flush(),
  )

  const reload = useCallback(() => {
    setLoadError(undefined)
    setLoads((n) => n + 1)
  }, [])

  return { aar, loadError, status, problem, update, reload, flush }
}
