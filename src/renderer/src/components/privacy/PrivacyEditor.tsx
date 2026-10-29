// Review policy, redaction categories and term lists (#433, FR-6, FR-9). Used for the global
// defaults (Settings → Privacy) and a project's overrides. Turning review off asks first and
// names the cloud providers it affects.
import { useId, useState } from 'react'
import type { PrivacySettings, ReviewPolicy } from '@shared/schemas'
import { Button, Dialog } from '../ui'
import {
  ALL_CATEGORIES,
  CATEGORY_LABEL,
  REVIEW_OPTIONS,
  addTerm,
  categoryOn,
} from './privacy-model'
import './privacy.css'

export function TermList(props: {
  label: string
  hint: string
  terms: string[]
  onChange: (terms: string[]) => void
}) {
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const add = () => {
    const next = addTerm(props.terms, value)
    if (!next) return setError('Enter 2 to 200 characters.')
    setError('')
    setValue('')
    props.onChange(next)
  }
  return (
    <div className="stack" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="field__label">
        {props.label}
      </span>
      <span id={`${id}-hint`} className="field__hint">
        {props.hint}
      </span>
      {props.terms.length > 0 && (
        <ul className="privacy-terms">
          {props.terms.map((t) => (
            <li key={t}>
              <span>{t}</span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${t} from ${props.label}`}
                onClick={() => props.onChange(props.terms.filter((x) => x !== t))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <input
          className="input"
          aria-label={`Add to ${props.label}`}
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          value={value}
          maxLength={200}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button onClick={add}>Add</Button>
      </div>
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

function ReviewField(props: { value: ReviewPolicy; onChange: (v: ReviewPolicy) => void }) {
  const name = useId()
  return (
    <fieldset className="privacy-fieldset">
      <legend>Before a request goes to a cloud provider</legend>
      {REVIEW_OPTIONS.map((o) => (
        <label key={o.value} className="privacy-radio">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={props.value === o.value}
            aria-describedby={`${name}-${o.value}`}
            onChange={() => props.onChange(o.value)}
          />
          <span>
            {o.label}
            <span id={`${name}-${o.value}`} className="field__hint">
              {o.hint}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

function CategoriesField(props: {
  value: PrivacySettings
  onChange: (redact: PrivacySettings['redact']) => void
}) {
  return (
    <fieldset className="privacy-fieldset">
      <legend>Replace with placeholders before sending</legend>
      {ALL_CATEGORIES.map((c) => (
        <label key={c} className="row">
          <input
            type="checkbox"
            checked={categoryOn(props.value, c)}
            onChange={(e) => props.onChange({ ...props.value.redact, [c]: e.target.checked })}
          />
          {CATEGORY_LABEL[c]}
        </label>
      ))}
      <span className="field__hint">
        Detection uses patterns and name lists, so it can miss values or catch extra words. The
        approval dialog highlights what was replaced. Embeddings and media prompts are never
        redacted.
      </span>
    </fieldset>
  )
}

function OffConfirm(props: {
  open: boolean
  providers: string[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const names = props.providers.length ? props.providers.join(', ') : 'any cloud provider'
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onCancel()}
      title="Stop asking before cloud requests?"
      description={`Requests to ${names} will go without asking. Every send is still recorded in the project's send log.`}
      footer={
        <>
          <Button onClick={props.onCancel}>Keep asking</Button>
          <Button variant="danger" onClick={props.onConfirm}>
            Never ask
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

export function PrivacyEditor(props: {
  value: PrivacySettings
  remoteProviders: string[]
  saving: boolean
  saveLabel?: string
  onSave: (settings: PrivacySettings, confirmOff?: true) => void
}) {
  const [draft, setDraft] = useState<PrivacySettings>(props.value)
  const [confirming, setConfirming] = useState(false)
  const set = (patch: Partial<PrivacySettings>) => setDraft((d) => ({ ...d, ...patch }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(props.value)
  const save = () => {
    if (draft.review === 'off' && props.value.review !== 'off') return setConfirming(true)
    props.onSave(draft, draft.review === 'off' ? true : undefined)
  }
  return (
    <div className="stack">
      <ReviewField value={draft.review} onChange={(review) => set({ review })} />
      <CategoriesField value={draft} onChange={(redact) => set({ redact })} />
      <TermList
        label="Always redact"
        hint="Words the patterns miss, for example a nickname or a private business."
        terms={draft.alwaysRedact}
        onChange={(alwaysRedact) => set({ alwaysRedact })}
      />
      <TermList
        label="Never redact"
        hint="Words that are not personal, for example your organization or city."
        terms={draft.neverRedact}
        onChange={(neverRedact) => set({ neverRedact })}
      />
      <div className="row">
        <Button variant="primary" disabled={!dirty || props.saving} onClick={save}>
          {props.saveLabel ?? 'Save privacy settings'}
        </Button>
        {dirty && <span className="muted">Unsaved changes</span>}
      </div>
      <OffConfirm
        open={confirming}
        providers={props.remoteProviders}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          props.onSave(draft, true)
        }}
      />
    </div>
  )
}
