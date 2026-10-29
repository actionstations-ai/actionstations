// Evaluators in the Live tab (#416 FR-1, FR-8): who has joined as an evaluator, each one's watch
// list (roles and capabilities; empty watches everything), and whether the plan's expected
// actions are sent to evaluators. Hidden until an evaluator has joined.
import { useId, useState } from 'react'
import { capabilityName } from '@shared/core-capabilities'
import type { CoverageEvaluator } from '@shared/schemas/live'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { useLiveEvaluation } from './use-live-evaluation'

export interface WatchRole {
  id: string
  name: string
}

function toggle(list: readonly string[], value: string, on: boolean): string[] {
  const without = list.filter((v) => v !== value)
  return on ? [...without, value] : without
}

function WatchEditor(props: {
  evaluator: CoverageEvaluator
  roles: readonly WatchRole[]
  capabilities: readonly string[]
  onSave: (roleIds: string[], capabilities: string[]) => Promise<void>
}) {
  const { evaluator: e } = props
  const id = useId()
  const [roleIds, setRoleIds] = useState<string[]>(e.watch.roleIds)
  const [capabilities, setCapabilities] = useState<string[]>(e.watch.capabilities)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await props.onSave(roleIds, capabilities)
      toast.success(`Saved the watch list for ${e.label}`)
    } catch (err) {
      toast.error('Could not save the watch list', err)
    } finally {
      setBusy(false)
    }
  }
  const summary =
    e.watch.roleIds.length + e.watch.capabilities.length === 0
      ? 'watching everything'
      : `watching ${e.watch.roleIds.length} roles, ${e.watch.capabilities.length} capabilities`
  return (
    <details className="live-watch">
      <summary>
        {e.label} · {e.online ? 'connected' : 'offline'} · {summary} · {e.observations}{' '}
        {e.observations === 1 ? 'observation' : 'observations'}
      </summary>
      <fieldset className="live-fieldset">
        <legend className="field__label">Roles {e.label} watches</legend>
        {props.roles.map((r) => (
          <label key={r.id} className="live-radio">
            <input
              type="checkbox"
              checked={roleIds.includes(r.id)}
              onChange={(ev) => setRoleIds(toggle(roleIds, r.id, ev.target.checked))}
            />
            <span>{r.name}</span>
          </label>
        ))}
      </fieldset>
      {props.capabilities.length > 0 && (
        <fieldset className="live-fieldset">
          <legend className="field__label">Capabilities {e.label} watches</legend>
          {props.capabilities.map((c) => (
            <label key={c} className="live-radio">
              <input
                type="checkbox"
                checked={capabilities.includes(c)}
                onChange={(ev) => setCapabilities(toggle(capabilities, c, ev.target.checked))}
              />
              <span>{capabilityName(c)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="muted" id={`${id}-help`}>
        Leave everything unchecked to watch all tasks. The evaluator can still switch to All tasks.
      </p>
      <Button size="sm" disabled={busy} aria-describedby={`${id}-help`} onClick={() => void save()}>
        Save watch list
      </Button>
    </details>
  )
}

export function LiveEvaluators(props: {
  projectPath: string
  scenarioId: string
  roles: readonly WatchRole[]
}) {
  const live = useLiveEvaluation(props.projectPath, props.scenarioId)
  const view = live.coverage
  if (!live.active || !view) return null
  const capabilities = [
    ...new Set(view.tasks.map((t) => t.capability).filter((c) => c !== 'expected-actions')),
  ]
  return (
    <section className="live-evaluators" aria-labelledby="live-evaluators-heading">
      <h3 id="live-evaluators-heading" className="live-note__title">
        Evaluators
      </h3>
      <label className="live-radio">
        <input
          type="checkbox"
          checked={view.showExpected}
          onChange={(ev) =>
            void live.setShowExpected(ev.target.checked).catch((err: unknown) => {
              toast.error('Could not change the setting', err)
            })
          }
        />
        <span>
          Show expected actions to evaluators
          <span className="muted live-radio__help">
            Adds each inject’s expected action to the evaluator’s list of things to rate.
          </span>
        </span>
      </label>
      {view.evaluators.length === 0 ? (
        <p className="muted">
          No evaluators yet. Open the staff link on a tablet and choose the Evaluator seat.
        </p>
      ) : (
        view.evaluators.map((e) => (
          <WatchEditor
            key={e.clientRef}
            evaluator={e}
            roles={props.roles}
            capabilities={capabilities}
            onSave={(roleIds, caps) => live.setWatch(e.clientRef, { roleIds, capabilities: caps })}
          />
        ))
      )}
    </section>
  )
}
