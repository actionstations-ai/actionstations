// Loads one survey, keeps the working copy locally and saves it back a moment after each
// edit (every edit lands in the scenario folder). Saves are serialized and send the latest
// copy with the updatedAt it was based on, so an edit made elsewhere is never overwritten:
// the save stops with a "changed elsewhere" state and offers a reload. A copy that would not
// validate (a question without text) is held back and reported instead of sent.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Survey } from '@shared/schemas/survey'
import { useUnsavedSource } from '../../editors/unsaved-work'
import { call, IpcError } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient } from '../../lib/query'

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'error' | 'conflict'

export const SURVEY_SAVE_DELAY_MS = 600

export interface SurveyDraft {
  survey: Survey | undefined
  loadError: string | undefined
  status: DraftStatus
  /** Why the last save did not happen. */
  problem: string | undefined
  update: (fn: (s: Survey) => Survey) => void
  reload: () => void
  flush: () => Promise<unknown>
}

/** The first problem zod finds, in words a designer can act on. */
export function invalidReason(survey: Survey): string | undefined {
  const r = Survey.safeParse(survey)
  if (r.success) return undefined
  const issue = r.error.issues[0]
  const path = issue?.path ?? []
  const si = path[1]
  const qi = path[3]
  if (path[0] === 'title') return 'The survey needs a title.'
  if (typeof si === 'number' && typeof qi === 'number') {
    const field = String(path[4] ?? '')
    const where = `Section ${si + 1}, question ${qi + 1}`
    if (field === 'text') return `${where} needs its question text.`
    if (field === 'options') return `${where} needs at least two answer options, each with text.`
    return `${where}: ${issue?.message ?? 'not valid'}.`
  }
  return issue?.message ?? 'The survey is not valid yet.'
}

export function useSurveyDraft(
  projectPath: string,
  scenarioId: string,
  surveyId: string,
): SurveyDraft {
  const [survey, setSurvey] = useState<Survey>()
  const [loadError, setLoadError] = useState<string>()
  const [status, setStatus] = useState<DraftStatus>('idle')
  const [problem, setProblem] = useState<string>()
  const [loads, setLoads] = useState(0)
  const latest = useRef<Survey | undefined>(undefined)
  const base = useRef<string | undefined>(undefined)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chain = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    let live = true
    call('surveys:get', { projectPath, scenarioId, surveyId }).then(
      (s) => {
        if (!live) return
        latest.current = s
        base.current = s.updatedAt
        dirty.current = false
        setSurvey(s)
        setStatus('idle')
        setProblem(undefined)
      },
      (err: unknown) => live && setLoadError(errorText(err)),
    )
    return () => {
      live = false
    }
  }, [projectPath, scenarioId, surveyId, loads])

  const flush = useCallback((): Promise<unknown> => {
    clearTimeout(timer.current)
    timer.current = undefined
    const draft = latest.current
    if (!dirty.current || !draft) return chain.current
    const reason = invalidReason(draft)
    if (reason) {
      setStatus('invalid')
      setProblem(reason)
      return chain.current
    }
    dirty.current = false
    setStatus('saving')
    chain.current = chain.current
      .catch(() => undefined)
      .then(() =>
        call('surveys:save', {
          projectPath,
          scenarioId,
          survey: draft,
          ...(base.current ? { baseUpdatedAt: base.current } : {}),
        }),
      )
      .then(
        (saved) => {
          base.current = saved.updatedAt
          setProblem(undefined)
          setStatus(dirty.current ? 'saving' : 'saved')
          void queryClient.invalidateQueries({ queryKey: ['surveys:list'] })
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
    (fn: (s: Survey) => Survey) => {
      if (!latest.current) return
      const next = fn(latest.current)
      latest.current = next
      setSurvey(next)
      dirty.current = true
      setStatus('saving')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SURVEY_SAVE_DELAY_MS)
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
    'Survey',
    () => dirty.current,
    () => flush(),
  )

  const reload = useCallback(() => {
    setLoadError(undefined)
    setLoads((n) => n + 1)
  }, [])

  return { survey, loadError, status, problem, update, reload, flush }
}
