// Export as pack (#271): choose items → metadata → licenses → review → save → share.
// Mount it in a page (PackExportPage, /packs/export) or a dialog (PackExportDialog).
import { useMemo, useState } from 'react'
import { Button } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { ItemsStep } from './ItemsStep'
import { MetadataStep } from './MetadataStep'
import { LicensesStep } from './LicensesStep'
import { ReviewStep, SaveStep, ShareStep } from './FinishSteps'
import {
  STEPS,
  initialState,
  issuesFor,
  withProjectDefaults,
  type StepId,
  type Update,
  type WizardState,
} from './wizard-model'
import type { RecentProjectView, SavedPack } from './types'
import './pack-export.css'

export interface PackExportWizardProps {
  /** Preselect this project for the domain, documents and example (default: none). */
  projectPath?: string | null
  /** Called by Cancel and by Done on the last step. */
  onClose?: () => void
}

function StepList({ current }: { current: number }) {
  return (
    <ol className="pe-steps" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li
          key={s.id}
          aria-current={i === current ? 'step' : undefined}
          className={i < current ? 'pe-done' : undefined}
        >
          {s.label}
        </li>
      ))}
    </ol>
  )
}

/** The project list, with the preselected project even when it is not among the recent ones. */
function useProjects(path: string | null): RecentProjectView[] {
  const recent = useIpcQuery('project:list-recent', undefined)
  return useMemo(() => {
    const list = (recent.data ?? []).filter((r) => !r.archived)
    if (!path || list.some((r) => r.path === path)) return list
    const name = path.split(/[\\/]/).pop() ?? path
    return [
      { path, name, orgName: '', openedAt: new Date(0).toISOString(), archived: false },
      ...list,
    ]
  }, [recent.data, path])
}

export function PackExportWizard(props: PackExportWizardProps) {
  const [state, setState] = useState<WizardState>(() => initialState(props.projectPath ?? null))
  const [step, setStep] = useState(0)
  const [checked, setChecked] = useState<{ ok: boolean; fileName?: string } | null>(null)
  const [saved, setSaved] = useState<SavedPack | null>(null)
  const update: Update = (fn) => setState((s) => fn(s))
  const sources = useIpcQuery(
    'packs:exportSources',
    state.projectPath ? { projectPath: state.projectPath } : undefined,
  )
  const projects = useProjects(state.projectPath)
  // Fill the project defaults once per sources answer (adjusting state during render).
  const [appliedSources, setAppliedSources] = useState<typeof sources.data>(undefined)
  if (sources.data && sources.data !== appliedSources) {
    const data = sources.data
    setAppliedSources(data)
    setState((s) => withProjectDefaults(s, data))
  }

  const id: StepId = STEPS[step]!.id
  const titles = useMemo(
    () => Object.fromEntries((sources.data?.project?.documents ?? []).map((d) => [d.id, d.title])),
    [sources.data],
  )
  if (sources.isError)
    return (
      <p role="alert" className="field__error">
        {errorText(sources.error)}
      </p>
    )
  if (!sources.data)
    return (
      <p className="muted" role="status">
        Loading…
      </p>
    )
  const src = sources.data
  const issues = issuesFor(id, state, titles)
  const go = (to: number) => {
    if (to <= 3) setChecked(null)
    setStep(to)
  }
  const canNext = id === 'review' ? !!checked?.ok : issues.length === 0

  return (
    <div className="pe-wizard">
      <StepList current={step} />
      <section aria-label={STEPS[step]!.label} className="pe-body">
        {id === 'items' && (
          <ItemsStep sources={src} recent={projects} state={state} update={update} />
        )}
        {id === 'metadata' && (
          <MetadataStep
            state={state}
            update={update}
            user={src.suggestedUser}
            appVersion={src.appVersion}
          />
        )}
        {id === 'licenses' && <LicensesStep state={state} update={update} titles={titles} />}
        {id === 'review' && <ReviewStep state={state} onChecked={(ok) => setChecked({ ok })} />}
        {id === 'save' && (
          <SaveStep
            state={state}
            fileName={`${state.meta.id}-${state.meta.version}.aspack`}
            onSaved={(r) => {
              setSaved(r)
              go(5)
            }}
          />
        )}
        {id === 'share' && saved && <ShareStep saved={saved} />}
      </section>
      {issues.length > 0 && (
        <ul className="pe-issues" aria-live="polite">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <div className="pe-nav">
        {id !== 'share' && <Button onClick={() => props.onClose?.()}>Cancel</Button>}
        {step > 0 && id !== 'share' && <Button onClick={() => go(step - 1)}>Back</Button>}
        {step < 4 && (
          <Button variant="primary" disabled={!canNext} onClick={() => go(step + 1)}>
            Next
          </Button>
        )}
        {id === 'share' && (
          <Button variant="primary" onClick={() => props.onClose?.()}>
            Done
          </Button>
        )}
      </div>
    </div>
  )
}
