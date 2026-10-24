// Inject editor: /p/:projectKey/scenarios/:scenarioId/injects/:injectId.
// Left: schema-driven form for the draft. Right: live preview, media (with provenance) and
// versions. Cmd/Ctrl+S saves, Cmd/Ctrl+Enter saves (if needed) and renders.
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { TemplateInfo } from '@shared/ipc'
import type { Inject } from '@shared/schemas/inject'
import type { JobDoneEvent } from '@shared/schemas/job'
import type { Scenario } from '@shared/schemas/scenario'
import { injectTypeInfo } from '@shared/taxonomy'
import { toast } from '../../components/toast-store'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { deckUrl } from './links'
import { draftKey, draftOf, pickVariant, sameDraft, useDrafts, type InjectDraft } from './draft'
import { EditorToolbar } from './EditorToolbar'
import {
  EditorForm,
  EditorHeader,
  EditorSide,
  InjectNav,
  InjectWarnings,
  RegenDiff,
} from './EditorPanels'
import { JobBanner } from './JobBanner'
import { validateFields } from './schema/validate'
import type { JsonSchema } from './schema/fields'
import { useInjectActions } from './use-inject-actions'
import { useScenarioJob } from './use-scenario-job'
import { useRegenWatch } from './use-regen-watch'
import '../../routes/scenarios/scenarios.css'
import './inject-editor.css'
import { errorText } from '../../lib/errors'

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

/** The display label of an inject type: its template's, else the taxonomy's, else the id. */
const labelOf = (templates: TemplateInfo[]) => (t: string) =>
  templates.find((x) => x.type === t)?.label ?? injectTypeInfo(t)?.label ?? t

interface EditorProps {
  projectPath: string
  scenario: Scenario
  inject: Inject
  templates: TemplateInfo[]
}

/** The draft, its template, variant and field issues. */
function useEditorDraft(props: EditorProps) {
  const { draft, dirty, setDraft } = useDraft(props.scenario.id, props.inject)
  const template = props.templates.find((t) => t.type === draft.type)
  const issues = useMemo(
    () => (template ? validateFields(template.schema as JsonSchema, draft.fields) : []),
    [template, draft.fields],
  )
  const variant = pickVariant(template?.variants ?? [], draft.variant)
  return { draft, dirty, setDraft, template, issues, variant }
}

/** The scenario's generation job, the editor actions and the regeneration diff, wired to job:done. */
function useEditorJobs(props: EditorProps, draft: InjectDraft, dirty: boolean) {
  const { projectPath, scenario, inject } = props
  const regen = useRegenWatch(projectPath, scenario.id, inject.id)
  const onDone = useRef<(e: JobDoneEvent) => void>(() => undefined)
  const { job, interrupted, track } = useScenarioJob(projectPath, scenario.id, (e) =>
    onDone.current(e),
  )
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
      regen.onJobDone(e)
    }
  })
  return { job, interrupted, actions, regen }
}

function Editor(props: EditorProps) {
  const { projectPath, scenario, inject, templates } = props
  const navigate = useNavigate()
  const { draft, dirty, setDraft, template, issues, variant } = useEditorDraft(props)
  const form = { inject, draft, setDraft, templates, template, variant, issues }
  const [tab, setTab] = useState('preview')
  const { job, interrupted, actions, regen } = useEditorJobs(props, draft, dirty)
  useShortcuts(
    () => !inject.locked && void actions.save(),
    () => !inject.locked && !job && void actions.render().then((a) => a && setTab('media')),
  )
  const row = scenario.msel.find((r) => r.id === inject.mselRowId)
  const typeLabel = labelOf(templates)

  return (
    <div className="page page--wide inject-editor">
      <InjectNav projectPath={projectPath} scenario={scenario} inject={inject} />
      <EditorHeader
        inject={inject}
        draft={draft}
        row={row}
        typeLabel={typeLabel(draft.type)}
        dirty={dirty}
        issueCount={issues.length}
      />
      <EditorToolbar
        inject={inject}
        draft={draft}
        dirty={dirty}
        jobRunning={!!job}
        actions={actions}
        typeLabel={typeLabel}
        onReplace={(d) => setDraft(d)}
        onRegenStart={(jobId) =>
          regen.start(jobId, { title: inject.title, type: inject.type, fields: inject.fields })
        }
        onDeleted={() => navigate(deckUrl(projectPath, scenario.id))}
        onRendered={() => setTab('media')}
      />
      <JobBanner job={job} interrupted={interrupted} pendingSave={actions.pendingSave} editing />
      <InjectWarnings warnings={scenario.warnings.filter((w) => w.injectId === inject.id)} />
      <RegenDiff changes={regen.changes} onDismiss={regen.dismiss} />
      <div className="inject-editor__body">
        <EditorForm {...form} onSave={() => void actions.save()} />
        <EditorSide
          {...form}
          {...{ projectPath, tab }}
          scenarioId={scenario.id}
          onTab={setTab}
          busy={!!job || !!actions.busy}
          onRestore={(i) => void actions.restore(i)}
        />
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
  const templates = useIpcQuery('templates:list', { projectPath }, { staleTime: Infinity })
  const error = inject.error ?? scenario.error ?? templates.error
  if (error)
    return (
      <div className="page">
        <Link to={deckUrl(projectPath, scenarioId)} className="back-link">
          <ArrowLeft size={14} aria-hidden /> All injects
        </Link>
        <p className="field__error" role="alert">
          Could not load this inject: {errorText(error)}
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
