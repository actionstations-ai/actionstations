// Program exercise tags in the exercise details (spec 0457 FR-14): a toolkit can offer exercises
// a funding program defines (the PHEP Biological Incident 100, for example). Ticking one adds the
// program's improvement plan table to the AAR and shows the program's suggested objectives and
// participants here; a button adds the objectives to the scenario (generation adds them too).
// Nothing is sent to the program. With no toolkit offering tags the group does not appear.
import { useState } from 'react'
import {
  exerciseTagsOf,
  improvementPlanDueDate,
  mergeTagObjectives,
  type ToolkitExerciseTag,
} from '@shared/toolkits'
import type { ConductDetails } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { call } from '../../../lib/api'
import { useIpcQuery } from '../../../lib/query'
import { newItemId } from '../owners'

type Update = (fn: (c: ConductDetails) => ConductDetails) => void

/** Add the tag's objectives the scenario lacks, saved against the latest scenario; a status line. */
async function adoptObjectives(
  projectPath: string,
  scenarioId: string,
  tag: ToolkitExerciseTag,
): Promise<string> {
  const latest = await call('scenarios:get', { projectPath, scenarioId })
  const merged = mergeTagObjectives(latest.objectives, [tag], () => newItemId('obj'))
  if (!merged.added.length) return 'The scenario already has these objectives.'
  await call('scenarios:save', {
    projectPath,
    scenario: { ...latest, objectives: merged.objectives },
    note: `Added objectives from ${tag.label}`,
  })
  const n = merged.added.length
  return `Added ${n} objective${n === 1 ? '' : 's'} to the scenario.`
}

function AdoptObjectives(props: {
  projectPath: string
  scenarioId: string
  tag: ToolkitExerciseTag
}) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const run = () => {
    setBusy(true)
    adoptObjectives(props.projectPath, props.scenarioId, props.tag)
      .then(setStatus)
      .catch((err: unknown) =>
        setStatus(
          `Could not add the objectives: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )
      .finally(() => setBusy(false))
  }
  return (
    <div className="stack">
      <Button size="sm" onClick={run} disabled={busy}>
        Add to scenario objectives
      </Button>
      <p className="muted" role="status">
        {status}
      </p>
    </div>
  )
}

export function ProgramTagFields(props: {
  projectPath: string
  scenarioId: string
  c: ConductDetails
  update: Update
}) {
  const { c, update } = props
  const q = useIpcQuery('toolkits:list', { projectPath: props.projectPath })
  const tags = exerciseTagsOf((q.data?.toolkits ?? []).map((l) => l.toolkit))
  if (!tags.length) return null
  const toggle = (id: string, on: boolean) =>
    update((p) => ({
      ...p,
      exerciseTags: on
        ? [...p.exerciseTags.filter((x) => x !== id), id]
        : p.exerciseTags.filter((x) => x !== id),
    }))
  return (
    <fieldset className="conduct__group">
      <legend className="field__label conduct__legend">Program exercise</legend>
      <p className="muted">
        Tag the exercise with one a funding program defines. The After-Action Report then carries
        that program&rsquo;s improvement plan table. This app submits nothing to the program.
      </p>
      {tags.map((t) => {
        const on = c.exerciseTags.includes(t.id)
        const due = improvementPlanDueDate(c.dates[c.dates.length - 1], t)
        return (
          <div key={t.id} className="stack">
            <label className="conduct__check">
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => toggle(t.id, e.target.checked)}
              />
              <span>{t.label}</span>
            </label>
            {on && (
              <div className="stack" aria-label={`${t.label} details`}>
                <p className="muted">
                  {t.program}, text dated {t.version}.
                  {t.improvementPlanDueDays !== undefined &&
                    ` Improvement plan data is due ${t.improvementPlanDueDays} days after the exercise${due ? `, by ${due}` : ''}.`}
                </p>
                {t.objectives.length > 0 && (
                  <>
                    <p className="field__label">Suggested objectives</p>
                    <ul>
                      {t.objectives.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                    <AdoptObjectives
                      projectPath={props.projectPath}
                      scenarioId={props.scenarioId}
                      tag={t}
                    />
                  </>
                )}
                {t.participants && (
                  <p>
                    <strong>Suggested participants:</strong> {t.participants}
                  </p>
                )}
                {t.notes.map((n) => (
                  <p key={n} className="muted">
                    {n}
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
