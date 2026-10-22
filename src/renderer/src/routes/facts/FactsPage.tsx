// Facility facts (#155): edit <project>/facility-facts.md in the app. Every category the file
// (or the current extraction) has is a section; nothing here knows airport categories, so
// domain profiles with other lists just work. Save writes the file through
// project:facility-facts-save, then re-checks the project's scenarios so the change in
// FACILITY_UNKNOWN_ID warnings is visible right away.
import { Save, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { FacilityFactsFile } from '@shared/ipc/project'
import { Badge, Button, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { LiveStatus } from '../../components/LiveStatus'
import { call, subscribe } from '../../lib/api'
import { errorText, isConflictError } from '../../lib/errors'
import { queryClient, useIpcMutation, useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { AddCategory } from './AddCategory'
import { CategorySection } from './CategorySection'
import { LintCheck } from './LintCheck'
import { ResetDialog } from './ResetDialog'
import {
  addCategory,
  addEntries,
  draftFrom,
  entryCount,
  entryErrors,
  isDirty,
  removeEntry,
  setEntry,
  toSaveCategories,
  type DraftCategory,
} from './facts-draft'
import { useFacilityLint } from './use-facility-lint'
import './facts.css'

const QUERY = 'project:facility-facts'

/** Re-read the file when main reports a project or document change for this project. */
function useProjectChanged(path: string) {
  useEffect(
    () =>
      subscribe('project:changed', (e) => {
        if (e.path !== path || (e.what !== 'project' && e.what !== 'documents')) return
        void queryClient.invalidateQueries({ queryKey: [QUERY] })
      }),
    [path],
  )
}

/** The loaded file and the working copy made from it. */
function useDraft(data: FacilityFactsFile | undefined) {
  const [base, setBase] = useState<FacilityFactsFile | undefined>(undefined)
  const [draft, setDraft] = useState<DraftCategory[]>([])
  const dirty = !!base && isDirty(base, draft)
  const adopt = useCallback((view: FacilityFactsFile) => {
    setBase(view)
    setDraft(draftFrom(view))
  }, [])
  // A fresh read replaces the working copy unless it holds unsaved edits (state adjusted
  // during render, React's pattern for state derived from props).
  if (data && data !== base && (!base || !dirty)) {
    setBase(data)
    setDraft(draftFrom(data))
  }
  // The file changed underneath unsaved edits (another editor, or a re-ingest).
  const stale = !!data && !!base && dirty && data.revision !== base.revision
  return { base, draft, setDraft, dirty, stale, adopt }
}

function StatusLine(props: { view: FacilityFactsFile; count: number; dirty: boolean }) {
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

export default function FactsPage() {
  const path = fromProjectKey(useParams().projectKey ?? '')
  const query = useIpcQuery(QUERY, { path }, { enabled: !!path })
  const save = useIpcMutation('project:facility-facts-save', { invalidates: ['scenarios:lint'] })
  const reset = useIpcMutation('project:facility-facts-reset', { invalidates: ['scenarios:lint'] })
  const lint = useFacilityLint(path)
  const { base, draft, setDraft, dirty, stale, adopt } = useDraft(query.data)
  const [conflict, setConflict] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [announce, setAnnounce] = useState('')
  const errors = useMemo(() => entryErrors(draft), [draft])
  useProjectChanged(path)

  const runLint = lint.run
  useEffect(() => {
    if (base && !lint.baseline && !lint.running && !lint.error) void runLint()
  }, [base, lint.baseline, lint.running, lint.error, runLint])

  const written = useCallback(
    (view: FacilityFactsFile, message: string) => {
      queryClient.setQueryData([QUERY, { path }], view)
      adopt(view)
      setConflict(false)
      setAnnounce(message)
      toast.success(message)
      void runLint()
    },
    [adopt, path, runLint],
  )

  const onSave = useCallback(() => {
    if (!base || !dirty || save.isPending) return
    save.mutate(
      { path, revision: base.revision, categories: toSaveCategories(draft) },
      {
        onSuccess: (view) => written(view, 'Facility facts saved'),
        onError: (err) => {
          if (isConflictError(err)) setConflict(true)
          else toast.error('Could not save the facility facts', errorText(err))
        },
      },
    )
  }, [base, dirty, draft, path, save, written])

  const onReset = () =>
    reset.mutate(
      { path },
      {
        onSuccess: (view) => {
          setConfirmReset(false)
          written(view, 'Facility facts reset to the extracted version')
        },
        onError: (err) => toast.error('Could not reset the facility facts', errorText(err)),
      },
    )

  const reload = async () => {
    try {
      const view = await call(QUERY, { path })
      queryClient.setQueryData([QUERY, { path }], view)
      adopt(view)
      setConflict(false)
    } catch (err) {
      toast.error('Could not read the facility facts', errorText(err))
    }
  }

  // Ctrl/Cmd+S saves from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave])

  if (query.isError)
    return (
      <div className="page">
        <EmptyState title="Could not read the facility facts" body={errorText(query.error)} />
      </div>
    )
  if (!base) return <div className="page muted">Loading facility facts…</div>

  return (
    <div className="page facts-page">
      <PageHeader
        eyebrow="Project"
        title="Facility facts"
        description={
          <>
            The identifiers this project treats as real. Generation gives them to the model as the
            only allowed names, and lint flags scenario rows that name others (FACILITY_UNKNOWN_ID).
            They live in facility-facts.md in the project folder; your edits there or here win over
            re-imported documents.
          </>
        }
        actions={
          <>
            <Button onClick={() => setConfirmReset(true)} disabled={reset.isPending}>
              Reset to extracted facts…
            </Button>
            <Button onClick={() => adopt(base)} disabled={!dirty}>
              <Undo2 size={16} aria-hidden /> Discard changes
            </Button>
            <Button
              variant="primary"
              onClick={onSave}
              disabled={!dirty || save.isPending}
              aria-keyshortcuts="Control+S Meta+S"
            >
              <Save size={16} aria-hidden /> {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      />
      <StatusLine view={base} count={entryCount(draft)} dirty={dirty} />
      <LiveStatus text={announce} />
      {(conflict || stale) && (
        <div className="facts-banner" role="alert">
          <p>
            facility-facts.md changed since this page loaded (edited on disk, or documents were
            re-imported). Reload to see the new version; your unsaved changes here are then
            discarded.
          </p>
          <Button onClick={() => void reload()}>Reload the file</Button>
        </div>
      )}
      {base.generatedMarkdown !== undefined && (
        <p className="facts-note muted">
          The documents changed after you edited these facts, so a re-import did not overwrite them.
          “From the documents, not in your list” shows what the new extraction found.
        </p>
      )}
      <LintCheck
        lint={lint}
        scenariosLink={`/p/${encodeURIComponent(path)}/scenarios`}
        dirty={dirty}
      />
      {draft.map((c) => (
        <CategorySection
          key={c.id}
          draft={c}
          category={base.categories.find((v) => v.id === c.id)}
          errors={errors}
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
      ))}
      <AddCategory
        taken={draft.map((c) => c.label.toLowerCase())}
        onAdd={(label) => setDraft((d) => addCategory(d, label))}
      />
      <p className="muted facts-footer">
        Changes apply to the next generation and to lint.{' '}
        <Link to={`/p/${encodeURIComponent(path)}/documents`}>Documents</Link> are where the
        extracted facts come from.
      </p>
      <ResetDialog
        open={confirmReset}
        pending={reset.isPending}
        onOpenChange={setConfirmReset}
        onConfirm={onReset}
      />
    </div>
  )
}
