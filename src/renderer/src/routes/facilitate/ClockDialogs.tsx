// Dialogs of the controller tools (spec 0428): rewinding past deliveries, resetting the clock,
// and choosing who gets one delivery.
import { useId, useState } from 'react'
import type { Role } from '@shared/schemas/project'
import { rolesOfTeams, teamNames } from '@shared/facilitator/recipients'
import { Button, Dialog } from '../../components/ui'
import type { PendingMove } from './use-clock-controls'

export function RewindDialog(props: {
  move: PendingMove | undefined
  onResolve: (markNotDelivered: boolean) => void
  onCancel: () => void
}) {
  const rows = props.move?.rows ?? []
  return (
    <Dialog
      open={!!props.move}
      onOpenChange={(open) => !open && props.onCancel()}
      title="Moving the clock back"
      description={`${rows.length} row${rows.length === 1 ? ' was' : 's were'} delivered after that time.`}
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button onClick={() => props.onResolve(true)}>Mark them not delivered</Button>
          <Button variant="primary" onClick={() => props.onResolve(false)} autoFocus>
            Keep them delivered
          </Button>
        </>
      }
    >
      <ul aria-label="Rows delivered after that time">
        {rows.map((id) => (
          <li key={id} className="mono">
            {id}
          </li>
        ))}
      </ul>
      <p className="muted">
        Marking a row not delivered removes its delivered time. With live play it is also taken off
        players’ devices, who see that the controller withdrew it. Both are recorded in the clock
        log.
      </p>
    </Dialog>
  )
}

export function ResetDialog(props: { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && props.onCancel()}
      title="Reset the clock?"
      description="The clock goes back to 0:00:00. Delivered rows keep their delivered times."
      footer={
        <>
          <Button onClick={props.onCancel} autoFocus>
            Cancel
          </Button>
          <Button variant="primary" onClick={props.onConfirm}>
            Reset the clock
          </Button>
        </>
      }
    >
      <p className="muted">Use Undo on a row to mark it not delivered.</p>
    </Dialog>
  )
}

function RoleBoxes(props: {
  roles: Role[]
  chosen: Set<string>
  onToggle: (ids: string[], on: boolean) => void
}) {
  const teams = teamNames(props.roles)
  const loose = props.roles.filter((r) => !r.team)
  const box = (label: string, ids: string[]) => {
    const on = ids.every((id) => props.chosen.has(id))
    return (
      <label key={label} className="fac-pick__item">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => props.onToggle(ids, e.target.checked)}
        />{' '}
        {label}
      </label>
    )
  }
  return (
    <>
      {teams.map((team) => (
        <fieldset key={team} className="fac-pick__team">
          <legend>{team} team</legend>
          {box(`Whole ${team} team`, rolesOfTeams([team], props.roles))}
          {props.roles
            .filter((r) => r.team === team)
            .map((r) => box(r.abbreviation || r.name, [r.id]))}
        </fieldset>
      ))}
      {loose.length > 0 && (
        <fieldset className="fac-pick__team">
          <legend>Other roles</legend>
          {loose.map((r) => box(r.abbreviation || r.name, [r.id]))}
        </fieldset>
      )}
    </>
  )
}

function PickerBody(props: {
  roles: Role[]
  planned: string[]
  onCancel: () => void
  onDeliver: (roleIds: string[]) => void
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(props.planned))
  const note = useId()
  const toggle = (ids: string[], on: boolean) =>
    setChosen((c) => {
      const next = new Set(c)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  return (
    <>
      <RoleBoxes roles={props.roles} chosen={chosen} onToggle={toggle} />
      {chosen.size === 0 && (
        <p id={note} className="field__error">
          Choose at least one role.
        </p>
      )}
      <div className="dialog__footer">
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button
          variant="primary"
          disabled={chosen.size === 0}
          aria-describedby={chosen.size === 0 ? note : undefined}
          onClick={() => props.onDeliver([...chosen])}
        >
          Deliver to {chosen.size} role{chosen.size === 1 ? '' : 's'}
        </Button>
      </div>
    </>
  )
}

/** Deliver one row to a different set of roles than the plan (spec 0428 FR-6). */
export function DeliverToDialog(props: {
  open: boolean
  rowId: string
  roles: Role[]
  planned: string[]
  onCancel: () => void
  onDeliver: (roleIds: string[]) => void
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && props.onCancel()}
      title={`Deliver ${props.rowId} to…`}
      description="The plan is preselected. Your choice applies to this delivery only."
    >
      {props.open && (
        <PickerBody
          roles={props.roles}
          planned={props.planned}
          onCancel={props.onCancel}
          onDeliver={props.onDeliver}
        />
      )}
    </Dialog>
  )
}
