// The parts of the facility facts page: header, status line, conflict banner, the category
// sections and the footer.
import { Save, Undo2 } from 'lucide-react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Link } from 'react-router'
import type { FacilityFactsFile } from '@shared/ipc/project'
import { Badge, Button, PageHeader } from '../../components/ui'
import { Term } from '../../components/Glossary'
import { CategorySection } from './CategorySection'
import { addEntries, removeEntry, setEntry, type DraftCategory } from './facts-draft'

export function FactsHeader(props: {
  dirty: boolean
  saving: boolean
  resetting: boolean
  onReset: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <PageHeader
      eyebrow="Project"
      title="Facility facts"
      description={
        <>
          The runways, gates, systems and other names this project treats as real. Generation may
          only use these names, and the automatic checks (<Term id="lint">lint</Term>) flag scenario
          events that name anything else. They live in facility-facts.md in the project folder; your
          edits there or here win over re-imported documents.
        </>
      }
      actions={
        <>
          <Button onClick={props.onReset} disabled={props.resetting}>
            Reset to extracted facts…
          </Button>
          <Button onClick={props.onDiscard} disabled={!props.dirty}>
            <Undo2 size={16} aria-hidden /> Discard changes
          </Button>
          <Button
            variant="primary"
            onClick={props.onSave}
            disabled={!props.dirty || props.saving}
            aria-keyshortcuts="Control+S Meta+S"
          >
            <Save size={16} aria-hidden /> {props.saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    />
  )
}

export function StatusLine(props: { view: FacilityFactsFile; count: number; dirty: boolean }) {
  const { view } = props
  return (
    <p className="facts-status row">
      {view.edited ? <Badge tone="ok">Edited by you</Badge> : <Badge>Matches the documents</Badge>}
      {props.dirty && <Badge tone="warn">Unsaved changes</Badge>}
      <span className="muted">
        {props.count} {props.count === 1 ? 'entry' : 'entries'} in {view.path}
        {view.historyCount > 0 &&
          ` · ${view.historyCount} earlier ${view.historyCount === 1 ? 'version' : 'versions'} kept in .cache/facility-facts-history/`}
      </span>
    </p>
  )
}

export function ConflictBanner(props: { onReload: () => void }) {
  return (
    <div className="facts-banner" role="alert">
      <p>
        facility-facts.md changed since this page loaded (edited on disk, or documents were
        re-imported). Reload to see the new version; your unsaved changes here are then discarded.
      </p>
      <Button onClick={props.onReload}>Reload the file</Button>
    </div>
  )
}

export function ReimportNote() {
  return (
    <p className="facts-note muted">
      The documents changed after you edited these facts, so a re-import did not overwrite them.
      “From the documents, not in your list” shows what the new extraction found.
    </p>
  )
}

export function CategoryList(props: {
  base: FacilityFactsFile
  draft: DraftCategory[]
  setDraft: Dispatch<SetStateAction<DraftCategory[]>>
  errors: Map<number, string>
  /** The lint definition editor of a category, if it has one (#180). */
  definition?: (id: string, label: string) => ReactNode
}) {
  const { base, draft, setDraft } = props
  return draft.map((c) => (
    <CategorySection
      key={c.id}
      draft={c}
      category={base.categories.find((v) => v.id === c.id)}
      errors={props.errors}
      definition={props.definition?.(c.id, c.label)}
      actions={{
        onChange: (key, value) => setDraft((d) => setEntry(d, c.id, key, value)),
        onRemove: (key) => setDraft((d) => removeEntry(d, c.id, key)),
        onAdd: (lines) => {
          const result = addEntries(draft, c.id, lines)
          setDraft(result.draft)
          return result.added.length
        },
      }}
    />
  ))
}

export function FactsFooter(props: { path: string }) {
  return (
    <p className="muted facts-footer">
      Changes apply to the next generation and to lint.{' '}
      <Link to={`/p/${encodeURIComponent(props.path)}/documents`}>Documents</Link> are where the
      extracted facts come from.
    </p>
  )
}
