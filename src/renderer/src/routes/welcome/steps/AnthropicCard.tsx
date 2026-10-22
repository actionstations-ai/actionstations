// Add Anthropic with an API key. The key goes to main once and is stored encrypted by the OS
// keychain; the renderer never reads it back.
import { useState, type FormEvent } from 'react'
import { Badge, Button, Field } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { useUpsertProvider } from '../use-setup'
import type { ProviderViewT } from '../wizard-state'

export function AnthropicCard(props: {
  existing?: ProviderViewT
  onAdded: (p: ProviderViewT) => void
}) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string>()
  const upsert = useUpsertProvider()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!key.trim()) {
      setError('Paste an API key from console.anthropic.com.')
      return
    }
    upsert.mutate(
      {
        config: {
          kind: 'anthropic',
          label: 'Anthropic',
          baseUrl: 'https://api.anthropic.com',
          options: {},
          enabled: true,
        },
        apiKey: key.trim(),
      },
      {
        onSuccess: (v) => {
          setKey('')
          setError(undefined)
          toast.success('Anthropic added')
          props.onAdded(v)
        },
        onError: (err) => toast.error('Could not add Anthropic', err),
      },
    )
  }
  return (
    <form className="card stack" onSubmit={submit} noValidate aria-label="Anthropic">
      <div className="row wizard-card__head">
        <h3>Anthropic (Claude, cloud)</h3>
        {props.existing && <Badge tone="ok">Added</Badge>}
      </div>
      <p className="muted">
        Strongest drafting quality. Prompts and retrieved excerpts from your documents are sent to
        Anthropic, and usage is billed to your Anthropic account per token; generating a full
        exercise makes many calls. Prefer a local model if your documents must not leave this
        computer.
      </p>
      {!props.existing && (
        <>
          <Field
            label="Anthropic API key"
            hint="Encrypted with your OS keychain. Never written to project files or logs."
            error={error}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="input mono"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(e) => setKey(e.target.value)}
              />
            )}
          </Field>
          <div className="row">
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? 'Adding…' : 'Add Anthropic'}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}
