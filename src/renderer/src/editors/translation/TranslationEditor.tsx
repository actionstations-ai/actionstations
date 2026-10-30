// Side-by-side review of one translated item (spec 0435 FR-8): the English on the left,
// read-only; the translation on the right, editable. Both columns carry their `lang`, so a
// screen reader switches voices. Ctrl or Cmd + Enter saves the item as reviewed and moves on.
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { ItemRef, TranslationItemText } from '@shared/ipc'
import type { SupportedLanguage } from '@shared/schemas'
import { Badge, Button } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fieldRows, getAtPath, setAtPath, type FieldRow } from './fields'

const STATUS_TEXT = {
  missing: 'Not translated',
  machine: 'Machine translation, not reviewed',
  stale: 'English changed since',
  reviewed: 'Reviewed',
} as const

interface Draft {
  markdown: string
  title: string
  fields: Record<string, unknown>
}

const draftOf = (t: TranslationItemText): Draft => ({
  markdown: t.translated ?? '',
  title: t.translatedTitle ?? '',
  fields: t.translatedFields ?? {},
})

function Box(props: {
  id: string
  label: string
  lang: string
  value: string
  readOnly?: boolean
  rows?: number
  onChange?: (v: string) => void
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={props.id}>
        {props.label}
      </label>
      <textarea
        id={props.id}
        className="textarea"
        lang={props.lang}
        dir="ltr"
        readOnly={props.readOnly}
        rows={props.rows ?? 4}
        value={props.value}
        onChange={(e) => props.onChange?.(e.target.value)}
      />
    </div>
  )
}

function DocumentColumns(props: {
  base: string
  item: TranslationItemText
  draft: Draft
  onDraft: (d: Draft) => void
  lang: SupportedLanguage
}) {
  const { base, item, draft } = props
  return (
    <>
      <div className="translation-editor__col">
        <Box
          id={`${base}-en`}
          label="English (original)"
          lang="en"
          readOnly
          rows={18}
          value={item.source ?? ''}
        />
      </div>
      <div className="translation-editor__col">
        <Box
          id={`${base}-tr`}
          label="Spanish (edit here)"
          lang={props.lang}
          rows={18}
          value={draft.markdown}
          onChange={(markdown) => props.onDraft({ ...draft, markdown })}
        />
      </div>
    </>
  )
}

/** A survey names its keys ("Question 3: answer 2"); an inject's labels come from its field names. */
const rowLabel = (item: TranslationItemText, r: FieldRow): string =>
  item.fieldLabels?.[String(r.path[0])] ?? r.label

function InjectColumns(props: {
  base: string
  item: TranslationItemText
  draft: Draft
  onDraft: (d: Draft) => void
  lang: SupportedLanguage
}) {
  const { base, item, draft } = props
  const rows: FieldRow[] = useMemo(() => fieldRows(item.sourceFields ?? {}), [item.sourceFields])
  return (
    <>
      <div className="translation-editor__col">
        <Box
          id={`${base}-t-en`}
          label="Title (English)"
          lang="en"
          readOnly
          rows={1}
          value={item.sourceTitle ?? ''}
        />
        {rows.map((r, i) => (
          <Box
            key={i}
            id={`${base}-en-${i}`}
            label={`${rowLabel(item, r)} (English)`}
            lang="en"
            readOnly
            value={r.value}
          />
        ))}
      </div>
      <div className="translation-editor__col">
        <Box
          id={`${base}-t-tr`}
          label="Title (Spanish)"
          lang={props.lang}
          rows={1}
          value={draft.title}
          onChange={(title) => props.onDraft({ ...draft, title })}
        />
        {rows.map((r, i) => (
          <Box
            key={i}
            id={`${base}-tr-${i}`}
            label={`${rowLabel(item, r)} (Spanish)`}
            lang={props.lang}
            value={String(getAtPath(draft.fields, r.path) ?? '')}
            onChange={(v) =>
              props.onDraft({
                ...draft,
                fields: setAtPath(draft.fields, r.path, v) as Record<string, unknown>,
              })
            }
          />
        ))}
      </div>
    </>
  )
}

interface EditorProps {
  projectPath: string
  scenarioId: string
  lang: SupportedLanguage
  item: ItemRef
  hasNext: boolean
  onNext: () => void
  onClose: () => void
  onSaved: () => void
}

/** Loads one item fresh and edits it; give it a `key` per item so a draft never carries over. */
export function TranslationEditor(props: EditorProps) {
  const { projectPath, scenarioId, lang, item } = props
  const query = useIpcQuery(
    'translate:get-item',
    { projectPath, scenarioId, lang, item },
    { staleTime: 0, gcTime: 0 },
  )
  if (query.error) return <p role="alert">{errorText(query.error)}</p>
  if (!query.data) return <p role="status">Loading…</p>
  return <EditorBody {...props} data={query.data} />
}

function EditorBody(props: EditorProps & { data: TranslationItemText }) {
  const { projectPath, scenarioId, lang, item, data } = props
  const base = useId()
  const [draft, setDraft] = useState<Draft>(() => draftOf(data))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (andNext: boolean) => {
    setSaving(true)
    setError('')
    try {
      await call('translate:save-item', {
        projectPath,
        scenarioId,
        lang,
        item,
        ...(item.kind === 'doc'
          ? { markdown: draft.markdown }
          : { title: draft.title, fields: draft.fields }),
      })
      props.onSaved()
      if (andNext && props.hasNext) props.onNext()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void save(true)
    }
  }
  const Columns = item.kind === 'doc' ? DocumentColumns : InjectColumns
  return (
    <section
      className="translation-editor card stack"
      aria-label={`Review: ${data.label}`}
      onKeyDown={onKeyDown}
    >
      <header className="row">
        <h3>{data.label}</h3>
        <Badge tone={data.status === 'reviewed' ? 'ok' : 'warn'}>{STATUS_TEXT[data.status]}</Badge>
      </header>
      {data.flags.length > 0 && (
        <ul className="translation-editor__flags" aria-label="Glossary hints">
          {data.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <div className="translation-editor__cols">
        <Columns base={base} item={data} draft={draft} onDraft={setDraft} lang={lang} />
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <Button variant="primary" disabled={saving} onClick={() => void save(false)}>
          Save and mark reviewed
        </Button>
        {props.hasNext && (
          <Button disabled={saving} onClick={() => void save(true)}>
            Save, then next
          </Button>
        )}
        <Button variant="ghost" onClick={props.onClose}>
          Close
        </Button>
        <span className="muted">Ctrl or Cmd + Enter saves and moves to the next item.</span>
      </div>
    </section>
  )
}
