// Step 1: choose items. User layers (templates, global prompt overrides, workflows) and, from
// one project, its domain profile under a new id, its documents and the project as an example.
import type { ReactNode } from 'react'
import type { PackExportSources, RecentProjectView } from './types'
import { Field } from '../../components/ui'
import { toggle, type Update, type WizardState } from './wizard-model'

function CheckList(props: {
  legend: string
  items: { id: string; label: string; disabled?: string }[]
  selected: string[]
  onChange: (id: string, on: boolean) => void
  empty: ReactNode
}) {
  return (
    <fieldset className="pe-group">
      <legend>{props.legend}</legend>
      {props.items.length === 0 ? (
        <p className="muted">{props.empty}</p>
      ) : (
        <ul className="pe-checks">
          {props.items.map((it) => (
            <li key={it.id}>
              <label className="pe-check">
                <input
                  type="checkbox"
                  checked={props.selected.includes(it.id)}
                  disabled={!!it.disabled}
                  onChange={(e) => props.onChange(it.id, e.target.checked)}
                />
                <span>
                  {it.label}
                  {it.label !== it.id && <span className="mono muted"> {it.id}</span>}
                  {it.disabled && <span className="muted"> — {it.disabled}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}

function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  multiline?: boolean
}) {
  return (
    <Field label={props.label} {...(props.hint ? { hint: props.hint } : {})}>
      {({ id, describedBy }) =>
        props.multiline ? (
          <textarea
            id={id}
            className="textarea"
            rows={2}
            aria-describedby={describedBy}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            className="input"
            aria-describedby={describedBy}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
          />
        )
      }
    </Field>
  )
}

function DomainChoice({
  state,
  update,
  label,
}: {
  state: WizardState
  update: Update
  label: string
}) {
  return (
    <div className="pe-sub">
      <label className="pe-check">
        <input
          type="checkbox"
          checked={state.includeDomain}
          onChange={(e) => update((s) => ({ ...s, includeDomain: e.target.checked }))}
        />
        <span>Domain profile: {label}, as resolved for this project, under a new id</span>
      </label>
      {state.includeDomain && (
        <div className="pe-fields">
          <TextField
            label="New domain id"
            hint="Lowercase letters, digits and _; not a built-in id."
            value={state.domainId}
            onChange={(v) => update((s) => ({ ...s, domainId: v }))}
          />
          <TextField
            label="Domain label"
            value={state.domainLabel}
            onChange={(v) => update((s) => ({ ...s, domainLabel: v }))}
          />
        </div>
      )}
    </div>
  )
}

function ExampleChoice({ state, update }: { state: WizardState; update: Update }) {
  const set = (k: keyof WizardState['example']) => (v: string) =>
    update((s) => ({ ...s, example: { ...s.example, [k]: v } }))
  return (
    <div className="pe-sub">
      <label className="pe-check">
        <input
          type="checkbox"
          checked={state.includeExample}
          onChange={(e) => update((s) => ({ ...s, includeExample: e.target.checked }))}
        />
        <span>
          The project as an example (marked fictional; provider settings, keys, local paths and the
          search index are left out)
        </span>
      </label>
      {state.includeExample && (
        <div className="pe-fields">
          <TextField label="Example id" value={state.example.slug} onChange={set('slug')} />
          <TextField label="Title" value={state.example.title} onChange={set('title')} />
          <TextField
            label="Summary"
            multiline
            value={state.example.summary}
            onChange={set('summary')}
          />
          <TextField
            label="Notice"
            hint="Shown as a banner in every project opened from the example, e.g. that the organization is fictional."
            multiline
            value={state.example.notice}
            onChange={set('notice')}
          />
        </div>
      )}
    </div>
  )
}

function ProjectItems({
  sources,
  state,
  update,
}: {
  sources: PackExportSources
  state: WizardState
  update: Update
}) {
  const p = sources.project
  if (!p) return null
  const docs = p.documents.map((d) => ({
    id: d.id,
    label: d.title,
    ...(d.unsupported ? { disabled: d.unsupported } : {}),
  }))
  const selected = Object.entries(state.documents)
    .filter(([, d]) => d.include)
    .map(([id]) => id)
  return (
    <>
      <DomainChoice state={state} update={update} label={p.domain.label} />
      <CheckList
        legend="Project documents"
        items={docs}
        selected={selected}
        empty="This project has no documents."
        onChange={(id, on) =>
          update((s) => ({
            ...s,
            documents: {
              ...s.documents,
              [id]: { license: s.documents[id]?.license ?? '', include: on },
            },
          }))
        }
      />
      <ExampleChoice state={state} update={update} />
    </>
  )
}

export function ItemsStep(props: {
  sources: PackExportSources
  recent: RecentProjectView[]
  state: WizardState
  update: Update
}) {
  const { sources, state, update } = props
  const lists = [
    ['Inject templates', 'templates', sources.templates, 'No templates of your own.'],
    ['Prompt overrides', 'prompts', sources.prompts, 'No global prompt overrides.'],
    ['ComfyUI workflows', 'workflows', sources.workflows, 'No workflows of your own.'],
  ] as const
  return (
    <div className="stack">
      {lists.map(([legend, key, items, empty]) => (
        <CheckList
          key={key}
          legend={legend}
          items={[...items]}
          selected={state[key]}
          empty={empty}
          onChange={(id, on) => update((s) => ({ ...s, [key]: toggle(s[key], id, on) }))}
        />
      ))}
      <fieldset className="pe-group">
        <legend>From a project</legend>
        <Field label="Project">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={state.projectPath ?? ''}
              onChange={(e) => update((s) => ({ ...s, projectPath: e.target.value || null }))}
            >
              <option value="">No project</option>
              {props.recent.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <ProjectItems sources={sources} state={state} update={update} />
      </fieldset>
    </div>
  )
}
