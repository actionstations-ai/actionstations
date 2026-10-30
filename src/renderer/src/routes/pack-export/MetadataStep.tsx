// Step 2: metadata. The id follows the name (io.github.<user>.<name>) until the author edits
// it; minAppVersion is the running app's version.
import { Field } from '../../components/ui'
import { ContributorsEditor } from './ContributorsEditor'
import { suggestPackId, type Update, type WizardState } from './wizard-model'

type MetaKey = Exclude<keyof WizardState['meta'], 'idEdited'>

const FIELDS: { key: MetaKey; label: string; hint?: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Name' },
  {
    key: 'id',
    label: 'Pack id',
    hint: 'Reverse-DNS: a domain you control, or io.github.<your GitHub user>.<name>.',
  },
  { key: 'version', label: 'Version', hint: 'Semantic version, e.g. 1.0.0.' },
  { key: 'summary', label: 'Summary', hint: 'One line, up to 200 characters.' },
  { key: 'description', label: 'Description', hint: 'Markdown, optional.', multiline: true },
  { key: 'authorName', label: 'Author' },
  { key: 'authorUrl', label: 'Author URL', hint: 'Optional.' },
  { key: 'authorEmail', label: 'Author email', hint: 'Optional.' },
  { key: 'homepage', label: 'Homepage', hint: 'Optional.' },
  {
    key: 'domains',
    label: 'Domains',
    hint: 'Domain ids the pack is for, separated by commas; empty means any domain.',
  },
  { key: 'tags', label: 'Tags', hint: 'Separated by commas, e.g. rail, social.' },
]

export function MetadataStep(props: {
  state: WizardState
  update: Update
  user: string
  appVersion: string
}) {
  const { state, update, user } = props
  const set = (key: MetaKey, value: string) =>
    update((s) => {
      const meta = { ...s.meta, [key]: value }
      if (key === 'id') meta.idEdited = true
      if (key === 'name' && !s.meta.idEdited) meta.id = suggestPackId(user, value)
      return { ...s, meta }
    })
  return (
    <div className="stack">
      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label} {...(f.hint ? { hint: f.hint } : {})}>
          {({ id, describedBy }) =>
            f.multiline ? (
              <textarea
                id={id}
                className="textarea"
                rows={4}
                aria-describedby={describedBy}
                value={state.meta[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
            ) : (
              <input
                id={id}
                className="input"
                aria-describedby={describedBy}
                value={state.meta[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )
          }
        </Field>
      ))}
      <ContributorsEditor
        contributors={state.contributors}
        onChange={(contributors) => update((s) => ({ ...s, contributors }))}
      />
      <p className="muted">
        Needs Action Stations <span className="mono">{props.appVersion}</span> or later (the version
        you are running).
      </p>
    </div>
  )
}
