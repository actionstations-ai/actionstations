// Fixed term pairs for a player language (spec 0435 FR-8): each English term and the
// translation the model must use. A translation that leaves one out is flagged in the review.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { MAX_GLOSSARY_ENTRIES, type GlossaryEntry, type SupportedLanguage } from '@shared/schemas'
import { Button } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcMutation } from '../../lib/query'

const LANGUAGE_NAME: Record<SupportedLanguage, string> = { es: 'Spanish' }

export function GlossaryEditor(props: {
  projectPath: string
  lang: SupportedLanguage
  /** The entries in effect: the defaults and the project's own. */
  entries: GlossaryEntry[]
  onSaved: () => void
}) {
  const language = LANGUAGE_NAME[props.lang]
  const [rows, setRows] = useState<GlossaryEntry[]>(props.entries)
  const [error, setError] = useState('')
  const save = useIpcMutation('project:glossary:set')
  // Take new entries from the server (after a save) without an effect.
  const [seen, setSeen] = useState(props.entries)
  if (seen !== props.entries) {
    setSeen(props.entries)
    setRows(props.entries)
  }

  const patch = (i: number, p: Partial<GlossaryEntry>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...p } : row)))
  const submit = () => {
    setError('')
    const entries = rows.filter((r) => r.term.trim() && r.translation.trim())
    save.mutate(
      { projectPath: props.projectPath, lang: props.lang, entries },
      { onSuccess: props.onSaved, onError: (e) => setError(errorText(e)) },
    )
  }
  return (
    <section className="stack" aria-labelledby="glossary-heading">
      <h3 id="glossary-heading">Glossary: English to {language}</h3>
      <p className="muted">
        The model must use these translations, and the review flags any translation that leaves one
        out. Up to {MAX_GLOSSARY_ENTRIES} terms.
      </p>
      <table className="glossary-table">
        <caption className="sr-only">Glossary terms</caption>
        <thead>
          <tr>
            <th scope="col">English term</th>
            <th scope="col">{language} translation</th>
            <th scope="col">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  className="input"
                  aria-label={`English term ${i + 1}`}
                  lang="en"
                  maxLength={200}
                  value={row.term}
                  onChange={(e) => patch(i, { term: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="input"
                  aria-label={`${language} translation ${i + 1}`}
                  lang={props.lang}
                  maxLength={200}
                  value={row.translation}
                  onChange={(e) => patch(i, { translation: e.target.value })}
                />
              </td>
              <td>
                <Button
                  variant="ghost"
                  icon
                  aria-label={`Remove term ${row.term || i + 1}`}
                  onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} aria-hidden />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <Button
          disabled={rows.length >= MAX_GLOSSARY_ENTRIES}
          onClick={() => setRows((r) => [...r, { term: '', translation: '' }])}
        >
          <Plus size={16} aria-hidden /> Add term
        </Button>
        <Button variant="primary" disabled={save.isPending} onClick={submit}>
          Save glossary
        </Button>
      </div>
    </section>
  )
}
