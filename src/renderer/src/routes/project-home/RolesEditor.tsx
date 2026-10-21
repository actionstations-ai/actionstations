import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Field } from '../../components/ui'
import { emptyRole, type FormErrors, type RoleDraft } from './form'

type TextKey = 'name' | 'abbreviation' | 'team' | 'description' | 'standingOrdersText'

function RoleCard(props: {
  role: RoleDraft
  index: number
  error?: string
  autoFocusName: boolean
  onPatch: (patch: Partial<RoleDraft>) => void
  onRemove: () => void
}) {
  const { role, index, error, onPatch } = props
  const text = (key: TextKey, label: string, opts: { hint?: string; error?: string } = {}) => (
    <Field label={label} {...opts}>
      {({ id, describedBy, invalid }) =>
        key === 'description' || key === 'standingOrdersText' ? (
          <textarea
            id={id}
            className="textarea"
            rows={3}
            value={role[key]}
            aria-describedby={describedBy}
            onChange={(e) => onPatch({ [key]: e.target.value })}
          />
        ) : (
          <input
            id={id}
            className="input"
            value={role[key]}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            autoFocus={key === 'name' && props.autoFocusName}
            onChange={(e) => onPatch({ [key]: e.target.value })}
          />
        )
      }
    </Field>
  )
  const title = role.name.trim() || `Role ${index + 1}`
  return (
    <li className="role-card" aria-label={title}>
      <div className="role-card__header">
        <h4>{title}</h4>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Remove role ${title}`}
          onClick={props.onRemove}
        >
          <Trash2 size={14} aria-hidden /> Remove
        </Button>
      </div>
      <div className="form-grid">
        {text('name', 'Role name', error ? { error } : {})}
        {text('abbreviation', 'Abbreviation', { hint: 'e.g. ASC, PIO' })}
        {text('team', 'Team', { hint: 'e.g. Security, Operations, Communications' })}
      </div>
      {text('description', 'Description')}
      {text('standingOrdersText', 'Standing orders', {
        hint: 'One per line: what this role does by default, before any inject arrives.',
      })}
    </li>
  )
}

/** Editor for the project's default exercise roles (players, controllers, SimCell). */
export function RolesEditor(props: {
  roles: RoleDraft[]
  errors: FormErrors
  onChange: (roles: RoleDraft[]) => void
}) {
  const { roles, errors, onChange } = props
  const addButton = useRef<HTMLButtonElement>(null)
  const [addedId, setAddedId] = useState<string | null>(null)

  const add = () => {
    const role = emptyRole()
    setAddedId(role.id)
    onChange([...roles, role])
  }
  const remove = (id: string) => {
    onChange(roles.filter((r) => r.id !== id))
    addButton.current?.focus()
  }

  return (
    <fieldset className="form-section">
      <legend>Default roles</legend>
      <p className="muted">
        The positions that take part in this organization&apos;s exercises. New scenarios start with
        these roles.
      </p>
      {roles.length === 0 ? (
        <p className="muted">No roles yet.</p>
      ) : (
        <ul className="role-list">
          {roles.map((role, i) => (
            <RoleCard
              key={role.id}
              role={role}
              index={i}
              autoFocusName={addedId === role.id}
              {...(errors[`role:${role.id}`] ? { error: errors[`role:${role.id}`] } : {})}
              onPatch={(patch) =>
                onChange(roles.map((r) => (r.id === role.id ? { ...r, ...patch } : r)))
              }
              onRemove={() => remove(role.id)}
            />
          ))}
        </ul>
      )}
      <div>
        <button ref={addButton} type="button" className="btn btn--sm" onClick={add}>
          <Plus size={14} aria-hidden /> Add role
        </button>
      </div>
    </fieldset>
  )
}
