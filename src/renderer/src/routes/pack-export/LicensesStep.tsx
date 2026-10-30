// Step 3: licenses. The pack license is the author's choice (no default), independent of the
// app's own license; every document needs its own; the author confirms they may redistribute.
import { useId } from 'react'
import { COMMON_PACK_LICENSES } from '@shared/ipc'
import { Field } from '../../components/ui'
import { includedDocuments, type Update, type WizardState } from './wizard-model'

const COMMON_IDS: readonly string[] = COMMON_PACK_LICENSES.map((l) => l.id)

function PackLicense({ state, update }: { state: WizardState; update: Update }) {
  const name = useId()
  const other = state.license !== '' && !COMMON_IDS.includes(state.license)
  const set = (license: string) => update((s) => ({ ...s, license }))
  return (
    <fieldset className="pe-group">
      <legend>Pack license</legend>
      <p className="muted">
        The license under which others may use the content you put in this pack. It is independent
        of the Action Stations app&apos;s own license (AGPL-3.0-only), which covers the app, not
        your content.
      </p>
      <ul className="pe-checks">
        {COMMON_PACK_LICENSES.map((l) => (
          <li key={l.id}>
            <label className="pe-check">
              <input
                type="radio"
                name={name}
                checked={state.license === l.id}
                onChange={() => set(l.id)}
              />
              <span>
                {l.label} <span className="mono muted">{l.id}</span>
              </span>
            </label>
          </li>
        ))}
        <li>
          <label className="pe-check">
            <input
              type="radio"
              name={name}
              checked={other}
              onChange={() => set(other ? state.license : 'LicenseRef-')}
            />
            <span>Another SPDX expression or LicenseRef-…</span>
          </label>
        </li>
      </ul>
      {other && (
        <Field label="SPDX expression" hint="For example MIT OR Apache-2.0, or LicenseRef-MyTerms.">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input mono"
              aria-describedby={describedBy}
              value={state.license}
              onChange={(e) => set(e.target.value)}
            />
          )}
        </Field>
      )}
    </fieldset>
  )
}

function DocumentLicenses(props: {
  state: WizardState
  update: Update
  titles: Record<string, string>
}) {
  const ids = includedDocuments(props.state)
  const listId = useId()
  if (ids.length === 0) return null
  return (
    <fieldset className="pe-group">
      <legend>Document licenses</legend>
      <p className="muted">
        Each document needs the license under which you may redistribute it. Leave a document out if
        you cannot share it.
      </p>
      <datalist id={listId}>
        {COMMON_PACK_LICENSES.map((l) => (
          <option key={l.id} value={l.id} />
        ))}
      </datalist>
      {ids.map((docId) => (
        <Field key={docId} label={props.titles[docId] ?? docId}>
          {({ id }) => (
            <input
              id={id}
              className="input mono"
              list={listId}
              required
              placeholder="SPDX license, e.g. CC-BY-4.0"
              value={props.state.documents[docId]!.license}
              onChange={(e) =>
                props.update((s) => ({
                  ...s,
                  documents: {
                    ...s.documents,
                    [docId]: { ...s.documents[docId]!, license: e.target.value },
                  },
                }))
              }
            />
          )}
        </Field>
      ))}
    </fieldset>
  )
}

export function LicensesStep(props: {
  state: WizardState
  update: Update
  titles: Record<string, string>
}) {
  return (
    <div className="stack">
      <PackLicense state={props.state} update={props.update} />
      <DocumentLicenses {...props} />
      <label className="pe-check">
        <input
          type="checkbox"
          checked={props.state.confirmed}
          onChange={(e) => props.update((s) => ({ ...s, confirmed: e.target.checked }))}
        />
        <span>
          I made this content or have the right to redistribute it, under the pack license and the
          document licenses above.
        </span>
      </label>
    </div>
  )
}
