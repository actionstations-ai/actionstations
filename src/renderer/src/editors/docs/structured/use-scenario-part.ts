// Editing one part of scenario.json (rubric, hot wash, overview…). Saves re-read the latest
// scenario and apply only this part, so parallel editors and the pipeline's fields are kept.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Scenario, Stage } from '@shared/schemas/scenario'
import { call } from '../../../lib/api'
import { useIpcQuery } from '../../../lib/query'
import { lastGenerated } from '../owners'
import { pendingKey, peekPending, usePendingSaves } from '../pending-saves'
import { useGuardedSave } from '../use-guarded-save'
import { useLatest } from '../use-latest'
import { useUnsavedSource } from '../../unsaved-work'
import { AUTOSAVE_MS } from '../use-doc-editor'

export interface PartSpec<T> {
  /** Stable id of the part ("rubric"); keys an edit kept while its tab is closed. */
  id: string
  /** Name for the pending-edit indicator ("Rubric"). */
  label: string
  pick: (s: Scenario) => T
  apply: (s: Scenario, value: T) => Scenario
  /** History note for saves, e.g. "Edited rubric". */
  note: string
}

/** An edit parked when this part's tab was last left (save refused during generation). */
function parkedValue<T>(key: string): { value: T } | undefined {
  const parked = peekPending(key)
  return parked ? { value: (parked.value as { v: T }).v } : undefined
}

export function useScenarioPart<T>(projectPath: string, scenario: Scenario, spec: PartSpec<T>) {
  const parkKey = pendingKey(projectPath, scenario.id, `part:${spec.id}`)
  const [parked] = useState(() => parkedValue<T>(parkKey))
  const [value, setValue] = useState<T>(() => parked?.value ?? spec.pick(scenario))
  const [dirty, setDirty] = useState(!!parked)
  const baseline = useRef(JSON.stringify(spec.pick(scenario)))
  const valueRef = useLatest(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const specRef = useLatest(spec)

  // Follow outside changes (regenerate, another editor) while there are no unsaved edits.
  useEffect(() => {
    const next = specRef.current.pick(scenario)
    const key = JSON.stringify(next)
    if (dirty || key === baseline.current) return
    baseline.current = key
    setValue(next)
  }, [scenario, dirty, specRef])

  const writer = useGuardedSave(
    async ({ v, note }: { v: T; note: string }) => {
      const latest = await call('scenarios:get', { projectPath, scenarioId: scenario.id })
      await call('scenarios:save', {
        projectPath,
        scenario: specRef.current.apply(latest, v),
        note,
      })
    },
    ({ v }) => {
      baseline.current = JSON.stringify(v)
      setDirty(JSON.stringify(valueRef.current) !== baseline.current)
    },
    { key: parkKey, scenarioId: scenario.id, label: spec.label },
  )

  const save = useCallback(
    (note = specRef.current.note, force = false): Promise<boolean> => {
      clearTimeout(timer.current)
      const v = valueRef.current
      if (!force && JSON.stringify(v) === baseline.current) {
        setDirty(false)
        return Promise.resolve(true)
      }
      return writer.save({ v, note })
    },
    [writer, specRef, valueRef],
  )
  const saveRef = useLatest(save)
  const dirtyRef = useLatest(dirty)
  // A taken-back edit is this editor's again: unpark it and save it (retried on CONFLICT).
  useEffect(() => {
    if (!parked) return
    usePendingSaves.getState().drop(parkKey)
    timer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS)
  }, [parked, parkKey, saveRef])
  // Leaving the tab saves pending edits.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (dirtyRef.current) void saveRef.current()
    },
    [dirtyRef, saveRef],
  )
  // Before quitting: save now; an edit still refused (job running) is reported as unsaved.
  useUnsavedSource(
    spec.label,
    () => dirtyRef.current,
    () => saveRef.current(),
  )

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        valueRef.current = v
        return v
      })
      setDirty(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS)
    },
    [saveRef, valueRef],
  )

  return {
    value,
    update,
    dirty,
    save,
    status: writer.status,
    error: writer.error,
    retry: writer.retry,
  }
}

/** True when the newest user save of scenario.json is later than the stage's last run. */
export function useEditedSince(projectPath: string, scenario: Scenario, stage: Stage): boolean {
  const history = useIpcQuery('scenarios:history', {
    projectPath,
    scenarioId: scenario.id,
    artifact: 'scenario',
  })
  const newestUser = history.data?.find((e) => e.by === 'user')?.at
  const generated = lastGenerated(scenario, stage)
  return !!newestUser && (!generated || newestUser > generated)
}
