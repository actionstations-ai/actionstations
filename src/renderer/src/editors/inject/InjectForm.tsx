// Left side of the inject editor: basics (title, type, variant, delivery), the template's
// fields as a schema-driven form, the instructor note, citations and the media brief.
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { TemplateInfo } from '@shared/ipc'
import { DeliveryMode } from '@shared/schemas/inject'
import { INJECT_TYPES, injectTypeInfo } from '@shared/taxonomy'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import type { InjectDraft } from './draft'
import { formFromSchema, type JsonSchema, type UnknownField } from './schema/fields'
import { remapFields, type RemapResult } from './schema/remap'
import { FieldControl, SchemaForm } from './schema/SchemaForm'
import { IssuesContext } from './schema/form-context'
import { MEDIA_BRIEF_SCHEMA } from './media-brief-schema'

const DELIVERY_LABEL: Record<DeliveryMode, string> = {
  hand_to_role: 'Hand to role (paper)',
  display_main_screen: 'Show on the main screen',
  play_audio: 'Play audio',
  read_aloud: 'Read aloud',
}

export interface FormProps {
  draft: InjectDraft
  onChange: (draft: InjectDraft) => void
  templates: TemplateInfo[]
  template: TemplateInfo | undefined
  variant: string
  onVariant: (v: string) => void
  issues: Map<string, string>
}

function typeOptions(templates: TemplateInfo[], current: string) {
  const installed = new Set(templates.map((t) => t.type))
  const withTemplate = templates
    .map((t) => ({ id: t.type, label: t.label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const without = INJECT_TYPES.filter((t) => !installed.has(t.id)).map((t) => ({
    id: t.id,
    label: `${t.label} (no template)`,
  }))
  if (!installed.has(current) && !without.some((t) => t.id === current))
    without.push({ id: current, label: current })
  return { withTemplate, without }
}

function TypeSwitchDialog(props: {
  pending: { type: string; label: string; result: RemapResult } | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const p = props.pending
  return (
    <Dialog
      open={!!p}
      onOpenChange={(o) => !o && props.onCancel()}
      title={p ? `Switch to ${p.label}?` : 'Switch type'}
      description="Fields with the same name move over. These fields have no place in the new template and will be removed from the editor (the saved versions keep them):"
      footer={
        <>
          <Button onClick={props.onCancel}>Keep current type</Button>
          <Button variant="primary" onClick={props.onConfirm}>
            Switch and drop {p?.result.dropped.length} field
            {p?.result.dropped.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <ul className="dropped-fields" aria-label="Fields that will be dropped">
        {p?.result.dropped.map((k) => (
          <li key={k}>
            <code>{k}</code>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

function TypeSelect(props: {
  templates: TemplateInfo[]
  value: string
  onType: (t: string) => void
}) {
  const { withTemplate, without } = useMemo(
    () => typeOptions(props.templates, props.value),
    [props.templates, props.value],
  )
  return (
    <Field label="Type" hint="Switching keeps fields whose names match.">
      {({ id, describedBy }) => (
        <select
          id={id}
          className="select"
          value={props.value}
          aria-describedby={describedBy}
          onChange={(e) => props.onType(e.target.value)}
        >
          <optgroup label="Templates">
            {withTemplate.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </optgroup>
          {without.length > 0 && (
            <optgroup label="No template">
              {without.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </Field>
  )
}

function VariantSelect(props: {
  variants: string[]
  value: string
  onVariant: (v: string) => void
}) {
  return (
    <Field label="Variant" hint="Saved with the inject; used for the preview, render and export.">
      {({ id, describedBy }) => (
        <select
          id={id}
          className="select"
          value={props.value}
          aria-describedby={describedBy}
          onChange={(e) => props.onVariant(e.target.value)}
        >
          {props.variants.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

function DeliverySelect(props: { value: DeliveryMode; onChange: (m: DeliveryMode) => void }) {
  return (
    <Field label="Delivery">
      {({ id }) => (
        <select
          id={id}
          className="select"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value as DeliveryMode)}
        >
          {DeliveryMode.options.map((m) => (
            <option key={m} value={m}>
              {DELIVERY_LABEL[m]}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

function BasicsSection(props: FormProps & { onType: (type: string) => void }) {
  const { draft, onChange, template } = props
  const variants = template?.variants.length ? template.variants : []
  return (
    <fieldset className="editor-section">
      <legend>Inject</legend>
      <div className="editor-grid">
        <Field label="Title *" hint="Shown in the deck index and the controller handbook.">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              value={draft.title}
              aria-describedby={describedBy}
              aria-required
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
            />
          )}
        </Field>
        <TypeSelect templates={props.templates} value={draft.type} onType={props.onType} />
        {variants.length > 1 && (
          <VariantSelect variants={variants} value={props.variant} onVariant={props.onVariant} />
        )}
        <DeliverySelect
          value={draft.deliveryMode}
          onChange={(m) => onChange({ ...draft, deliveryMode: m })}
        />
      </div>
      <label className="ie-checkbox">
        <input
          type="checkbox"
          checked={draft.includeInDeck}
          onChange={(e) => onChange({ ...draft, includeInDeck: e.target.checked })}
        />
        <span>Include a page for this inject in the Master Inject Deck</span>
      </label>
    </fieldset>
  )
}

const RAW_FIELDS: UnknownField = {
  kind: 'unknown',
  name: 'fields',
  label: 'Fields',
  description: 'This type has no template; its fields are free-form JSON.',
  required: true,
  examples: [],
}

function TemplateFields(props: FormProps) {
  const { draft, onChange, template } = props
  const spec = useMemo(
    () => (template ? formFromSchema(template.schema as JsonSchema) : null),
    [template],
  )
  const onFields = (fields: Record<string, unknown>) => onChange({ ...draft, fields })
  return (
    <fieldset className="editor-section">
      <legend>{template ? `${template.label} fields` : 'Fields'}</legend>
      {template?.schema.description ? (
        <p className="field__hint">{String(template.schema.description)}</p>
      ) : null}
      {spec ? (
        <SchemaForm spec={spec} value={draft.fields} onChange={onFields} issues={props.issues} />
      ) : (
        <IssuesContext.Provider value={props.issues}>
          <FieldControl
            spec={RAW_FIELDS}
            value={draft.fields}
            path=""
            onChange={(v) => onFields((v ?? {}) as Record<string, unknown>)}
          />
        </IssuesContext.Provider>
      )}
    </fieldset>
  )
}

function CitationsSection({ draft, onChange }: Pick<FormProps, 'draft' | 'onChange'>) {
  return (
    <fieldset className="editor-section">
      <legend>Citations ({draft.citations.length})</legend>
      {draft.citations.length ? (
        <ul className="citation-list" aria-label="Citations">
          {draft.citations.map((c, i) => (
            <li key={`${c.documentId}-${i}`}>
              <div>
                <strong>{c.headingPath || c.documentTitle}</strong>
                {c.page ? <span className="muted"> · p. {c.page}</span> : null}
                {c.quote && <p className="muted citation-list__quote">“{c.quote}”</p>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon
                aria-label={`Remove citation ${i + 1}`}
                onClick={() =>
                  onChange({ ...draft, citations: draft.citations.filter((_, j) => j !== i) })
                }
              >
                <X size={14} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No plan sections cited for this inject.</p>
      )}
    </fieldset>
  )
}

function MediaBriefSection({ draft, onChange }: Pick<FormProps, 'draft' | 'onChange'>) {
  const spec = useMemo(() => formFromSchema(MEDIA_BRIEF_SCHEMA), [])
  const brief = (draft.mediaBrief ?? {}) as Record<string, unknown>
  return (
    <details className="editor-section editor-section--details">
      <summary>Media brief (AI image, video and voice prompts)</summary>
      <p className="field__hint">
        Used by Regenerate media. Image prompts describe what is in the picture; never rely on
        legible text in AI images.
      </p>
      <SchemaForm
        spec={spec}
        value={brief}
        issues={new Map()}
        onChange={(next) =>
          onChange({
            ...draft,
            mediaBrief: Object.keys(next).length
              ? ({ paths: ['template'], ...next } as InjectDraft['mediaBrief'])
              : undefined,
          })
        }
      />
    </details>
  )
}

export function InjectForm(props: FormProps) {
  const [pending, setPending] = useState<{
    type: string
    label: string
    result: RemapResult
  } | null>(null)
  const applyType = (type: string, result: RemapResult) => {
    props.onChange({ ...props.draft, type, fields: result.fields })
    const renamed = Object.entries(result.renamed)
    if (renamed.length)
      toast.info('Fields carried over', renamed.map(([to, from]) => `${from} → ${to}`).join(', '))
  }
  const onType = (type: string) => {
    if (type === props.draft.type) return
    const target = props.templates.find((t) => t.type === type)
    const label = target?.label ?? injectTypeInfo(type)?.label ?? type
    const result: RemapResult = target
      ? remapFields(props.draft.fields, target.schema as JsonSchema)
      : { fields: props.draft.fields, dropped: [], renamed: {} }
    if (result.dropped.length) setPending({ type, label, result })
    else applyType(type, result)
  }
  return (
    <div className="inject-form">
      <BasicsSection {...props} onType={onType} />
      <TemplateFields {...props} />
      <fieldset className="editor-section">
        <legend>Instructor note</legend>
        <Field
          label="Note for the controller"
          hint="Not shown to players. Why this inject exists and what to watch for."
        >
          {({ id, describedBy }) => (
            <textarea
              id={id}
              className="textarea"
              rows={3}
              value={props.draft.instructorNote}
              aria-describedby={describedBy}
              onChange={(e) => props.onChange({ ...props.draft, instructorNote: e.target.value })}
            />
          )}
        </Field>
      </fieldset>
      <CitationsSection draft={props.draft} onChange={props.onChange} />
      <MediaBriefSection draft={props.draft} onChange={props.onChange} />
      <TypeSwitchDialog
        pending={pending}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) applyType(pending.type, pending.result)
          setPending(null)
        }}
      />
    </div>
  )
}
