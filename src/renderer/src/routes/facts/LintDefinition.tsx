// A category's lint definition in the facts editor (#180): the noun the extractor and the lint
// look for, a generic noun counted only in context, the id shape, whether lint checks the
// kind and whether the model sees the complete list. Keyboard first: Enter in any field saves,
// Escape cancels and returns focus to the toggle, a failed save focuses the first field in
// error and the message is announced (Field renders errors with role="alert").
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { FactCategory } from '@shared/domains'
import { Badge, Button, Field } from '../../components/ui'
import {
  definitionErrors,
  draftOf,
  ID_SHAPES,
  specOf,
  type DefinitionDraft,
  type DefinitionErrors,
} from './lint-definition'

export interface LintDefinitionProps {
  label: string
  spec: FactCategory
  /** A category the user added, which the domain profile does not define (#350). */
  userCategory?: boolean
  /** The project has a definition (false: a user category with none yet; `spec` is a blank start). */
  defined?: boolean
  /** The project's definition differs from the domain's. */
  customized: boolean
  /** facility-facts.md has the designer's edits (re-extraction then goes to the .generated file). */
  editedFile: boolean
  /** Why saving is unavailable right now (unsaved entry edits), if it is. */
  blocked: string | undefined
  saving: boolean
  onSave: (spec: FactCategory) => Promise<boolean>
  onRestore: () => Promise<boolean>
}

function summary(spec: FactCategory, defined: boolean): string {
  if (!defined) return 'No lint definition: shown to the model, not linted'
  const shape = ID_SHAPES.find((s) => s.value === spec.idShape)?.label.split(':')[0]
  const parts = [
    spec.pattern ? 'Custom pattern' : `Noun ${spec.noun ?? ''}`,
    spec.genericNoun ? `generic noun ${spec.genericNoun} in context` : '',
    spec.pattern ? '' : (shape ?? ''),
    spec.lint ? 'checked by lint' : 'not linted',
    spec.complete ? 'complete list shown to the model' : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

const FIELD_ORDER = ['noun', 'genericNoun', 'context'] as const

function SaveNote(props: { editedFile: boolean }) {
  return props.editedFile ? (
    <p className="field__hint">
      facility-facts.md has your edits, so saving keeps its lists as they are: the new extraction
      goes to facility-facts.generated.md and shows under “From the documents, not in your list”.
      Lint uses the new definition right away.
    </p>
  ) : (
    <p className="field__hint">
      Saving extracts the facts from the documents again with this definition and re-runs the
      scenario check.
    </p>
  )
}

function NounFields(props: {
  draft: DefinitionDraft
  errors: DefinitionErrors
  set: (patch: Partial<DefinitionDraft>) => void
  register: (field: string) => (el: HTMLElement | null) => void
}) {
  const { draft, errors, set, register } = props
  const text = (field: 'noun' | 'genericNoun' | 'context', label: string, hint: string) => (
    <Field label={label} hint={hint} {...(errors[field] ? { error: errors[field] } : {})}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          ref={register(field)}
          className="input facts-def__regex"
          value={draft[field]}
          spellCheck={false}
          autoComplete="off"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => set({ [field]: e.target.value })}
        />
      )}
    </Field>
  )
  return (
    <>
      {text(
        'noun',
        'Noun',
        'A regular expression, case-insensitive: alternatives with |, ? for an optional letter, (?:…) for a group. Example: Bus Routes?|Routes?',
      )}
      {text(
        'genericNoun',
        'Generic noun (optional)',
        'A broader noun that counts only where the context matches, and never after a qualifier such as Patrol or Access. Example: Units?',
      )}
      {text(
        'context',
        'Context',
        'Needed with a generic noun: words that say a sentence or row is about this kind. Example: turbine|powerhouse|\\bMW\\b',
      )}
      <Field label="Identifier shape">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={draft.idShape}
            onChange={(e) => set({ idShape: e.target.value as DefinitionDraft['idShape'] })}
          >
            {ID_SHAPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </Field>
    </>
  )
}

function Checks(props: { draft: DefinitionDraft; set: (patch: Partial<DefinitionDraft>) => void }) {
  const id = useId()
  return (
    <fieldset className="facts-def__checks">
      <legend className="sr-only">Options</legend>
      <label className="facts-def__check">
        <input
          type="checkbox"
          checked={props.draft.lint}
          aria-describedby={`${id}-lint`}
          onChange={(e) => props.set({ lint: e.target.checked })}
        />
        <span>Checked by lint</span>
      </label>
      <span id={`${id}-lint`} className="field__hint">
        Scenario events that name an identifier of this kind missing from the list are flagged.
      </span>
      <label className="facts-def__check">
        <input
          type="checkbox"
          checked={props.draft.complete}
          aria-describedby={`${id}-complete`}
          onChange={(e) => props.set({ complete: e.target.checked })}
        />
        <span>Complete list</span>
      </label>
      <span id={`${id}-complete`} className="field__hint">
        Show the model every identifier as the complete list, instead of the first 20.
      </span>
    </fieldset>
  )
}

function useDefinitionForm(props: LintDefinitionProps, close: () => void) {
  const [draft, setDraft] = useState<DefinitionDraft>(() => draftOf(props.spec))
  const [errors, setErrors] = useState<DefinitionErrors>({})
  const [tried, setTried] = useState(false)
  const fields = useRef(new Map<string, HTMLElement>())
  const register = (field: string) => (el: HTMLElement | null) => {
    if (el) fields.current.set(field, el)
    else fields.current.delete(field)
  }
  const set = (patch: Partial<DefinitionDraft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (tried) setErrors(definitionErrors(specOf(props.spec, next)))
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (props.blocked || props.saving) return
    const spec = specOf(props.spec, draft)
    const found = definitionErrors(spec)
    setTried(true)
    setErrors(found)
    const first = FIELD_ORDER.find((f) => found[f])
    if (first) {
      fields.current.get(first)?.focus()
      return
    }
    if (await props.onSave(spec)) close()
  }
  const reset = () => {
    setDraft(draftOf(props.spec))
    setErrors({})
    setTried(false)
  }
  return { draft, errors, set, submit, reset, register }
}

export function LintDefinition(props: LintDefinitionProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  /** Focus the element with this id, or its first form control when `control` is set. */
  const focus = (elementId: string, control = false) =>
    requestAnimationFrame(() => {
      const el = document.getElementById(elementId)
      ;(control ? el?.querySelector<HTMLElement>('input, select') : el)?.focus()
    })
  const close = () => {
    setOpen(false)
    focus(`${id}-toggle`)
  }
  const form = useDefinitionForm(props, close)
  const defined = props.defined ?? true
  const removable = props.userCategory ? defined : props.customized
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    close()
  }
  const show = () => {
    form.reset()
    setOpen(true)
    focus(`${id}-form`, true)
  }
  return (
    <div className="facts-def">
      <div className="facts-def__summary">
        <span className={defined ? 'mono facts-def__text' : 'muted facts-def__text'}>
          {summary(props.spec, defined)}
        </span>
        {props.userCategory
          ? defined && <Badge tone="info">Defined for this project</Badge>
          : props.customized && <Badge tone="info">Changed for this project</Badge>}
        <Button
          size="sm"
          id={`${id}-toggle`}
          aria-expanded={open}
          aria-controls={`${id}-form`}
          onClick={() => (open ? close() : show())}
        >
          {open ? 'Close lint definition' : defined ? 'Edit lint definition' : 'Define for lint'}
        </Button>
      </div>
      {open && (
        <form
          id={`${id}-form`}
          className="facts-def__form"
          aria-label={`Lint definition for ${props.label}`}
          noValidate
          onSubmit={(e) => void form.submit(e)}
          onKeyDown={onKeyDown}
        >
          {props.spec.pattern ? (
            <p className="field__hint">
              This kind is found with a custom pattern (
              <span className="mono">{props.spec.pattern}</span>), which is edited in project.json.
              Here you can change whether lint checks it and whether the model sees the complete
              list.
            </p>
          ) : (
            <NounFields
              draft={form.draft}
              errors={form.errors}
              set={form.set}
              register={form.register}
            />
          )}
          <Checks draft={form.draft} set={form.set} />
          <SaveNote editedFile={props.editedFile} />
          {props.blocked && <p className="field__error">{props.blocked}</p>}
          <div className="row facts-def__actions">
            <Button type="submit" variant="primary" disabled={!!props.blocked || props.saving}>
              {props.saving ? 'Saving…' : 'Save definition'}
            </Button>
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            {removable && (
              <Button
                type="button"
                disabled={!!props.blocked || props.saving}
                onClick={() => void props.onRestore().then((ok) => ok && close())}
              >
                {props.userCategory ? 'Remove the lint definition' : 'Use the domain’s definition'}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
