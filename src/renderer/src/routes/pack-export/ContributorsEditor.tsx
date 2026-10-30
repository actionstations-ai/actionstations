// Credit for everyone who helped make the pack besides the author (docs/packs-format.md, "Credit").
// Each person or organization gets a name, optional link and GitHub user, and one or more roles.
import { Button, Field } from '../../components/ui'
import { CONTRIBUTOR_ROLES, emptyContributor, type ContributorDraft } from './wizard-model'
import type { ContributorRole } from '@shared/schemas/pack'
import './contributors.css'

const MAX_SHOWN = 50

export function ContributorsEditor(props: {
  contributors: ContributorDraft[]
  onChange: (next: ContributorDraft[]) => void
}) {
  const { contributors, onChange } = props
  const patch = (i: number, change: Partial<ContributorDraft>) =>
    onChange(contributors.map((c, at) => (at === i ? { ...c, ...change } : c)))
  const toggleRole = (i: number, role: ContributorRole) => {
    const roles = contributors[i]!.roles
    patch(i, { roles: roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role] })
  }
  return (
    <fieldset className="pe-contributors">
      <legend>Contributors</legend>
      <p className="muted">
        Credit everyone who helped, such as translators and reviewers. The author is credited
        already. The pack page and the catalog list these names.
      </p>
      {contributors.map((c, i) => (
        <div key={i} className="pe-contributor" role="group" aria-label={`Contributor ${i + 1}`}>
          <Field label="Name">
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input"
                aria-describedby={describedBy}
                value={c.name}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
            )}
          </Field>
          <Field label="URL" hint="Optional.">
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input"
                aria-describedby={describedBy}
                value={c.url}
                onChange={(e) => patch(i, { url: e.target.value })}
              />
            )}
          </Field>
          <Field label="GitHub user" hint="Optional. Only used for credit.">
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input"
                aria-describedby={describedBy}
                value={c.github}
                onChange={(e) => patch(i, { github: e.target.value })}
              />
            )}
          </Field>
          <fieldset className="pe-contributor__roles">
            <legend>Roles</legend>
            {CONTRIBUTOR_ROLES.map((role) => (
              <label key={role} className="pe-check">
                <input
                  type="checkbox"
                  checked={c.roles.includes(role)}
                  onChange={() => toggleRole(i, role)}
                />
                <span>{role}</span>
              </label>
            ))}
          </fieldset>
          <Button onClick={() => onChange(contributors.filter((_, at) => at !== i))}>
            Remove contributor {i + 1}
          </Button>
        </div>
      ))}
      <Button
        disabled={contributors.length >= MAX_SHOWN}
        onClick={() => onChange([...contributors, emptyContributor()])}
      >
        Add a contributor
      </Button>
    </fieldset>
  )
}
