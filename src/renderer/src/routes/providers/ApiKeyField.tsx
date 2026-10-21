// Write-only API key input. The renderer never receives a stored key, so this field can only
// say whether one exists and offer Replace / Clear. Value: string = set, null = clear,
// undefined = leave as is.
import { useState } from 'react'
import { Badge, Button, Field } from '../../components/ui'

export type KeyChange = string | null | undefined

export function ApiKeyField(props: {
  hasKey: boolean
  required: boolean
  value: KeyChange
  onChange: (v: KeyChange) => void
  error?: string
}) {
  const [replacing, setReplacing] = useState(!props.hasKey)
  const clearing = props.value === null
  const hint = props.required
    ? 'Required. Encrypted with your OS keychain; never stored in project files.'
    : 'Optional. Encrypted with your OS keychain; never stored in project files.'

  if (props.hasKey && !replacing) {
    return (
      <div className="field">
        <span className="field__label">API key</span>
        <div className="row">
          {clearing ? (
            <Badge tone="warn">Key will be removed on save</Badge>
          ) : (
            <Badge tone="ok">Key stored</Badge>
          )}
          {clearing ? (
            <Button size="sm" onClick={() => props.onChange(undefined)}>
              Keep key
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={() => setReplacing(true)}>
                Replace
              </Button>
              <Button size="sm" variant="danger" onClick={() => props.onChange(null)}>
                Clear
              </Button>
            </>
          )}
        </div>
        <span className="field__hint">{hint}</span>
      </div>
    )
  }

  return (
    <Field label="API key" hint={hint} {...(props.error ? { error: props.error } : {})}>
      {({ id, describedBy, invalid }) => (
        <div className="row">
          <input
            id={id}
            className="input mono"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={typeof props.value === 'string' ? props.value : ''}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            placeholder={props.hasKey ? 'Paste a new key' : 'Paste key'}
            onChange={(e) => props.onChange(e.target.value === '' ? undefined : e.target.value)}
          />
          {props.hasKey && (
            <Button
              size="sm"
              onClick={() => {
                setReplacing(false)
                props.onChange(undefined)
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </Field>
  )
}
