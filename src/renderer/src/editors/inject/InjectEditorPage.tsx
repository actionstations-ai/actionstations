// Inject editor: /p/:projectKey/scenarios/:scenarioId/injects/:injectId.
// Left: schema-driven form for the draft. Right: live preview, media (with provenance) and
// versions. Cmd/Ctrl+S saves, Cmd/Ctrl+Enter saves (if needed) and renders.
import { Tabs } from 'radix-ui'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { TemplateInfo } from '@shared/ipc'
import type { Inject } from '@shared/schemas/inject'
import type { JobDoneEvent } from '@shared/schemas/job'
import type { Scenario } from '@shared/schemas/scenario'
import { injectTypeInfo } from '@shared/taxonomy'
import { Badge, PageHeader, TagChip } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { deckUrl, injectUrl } from './links'
import { draftKey, draftOf, pickVariant, sameDraft, useDrafts, type InjectDraft } from './draft'
import { EditorToolbar } from './EditorToolbar'
import { InjectForm } from './InjectForm'
import { JobBanner } from './JobBanner'
import { MediaPanel } from './MediaPanel'
import { PreviewPanel } from './PreviewPanel'
import { diffFields, type FieldChange } from './schema/diff'
import { issuesByPath, validateFields } from './schema/validate'
import type { JsonSchema } from './schema/fields'
import { useInjectActions } from './use-inject-actions'
import { useScenarioJob } from './use-scenario-job'
import { ChangeList, VersionsPanel } from './VersionsPanel'
import '../../routes/scenarios/scenarios.css'
import './inject-editor.css'

/** The draft for an inject from the shared store, falling back to the stored inject. */
function useDraft(scenarioId: string, inject: Inject) {
  const key = draftKey(scenarioId, inject.id)
  const stored = useDrafts((s) => s.drafts[key])
  const base = useMemo(() => draftOf(inject), [inject])
  const draft = stored ?? base
  const dirty = !!stored && !sameDraft(stored, base)
  const setDraft = (d: InjectDraft) => {
    if (sameDraft(d, base)) useDrafts.getState().drop(key)
    else useDrafts.getState().put(key, d)
  }
  return { draft, dirty, setDraft }
}

function useShortcuts(onSave: () => void, onRender: () => void) {
  const handlers = useRef({ onSave, onRender })
  useEffect(() => {
    handlers.current = { onSave, onRender }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        handlers.current.onSave()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handlers.current.onRender()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

interface RegenWatch {
  jobId: string
  before: Pick<Inject, 'title' | 'type' | 'fields'>
}

function RegenDiff(props: { changes: FieldChange[] | null; onDismiss: () => void }) {
  if (!props.changes) return null
  return (
    <section className="regen-diff card" aria-label="Changes from regeneration">
      <div className="row regen-diff__head">
        <strong>Regenerated: {props.changes.length} change(s)</strong>
        <button type="button" className="btn btn--sm btn--ghost" onClick={props.onDismiss}>
          Dismiss
        </button>
      </div>
      <ChangeList
        label="Regenerated fields"
        changes={props.changes}
        empty="The text did not change."
      />
    </section>
  )
}

function neighbours(scenario: Scenario, inject: Inject) {
  const ids = scenario.msel.filter((r) => r.injectId).map((r) => r.injectId!)
  const at = ids.indexOf(inject.id)
  return { prev: at > 0 ? ids[at - 1] : undefined, next: at >= 0 ? ids[at + 1] : undefined }
}

function Editor(props: {
  projectPath: string
  scenario: Scenario
  inject: Inject
  templates: TemplateInfo[]
}) {
  const { projectPath, scenario, inject, templates } = props
  const navigate = useNavigate()
  const { draft, dirty, setDraft } = useDraft(scenario.id, inject)
  const template = templates.find((t) => t.type === draft.type)
  const issues = useMemo(
    () => (template ? validateFields(template.schema as JsonSchema, draft.fields) : []),
    [template, draft.fields],
  )
  const variant = pickVariant(template?.variants ?? [], draft.variant)
  const [tab, setTab] = useState('preview')
  const [regen, setRegen] = useState<RegenWatch | null>(null)
  const [changes, setChanges] = useState<FieldChange[] | null>(null)

  const onDone = useRef<(e: JobDoneEvent) => void>(() => undefined)
  const { job, track } = useScenarioJob(projectPath, scenario.id, (e) => onDone.current(e))
  const actions = useInjectActions({
    projectPath,
    scenarioId: scenario.id,
    injectId: inject.id,
    draft,
    dirty,
    track,
  })
  useEffect(() => {
    onDone.current = (e) => {
      actions.retryPending()
      if (e.status === 'error') toast.error('Generation job failed', e.error)
      if (regen && e.jobId === regen.jobId) {
        setRegen(null)
        void call('injects:get', { projectPath, scenarioId: scenario.id, injectId: inject.id })
          .then((after) =>
            setChanges(
              diffFields(regen.before, {
                title: after.title,
                type: after.type,
                fields: after.fields,
              }),
            ),
          )
          .catch(() => undefined)
      }
    }
  })
  useShortcuts(
    () => {
      if (!inject.locked) void actions.save()
    },
    () => {
      if (!inject.locked && !job) void actions.render().then((a) => a && setTab('media'))
    },
  )

  const row = scenario.msel.find((r) => r.id === inject.mselRowId)
  const warnings = scenario.warnings.filter((w) => w.injectId === inject.id)
  const { prev, next } = neighbours(scenario, inject)
  const linkTo = (id: string) => injectUrl(projectPath, scenario.id, id)
  const typeLabel = (t: string) =>
    templates.find((x) => x.type === t)?.label ?? injectTypeInfo(t)?.label ?? t

  return (
    <div className="page page--wide inject-editor">
      <nav className="row inject-editor__nav" aria-label="Inject navigation">
        <Link to={deckUrl(projectPath, scenario.id)} className="back-link">
          <ArrowLeft size={14} aria-hidden /> All injects
        </Link>
        <span className="row">
          {prev ? (
            <Link to={linkTo(prev)} className="btn btn--sm">
              Previous inject
            </Link>
          ) : null}
          {next ? (
            <Link to={linkTo(next)} className="btn btn--sm">
              Next inject
            </Link>
          ) : null}
        </span>
      </nav>
      <PageHeader
        eyebrow={`Inject ${inject.mselRowId}${row ? ` · ${row.time}${row.wallClock ? ` (${row.wallClock})` : ''}` : ''} · ${typeLabel(draft.type)}`}
        title={draft.title || 'Untitled inject'}
        description={row?.event}
        actions={
          <span className="row">
            {row && <TagChip tag={row.purposeTag} />}
            {inject.locked && <Badge tone="warn">Locked</Badge>}
            {dirty && <Badge tone="info">Unsaved changes</Badge>}
            {issues.length > 0 && <Badge tone="error">{issues.length} field issue(s)</Badge>}
          </span>
        }
      />
      <EditorToolbar
        inject={inject}
        draft={draft}
        dirty={dirty}
        jobRunning={!!job}
        actions={actions}
        typeLabel={typeLabel}
        onReplace={(d) => setDraft(d)}
        onRegenStart={(jobId) => {
          setChanges(null)
          setRegen({
            jobId,
            before: { title: inject.title, type: inject.type, fields: inject.fields },
          })
        }}
        onDeleted={() => navigate(deckUrl(projectPath, scenario.id))}
        onRendered={() => setTab('media')}
      />
      <JobBanner job={job} pendingSave={actions.pendingSave} editing />
      {warnings.length > 0 && (
        <ul className="inject-warnings" aria-label="Warnings for this inject">
          {warnings.map((w, i) => (
            <li key={i}>
              <Badge tone={w.severity === 'error' ? 'error' : 'warn'}>{w.code}</Badge> {w.message}
            </li>
          ))}
        </ul>
      )}
      <RegenDiff changes={changes} onDismiss={() => setChanges(null)} />
      <div className="inject-editor__body">
        <form
          className="inject-editor__form"
          aria-label="Inject fields"
          onSubmit={(e) => {
            e.preventDefault()
            void actions.save()
          }}
        >
          <fieldset disabled={inject.locked} className="inject-editor__lockable">
            {inject.locked && (
              <p className="lock-note">This inject is locked. Unlock it to edit or regenerate.</p>
            )}
            <InjectForm
              draft={draft}
              onChange={setDraft}
              templates={templates}
              template={template}
              variant={variant}
              onVariant={(v) => setDraft({ ...draft, variant: v })}
              issues={issuesByPath(issues)}
            />
          </fieldset>
        </form>
        <aside className="inject-editor__side" aria-label="Preview and media">
          <Tabs.Root value={tab} onValueChange={setTab} className="tabs">
            <Tabs.List className="tabs__list" aria-label="Inject views">
              <Tabs.Trigger value="preview" className="tabs__trigger">
                Preview
              </Tabs.Trigger>
              <Tabs.Trigger value="media" className="tabs__trigger">
                Media ({inject.assets.length})
              </Tabs.Trigger>
              <Tabs.Trigger value="versions" className="tabs__trigger">
                Versions ({inject.versions.length})
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="preview" className="tabs__panel">
              <PreviewPanel
                template={template}
                alt={`Preview of ${draft.title || inject.mselRowId}`}
                refreshKey={inject.assets
                  .filter((a) => a.role === 'generated')
                  .map((a) => a.id)
                  .join(',')}
                request={{
                  type: draft.type,
                  fields: draft.fields,
                  variant,
                  projectPath,
                  scenarioId: scenario.id,
                  injectId: inject.id,
                }}
              />
            </Tabs.Content>
            <Tabs.Content value="media" className="tabs__panel">
              <MediaPanel
                projectPath={projectPath}
                assets={inject.assets}
                title={draft.title || inject.mselRowId}
              />
            </Tabs.Content>
            <Tabs.Content value="versions" className="tabs__panel">
              <VersionsPanel
                inject={inject}
                draft={draft}
                busy={!!job || !!actions.busy}
                onRestore={(i) => void actions.restore(i)}
              />
            </Tabs.Content>
          </Tabs.Root>
        </aside>
      </div>
    </div>
  )
}

export default function InjectEditorPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const injectId = params.injectId ?? ''
  const inject = useIpcQuery(
    'injects:get',
    { projectPath, scenarioId, injectId },
    { enabled: !!injectId },
  )
  const scenario = useIpcQuery(
    'scenarios:get',
    { projectPath, scenarioId },
    { enabled: !!scenarioId },
  )
  const templates = useIpcQuery('templates:list', undefined, { staleTime: Infinity })
  const error = inject.error ?? scenario.error ?? templates.error
  if (error)
    return (
      <div className="page">
        <Link to={deckUrl(projectPath, scenarioId)} className="back-link">
          <ArrowLeft size={14} aria-hidden /> All injects
        </Link>
        <p className="field__error" role="alert">
          Could not load this inject: {error.message}
        </p>
      </div>
    )
  if (!inject.data || !scenario.data || !templates.data)
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    )
  return (
    <Editor
      key={inject.data.id}
      projectPath={projectPath}
      scenario={scenario.data}
      inject={inject.data}
      templates={templates.data}
    />
  )
}
