// A form generated from a template's JSON Schema (see fields.ts for the mapping). Each control
// is labelled from the schema title or field name and described by the schema description.
// Issues (from validate.ts) are keyed by JSON pointer and shown next to their control.
import { useState, type ReactNode } from 'react'
import { Field } from '../../../components/ui'
import type {
  BooleanField,
  EnumField,
  FieldSpec,
  NumberField,
  NumberOrTextField,
  ObjectField,
  StringField,
  UnknownField,
} from './fields'
import { IssuesContext, labelOf, useIssue, type ControlProps } from './form-context'
import { EnumListEditor, ObjectListEditor, StringListEditor } from './ListEditors'
import { numberOrText, parseNumber, setKey, type Fields } from './values'

function Hint({ spec, extra }: { spec: FieldSpec; extra?: ReactNode }) {
  if (!spec.description && !extra) return null
  return (
    <>
      {spec.description}
      {spec.description && extra ? ' ' : ''}
      {extra}
    </>
  )
}

function StringControl({ spec, value, onChange, path }: ControlProps<StringField>) {
  const error = useIssue(path)
  const text = typeof value === 'string' ? value : value === undefined ? '' : String(value)
  const counter =
    spec.maxLength !== undefined ? (
      <span className="schema-form__count">
        {text.length}/{spec.maxLength}
      </span>
    ) : undefined
  return (
    <Field label={labelOf(spec)} hint={<Hint spec={spec} extra={counter} />} error={error}>
      {({ id, describedBy, invalid }) => {
        const common = {
          id,
          value: text,
          'aria-describedby': describedBy,
          'aria-invalid': invalid || undefined,
          'aria-required': spec.required || undefined,
          placeholder:
            typeof spec.examples[0] === 'string' ? `e.g. ${spec.examples[0]}` : undefined,
        }
        return spec.widget === 'textarea' ? (
          <textarea
            {...common}
            className="textarea"
            rows={Math.min(10, Math.max(3, Math.ceil(text.length / 70)))}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input {...common} className="input" onChange={(e) => onChange(e.target.value)} />
        )
      }}
    </Field>
  )
}

function EnumControl({ spec, value, onChange, path }: ControlProps<EnumField>) {
  const error = useIssue(path)
  const current = value === undefined ? '' : String(value)
  return (
    <Field label={labelOf(spec)} hint={<Hint spec={spec} />} error={error}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          className="select"
          value={current}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const picked = spec.options.find((o) => String(o) === e.target.value)
            onChange(picked)
          }}
        >
          {(!spec.required || current === '') && <option value="">—</option>}
          {spec.options.map((o) => (
            <option key={String(o)} value={String(o)}>
              {String(o)}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

function NumberControl({ spec, value, onChange, path }: ControlProps<NumberField>) {
  const error = useIssue(path)
  return (
    <Field label={labelOf(spec)} hint={<Hint spec={spec} />} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type="number"
          className="input input--narrow"
          value={typeof value === 'number' ? value : ''}
          min={spec.minimum}
          max={spec.maximum}
          step={spec.integer ? 1 : 'any'}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(parseNumber(e.target.value, spec.integer))}
        />
      )}
    </Field>
  )
}

function NumberOrTextControl({ spec, value, onChange, path }: ControlProps<NumberOrTextField>) {
  const error = useIssue(path)
  return (
    <Field label={labelOf(spec)} hint={<Hint spec={spec} />} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="input input--narrow"
          value={value === undefined ? '' : String(value)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(numberOrText(e.target.value))}
        />
      )}
    </Field>
  )
}

function BooleanControl({ spec, value, onChange, path }: ControlProps<BooleanField>) {
  const error = useIssue(path)
  return (
    <div className="field">
      <label className="ie-checkbox">
        <input
          type="checkbox"
          checked={value === true}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{spec.label}</span>
      </label>
      {spec.description && <span className="field__hint">{spec.description}</span>}
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

/** Fields the form cannot describe are edited as JSON (parsed when focus leaves). */
function JsonControl({ spec, value, onChange, path }: ControlProps<UnknownField>) {
  const error = useIssue(path)
  const [draft, setDraft] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string>()
  const shown = draft ?? (value === undefined ? '' : JSON.stringify(value, null, 2))
  return (
    <Field
      label={labelOf(spec)}
      hint={<Hint spec={spec} extra="(JSON)" />}
      error={parseError ?? error}
    >
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          className="textarea mono"
          rows={4}
          value={shown}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft === null) return
            try {
              onChange(draft.trim() ? JSON.parse(draft) : undefined)
              setDraft(null)
              setParseError(undefined)
            } catch (e) {
              setParseError(`Not valid JSON: ${(e as Error).message}`)
            }
          }}
        />
      )}
    </Field>
  )
}

function ObjectFieldset({ spec, value, onChange, path }: ControlProps<ObjectField>) {
  const error = useIssue(path)
  const obj = (value && typeof value === 'object' ? value : {}) as Fields
  return (
    <fieldset className="schema-form__group">
      <legend>{labelOf(spec)}</legend>
      {spec.description && <p className="field__hint">{spec.description}</p>}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <ObjectBody
        spec={spec}
        value={obj}
        path={path}
        onChange={(next) => onChange(Object.keys(next).length || spec.required ? next : undefined)}
      />
    </fieldset>
  )
}

/** One control for one field, chosen by the spec's kind. */
export function FieldControl(props: ControlProps) {
  const { spec } = props
  switch (spec.kind) {
    case 'string':
      return <StringControl {...props} spec={spec} />
    case 'enum':
      return <EnumControl {...props} spec={spec} />
    case 'number':
      return <NumberControl {...props} spec={spec} />
    case 'number-or-text':
      return <NumberOrTextControl {...props} spec={spec} />
    case 'boolean':
      return <BooleanControl {...props} spec={spec} />
    case 'string-list':
      return <StringListEditor {...props} spec={spec} />
    case 'enum-list':
      return <EnumListEditor {...props} spec={spec} />
    case 'object-list':
      return <ObjectListEditor {...props} spec={spec} />
    case 'object':
      return <ObjectFieldset {...props} spec={spec} />
    case 'unknown':
      return <JsonControl {...props} spec={spec} />
  }
}

/** The controls for every property of an object spec. */
export function ObjectBody(props: {
  spec: ObjectField
  value: Fields
  onChange: (value: Fields) => void
  path: string
}) {
  const { spec, value, onChange, path } = props
  return (
    <div className="schema-form__fields">
      {spec.fields.map((f) => (
        <FieldControl
          key={f.name}
          spec={f}
          value={value[f.name]}
          path={`${path}/${f.name}`}
          onChange={(v) => onChange(setKey(value, f.name, v, f.required))}
        />
      ))}
    </div>
  )
}

/** Top-level form for an inject's template fields. */
export function SchemaForm(props: {
  spec: ObjectField
  value: Fields
  onChange: (value: Fields) => void
  issues: Map<string, string>
}) {
  return (
    <IssuesContext.Provider value={props.issues}>
      <div className="schema-form">
        <ObjectBody spec={props.spec} value={props.value} onChange={props.onChange} path="" />
      </div>
    </IssuesContext.Provider>
  )
}
