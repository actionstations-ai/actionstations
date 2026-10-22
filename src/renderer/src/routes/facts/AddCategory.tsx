import { Plus } from 'lucide-react'
import { useState } from 'react'
import { FACILITY_LIMITS } from '@shared/ipc/project'
import { Button, Field } from '../../components/ui'

/** A new `## Section` in facility-facts.md (shown to the model; lint checks only known kinds). */
export function AddCategory(props: { taken: string[]; onAdd: (label: string) => void }) {
  const [label, setLabel] = useState('')
  const name = label.trim()
  const error = props.taken.includes(name.toLowerCase())
    ? 'A category with this name exists.'
    : undefined
  const add = () => {
    if (!name || error) return
    props.onAdd(name)
    setLabel('')
  }
  return (
    <section className="card facts-add-category" aria-labelledby="facts-new-category">
      <h2 id="facts-new-category">Add a category</h2>
      <div className="facts-add__row">
        <Field
          label="Category name"
          hint="For another kind of identifier, e.g. Pump stations. Shown to the model; not linted."
          {...(error ? { error } : {})}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input"
              value={label}
              maxLength={FACILITY_LIMITS.labelLength}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
            />
          )}
        </Field>
        <Button onClick={add} disabled={!name || !!error}>
          <Plus size={16} aria-hidden /> Add category
        </Button>
      </div>
    </section>
  )
}
