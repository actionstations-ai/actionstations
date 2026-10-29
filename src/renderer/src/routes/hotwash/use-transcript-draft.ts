// The transcript being edited (#425): local edits save automatically a moment after the last
// change, with the revision they started from; main refuses a save over a newer revision
// (CONFLICT), and the editor then offers to reload. Redaction goes straight to main.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HotwashRecording, Transcript } from '@shared/schemas/hotwash'
import { call } from '../../lib/api'
import { isConflictError } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

export type DraftStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'conflict' | 'error'

const SAVE_DELAY_MS = 700

export function useTranscriptDraft(projectPath: string, scenarioId: string, recordingId: string) {
  const listing = useIpcQuery('hotwash:list', { projectPath, scenarioId })
  const recording: HotwashRecording | undefined = listing.data?.recordings.find(
    (r) => r.id === recordingId,
  )
  const server = listing.data?.transcripts.find((t) => t.recordingId === recordingId)
  const [draft, setDraft] = useState<Transcript | undefined>(undefined)
  const [status, setStatus] = useState<DraftStatus>('idle')
  const [error, setError] = useState('')
  const dirty = useRef(false)
  const base = useRef<number | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef<Transcript | undefined>(undefined)
  const req = useMemo(
    () => ({ projectPath, scenarioId, recordingId }),
    [projectPath, scenarioId, recordingId],
  )

  // Follow the server copy (transcription progress, other saves) while nothing is unsaved.
  useEffect(() => {
    if (!server || dirty.current) return
    setDraft(server)
    latest.current = server
    base.current = server.revision
  }, [server])

  const save = useCallback(async () => {
    const t = latest.current
    if (!t || base.current === undefined || !dirty.current) return
    dirty.current = false
    setStatus('saving')
    try {
      const saved = await call('hotwash:transcript-save', {
        ...req,
        transcript: t,
        revision: base.current,
      })
      base.current = saved.revision
      if (!dirty.current) {
        latest.current = saved
        setDraft(saved)
      }
      setStatus(dirty.current ? 'pending' : 'saved')
    } catch (err) {
      dirty.current = true
      setStatus(isConflictError(err) ? 'conflict' : 'error')
      setError((err as Error).message)
    }
  }, [req])

  const edit = useCallback(
    (fn: (t: Transcript) => Transcript) => {
      const cur = latest.current
      if (!cur) return
      const next = fn(cur)
      if (next === cur) return
      latest.current = next
      dirty.current = true
      setDraft(next)
      setStatus('pending')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(), SAVE_DELAY_MS)
    },
    [save],
  )

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    await save()
  }, [save])

  const redact = useCallback(
    async (segmentId: string) => {
      await flush()
      try {
        const t = await call('hotwash:redact', { ...req, segmentId })
        latest.current = t
        base.current = t.revision
        setDraft(t)
        setStatus('saved')
      } catch (err) {
        setStatus('error')
        setError((err as Error).message)
      }
    },
    [flush, req],
  )

  /** Drop unsaved edits and load the latest saved transcript. */
  const reload = useCallback(async () => {
    clearTimeout(timer.current)
    dirty.current = false
    setStatus('idle')
    const fresh = await listing.refetch()
    const t = fresh.data?.transcripts.find((x) => x.recordingId === req.recordingId)
    latest.current = t
    base.current = t?.revision
    setDraft(t)
  }, [listing, req])

  // Save what is pending when the editor closes.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void save()
    },
    [save],
  )

  return {
    loading: listing.isLoading,
    loadError: listing.error?.message,
    recording,
    draft,
    status,
    error,
    edit,
    redact,
    reload,
  }
}
