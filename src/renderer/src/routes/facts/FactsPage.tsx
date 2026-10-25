// Facility facts (#155): edit <project>/facility-facts.md in the app. Every category the file
// (or the current extraction) has is a section; nothing here knows airport categories, so
// domain profiles with other lists just work. Save writes the file through
// project:facility-facts-save, then re-checks the project's scenarios so the change in
// FACILITY_UNKNOWN_ID warnings is visible right away.
import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router'
import type { FacilityFactsFile } from '@shared/ipc/project'
import { EmptyState } from '../../components/ui'
import { LiveStatus } from '../../components/LiveStatus'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { AddCategory } from './AddCategory'
import { LintCheck } from './LintCheck'
import { ResetDialog } from './ResetDialog'
import { addCategory, entryCount, entryErrors } from './facts-draft'
import {
  CategoryList,
  ConflictBanner,
  FactsFooter,
  FactsHeader,
  ReimportNote,
  StatusLine,
} from './FactsParts'
import { LintDefinition } from './LintDefinition'
import { newDefinition } from './lint-definition'
import { useFacilityLint } from './use-facility-lint'
import { useLintDefinitions, type LintDefinitions } from './use-lint-definitions'
import {
  QUERY,
  useFactsDraft,
  useFactsWrites,
  useProjectChanged,
  useSaveShortcut,
} from './use-facts-file'
import './facts.css'

/** The first scenario check, once the file has loaded: the baseline later checks compare with. */
function useBaselineLint(ready: boolean, lint: ReturnType<typeof useFacilityLint>) {
  const runLint = lint.run
  useEffect(() => {
    if (ready && !lint.baseline && !lint.running && !lint.error) void runLint()
  }, [ready, lint.baseline, lint.running, lint.error, runLint])
}

/**
 * The lint definition editor for one category: the domain profile's (#180), or one the user
 * added, which starts without a definition (#350).
 */
function definitionEditor(defs: LintDefinitions, view: FacilityFactsFile, dirty: boolean) {
  const DefinitionFor = (id: string, label: string) => {
    const definable = view.categories.find((c) => c.id === id)?.definable
    const spec = defs.spec(id) ?? (definable ? newDefinition(id, label) : undefined)
    if (!spec) return null
    return (
      <LintDefinition
        label={label}
        spec={spec}
        userCategory={!defs.fromDomain(id)}
        defined={!!defs.spec(id)}
        customized={defs.customized(id)}
        editedFile={view.edited}
        blocked={dirty ? 'Save or discard your changes to the entries first.' : undefined}
        saving={defs.saving}
        onSave={defs.save}
        onRestore={() => defs.restore(id, label)}
      />
    )
  }
  return DefinitionFor
}

function LoadError(props: { error: unknown }) {
  return (
    <div className="page">
      <EmptyState title="Could not read the facility facts" body={errorText(props.error)} />
    </div>
  )
}

export default function FactsPage() {
  const path = fromProjectKey(useParams().projectKey ?? '')
  const query = useIpcQuery(QUERY, { path }, { enabled: !!path })
  const lint = useFacilityLint(path)
  const { base, draft, setDraft, dirty, stale, adopt } = useFactsDraft(query.data)
  const writes = useFactsWrites({ path, base, draft, dirty, adopt, relint: lint.run })
  const errors = useMemo(() => entryErrors(draft), [draft])
  const defs = useLintDefinitions(path, lint.run)
  useProjectChanged(path)
  useBaselineLint(!!base, lint)
  useSaveShortcut(writes.onSave)

  if (query.isError) return <LoadError error={query.error} />
  if (!base) return <div className="page muted">Loading facility facts…</div>

  return (
    <div className="page facts-page">
      <FactsHeader
        dirty={dirty}
        saving={writes.saving}
        resetting={writes.resetting}
        onReset={() => writes.setConfirmReset(true)}
        onDiscard={() => adopt(base)}
        onSave={writes.onSave}
      />
      <StatusLine view={base} count={entryCount(draft)} dirty={dirty} />
      <LiveStatus text={writes.announce} />
      <LiveStatus text={defs.announce} />
      {(writes.conflict || stale) && <ConflictBanner onReload={() => void writes.reload()} />}
      {base.generatedMarkdown !== undefined && <ReimportNote />}
      <LintCheck
        lint={lint}
        scenariosLink={`/p/${encodeURIComponent(path)}/scenarios`}
        dirty={dirty}
      />
      <CategoryList
        base={base}
        draft={draft}
        setDraft={setDraft}
        errors={errors}
        definition={definitionEditor(defs, base, dirty)}
      />
      <AddCategory
        taken={draft.map((c) => c.label.toLowerCase())}
        onAdd={(label) => setDraft((d) => addCategory(d, label))}
      />
      <FactsFooter path={path} />
      <ResetDialog
        open={writes.confirmReset}
        pending={writes.resetting}
        onOpenChange={writes.setConfirmReset}
        onConfirm={writes.onReset}
      />
    </div>
  )
}
