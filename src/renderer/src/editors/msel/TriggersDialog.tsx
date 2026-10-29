// "Starts reporting clocks" for one MSEL row (#426): which regulation triggers delivering the row
// fires in Facilitate. Regulations the project has switched on come first; others can be picked
// too (their clocks run once the regulation is switched on in Settings › Compliance).
import { useState } from 'react'
import { regulationLabel } from '@shared/schemas/compliance'
import type { MselRow, MselRowTrigger } from '@shared/schemas/scenario'
import { Button, Dialog } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

const keyOf = (t: MselRowTrigger) => `${t.regulationId}:${t.triggerId}`

interface Props {
  projectPath: string
  row: MselRow | null
  onCancel: () => void
  onSave: (triggers: MselRowTrigger[]) => void
}

export function TriggersDialog(props: Props) {
  // Keyed by row so the ticks start from that row's triggers each time the dialog opens.
  return props.row ? <OpenTriggersDialog key={props.row.id} {...props} row={props.row} /> : null
}

function OpenTriggersDialog(props: Props & { row: MselRow }) {
  const { row } = props
  const list = useIpcQuery('compliance:list', { projectPath: props.projectPath })
  const [picked, setPicked] = useState<Set<string>>(() => new Set((row.triggers ?? []).map(keyOf)))
  const regs = [...(list.data?.regulations ?? [])].sort(
    (a, b) => Number(b.enabled) - Number(a.enabled),
  )
  const toggle = (k: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const save = () =>
    props.onSave(
      [...picked].map((k) => {
        const [regulationId, triggerId] = k.split(':') as [string, string]
        return { regulationId, triggerId }
      }),
    )
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onCancel()}
      title={`Reporting clocks started by ${row.id}`}
      description="Delivering this row in Facilitate fires the triggers you tick, which starts their regulations' reporting clocks."
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!list.data}>
            Save
          </Button>
        </>
      }
    >
      {list.isLoading && <p className="muted">Loading regulations…</p>}
      {list.error && (
        <p className="field__error" role="alert">
          Could not load the regulations: {errorText(list.error)}
        </p>
      )}
      <div className="msel-triggers">
        {regs.map(({ regulation: r, enabled }) => (
          <fieldset key={r.id} className="msel-triggers__group">
            <legend>
              {regulationLabel(r)}
              {!enabled && <span className="muted"> (switched off for this project)</span>}
            </legend>
            {r.triggers.map((t) => {
              const k = `${r.id}:${t.id}`
              const id = `trig-${r.id}-${t.id}`
              return (
                <div key={k} className="msel-triggers__item">
                  <input
                    id={id}
                    type="checkbox"
                    checked={picked.has(k)}
                    onChange={() => toggle(k)}
                  />
                  <label htmlFor={id}>{t.label}</label>
                  {t.hint && <p className="muted msel-triggers__hint">{t.hint}</p>}
                </div>
              )
            })}
          </fieldset>
        ))}
      </div>
    </Dialog>
  )
}
