// After "Regenerate text" the editor shows what the job changed: the inject's text before
// the job is kept, and when that job finishes the stored inject is diffed against it.
import { useState } from 'react'
import type { Inject } from '@shared/schemas/inject'
import type { JobDoneEvent } from '@shared/schemas/job'
import { call } from '../../lib/api'
import { diffFields, type FieldChange } from './schema/diff'

export type RegenBefore = Pick<Inject, 'title' | 'type' | 'fields'>

interface RegenWatch {
  jobId: string
  before: RegenBefore
}

export function useRegenWatch(projectPath: string, scenarioId: string, injectId: string) {
  const [regen, setRegen] = useState<RegenWatch | null>(null)
  const [changes, setChanges] = useState<FieldChange[] | null>(null)

  /** A regeneration job started: clear the last diff and remember the text before it. */
  const start = (jobId: string, before: RegenBefore) => {
    setChanges(null)
    setRegen({ jobId, before })
  }

  /** Call on every job:done; only the watched job produces a diff. */
  const onJobDone = (e: JobDoneEvent) => {
    if (!regen || e.jobId !== regen.jobId) return
    setRegen(null)
    void call('injects:get', { projectPath, scenarioId, injectId })
      .then((after) =>
        setChanges(
          diffFields(regen.before, { title: after.title, type: after.type, fields: after.fields }),
        ),
      )
      .catch(() => undefined)
  }

  return { changes, start, onJobDone, dismiss: () => setChanges(null) }
}
