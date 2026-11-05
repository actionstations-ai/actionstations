// One API key kept in the OS keychain through main: saved, replaced or removed, never shown again.
// Used by Settings → Hazard data and Settings → Case data.
import { useState, type FormEvent } from 'react'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'

export interface KeyCopy {
  /** Group label and the field's name, e.g. "NASA FIRMS map key". */
  label: string
  /** Accessible name of the whole form or group. */
  group: string
  hint: string
  /** Short noun used in messages, e.g. "map key". */
  noun: string
  signup: string
}

interface Done {
  onSuccess: () => void
  onError: (e: unknown) => void
}

interface KeyOps {
  save: (key: string, done: Done) => void
  remove: (done: Done) => void
  openSignup: () => void
}

const cap = (s: string): string => `${s[0]!.toUpperCase()}${s.slice(1)}`

/** One API key kept in the OS keychain: saved, replaced or removed; never shown again. */
export function ApiKey(props: { hasKey: boolean; canStore: boolean; copy: KeyCopy; ops: KeyOps }) {
  const { copy, ops } = props
  const [key, setKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const save = (e: FormEvent) => {
    e.preventDefault()
    ops.save(key.trim(), {
      onSuccess: () => {
        setKey('')
        setReplacing(false)
        toast.success(`${cap(copy.noun)} saved`)
      },
      onError: (err) => toast.error(`Could not save the ${copy.noun}`, err),
    })
  }
  if (props.hasKey && !replacing)
    return (
      <div className="row" role="group" aria-label={copy.group}>
        <span>{cap(copy.noun)} saved</span>
        <Button onClick={() => setReplacing(true)}>Replace</Button>
        <Button
          onClick={() =>
            ops.remove({
              onSuccess: () => toast.success(`${cap(copy.noun)} removed`),
              onError: (err) => toast.error(`Could not remove the ${copy.noun}`, err),
            })
          }
        >
          Remove
        </Button>
      </div>
    )
  return (
    <form className="stack" onSubmit={save} aria-label={copy.group}>
      <Field label={copy.label} hint={copy.hint}>
        {({ id, describedBy }) => (
          <input
            id={id}
            className="input"
            type="password"
            autoComplete="off"
            value={key}
            disabled={!props.canStore}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            onChange={(e) => setKey(e.target.value)}
          />
        )}
      </Field>
      {!props.canStore && (
        <p className="field__error" role="alert">
          This computer has no secure storage (keychain), so a {copy.noun} cannot be saved.
        </p>
      )}
      <div className="row">
        <Button type="submit" variant="primary" disabled={!key.trim() || !props.canStore}>
          Save {copy.noun}
        </Button>
        {replacing && <Button onClick={() => setReplacing(false)}>Cancel</Button>}
        <Button onClick={ops.openSignup}>{copy.signup}</Button>
      </div>
    </form>
  )
}
