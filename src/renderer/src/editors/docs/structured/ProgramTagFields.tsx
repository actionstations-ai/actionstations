// Program exercise tags in the exercise details (spec 0457 FR-14): a toolkit can offer exercises
// a funding program defines (the PHEP Biological Incident 100, for example). Ticking one adds the
// program's improvement plan table to the AAR and shows the program's suggested objectives and
// participants here. Nothing is sent to the program. With no toolkit offering tags the group
// does not appear.
import { exerciseTagsOf, improvementPlanDueDate } from '@shared/toolkits'
import type { ConductDetails } from '@shared/schemas/scenario'
import { useIpcQuery } from '../../../lib/query'

type Update = (fn: (c: ConductDetails) => ConductDetails) => void

export function ProgramTagFields(props: {
  projectPath: string
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
