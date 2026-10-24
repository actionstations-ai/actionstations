// Workflows page (#33): ComfyUI connection status, default workflow per media type, the
// workflow list with missing-node warnings, import, binding editor and test render.
import { Link } from 'react-router'
import { useEffect, useState } from 'react'
import type { WorkflowEntry } from '@shared/ipc'
import { Badge, Button, Dialog, EmptyState, PageHeader } from '../../components/ui'
import { ProvenanceBadge } from '../../components/ProvenanceBadge'
import { provenanceOf } from '../../lib/provenance'
import { toast } from '../../components/toast-store'
import { queryClient, useIpcMutation, useIpcQuery } from '../../lib/query'
import { BindingEditor } from './BindingEditor'
import { ImportDialog } from './ImportDialog'
import { TestRender } from './TestRender'
import { MEDIA_TYPES, groupByMedia, missingSummary } from './workflow-utils'
import './workflows.css'
import { errorText } from '../../lib/errors'

const SOURCE_LABEL: Record<WorkflowEntry['source'], string> = {
  default: 'Built-in',
  global: 'Imported',
  pack: 'Pack',
  project: 'Project',
}

function StatusCard(props: { providerId: string | undefined }) {
  const status = useIpcQuery(
    'comfy:status',
    { providerId: props.providerId ?? '' },
    { enabled: !!props.providerId },
  )
  useEffect(() => {
    if (status.data) void queryClient.invalidateQueries({ queryKey: ['comfy:workflows:list'] })
  }, [status.data])
  if (!props.providerId)
    return (
      <EmptyState
        title="No ComfyUI provider"
        body="Add ComfyUI under Providers (Detect local services finds http://127.0.0.1:8188) to check nodes and test renders."
        actions={
          <Link className="btn btn--primary" to="/providers">
            Open Providers
          </Link>
        }
      />
    )
  return (
    <section className="card row wf-status" aria-label="ComfyUI status">
      {status.isPending && <span className="muted">Checking ComfyUI…</span>}
      {status.isError && <Badge tone="error">{errorText(status.error)}</Badge>}
      {status.data && (
        <Badge tone={status.data.ok ? 'ok' : 'error'}>
          {status.data.ok ? 'Connected' : 'Unreachable'}
        </Badge>
      )}
      {status.data?.message && <span className="muted">{status.data.message}</span>}
      <Button size="sm" onClick={() => void status.refetch()} disabled={status.isFetching}>
        Recheck nodes
      </Button>
    </section>
  )
}

function DefaultsCard({ list }: { list: WorkflowEntry[] }) {
  const defaults = useIpcQuery('comfy:defaults:get', undefined)
  const save = useIpcMutation('comfy:defaults:set', { invalidates: ['comfy:defaults:get'] })
  const groups = groupByMedia(list)
  const change = async (mediaType: WorkflowEntry['mediaType'], id: string) => {
    try {
      await save.mutateAsync({ [mediaType]: id })
      toast.success('Default workflow saved')
    } catch (e) {
      toast.error('Could not set the default', e)
    }
  }
  return (
    <section className="card stack" aria-labelledby="wf-defaults-heading">
      <h2 id="wf-defaults-heading">Defaults</h2>
      <p className="muted">The workflow each media type uses when an inject does not pick one.</p>
      <div className="wf-defaults">
        {MEDIA_TYPES.map((m) => (
          <label key={m.id} className="field">
            <span className="field__label">{m.label}</span>
            <select
              className="select"
              value={defaults.data?.[m.id] ?? ''}
              disabled={!defaults.data || save.isPending}
              onChange={(e) => void change(m.id, e.target.value)}
            >
              <option value="" disabled>
                {groups[m.id].length ? 'Choose a workflow' : 'No workflows yet'}
              </option>
              {groups[m.id].map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  )
}

function WorkflowCard(props: { workflow: WorkflowEntry; selected: boolean; onSelect: () => void }) {
  const w = props.workflow
  const missing = missingSummary(w)
  const provenance = provenanceOf(w)
  return (
    <li>
      <button
        type="button"
        className="card card--interactive wf-card"
        aria-pressed={props.selected}
        onClick={props.onSelect}
      >
        <span className="row wf-card__head">
          <span className="wf-card__name">{w.name}</span>
          {/* A pack workflow or a project copy of one: the ProvenanceBadge names the layer. */}
          {!provenance && <Badge tone="info">{SOURCE_LABEL[w.source]}</Badge>}
        </span>
        {provenance && <ProvenanceBadge provenance={provenance} />}
        <span className="muted wf-card__desc">{w.description}</span>
        <span className="row">
          <Badge>{w.bindings.length} bindings</Badge>
          {missing ? (
            <Badge tone="warn">{missing}</Badge>
          ) : w.missingNodes ? (
            <Badge tone="ok">All nodes available</Badge>
          ) : null}
        </span>
      </button>
    </li>
  )
}

function WorkflowList(props: {
  list: WorkflowEntry[]
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  const groups = groupByMedia(props.list)
  return (
    <>
      {MEDIA_TYPES.map((m) => (
        <section key={m.id} aria-labelledby={`wf-group-${m.id}`} className="stack">
          <h2 id={`wf-group-${m.id}`}>{m.label}</h2>
          {groups[m.id].length === 0 ? (
            <p className="muted">
              {m.id === 'audio'
                ? 'No TTS workflow. Voice lines use the TTS provider routed for audio; import a ComfyUI TTS workflow to use ComfyUI instead.'
                : 'No workflows.'}
            </p>
          ) : (
            <ul className="wf-list">
              {groups[m.id].map((w) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  selected={w.id === props.selectedId}
                  onSelect={() => props.onSelect(w.id)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  )
}

function SelectedWorkflow(props: { workflow: WorkflowEntry; providerId: string | undefined }) {
  const w = props.workflow
  const del = useIpcMutation('comfy:workflows:delete', {
    invalidates: ['comfy:workflows:list', 'comfy:defaults:get'],
  })
  // Built-in and pack workflows are read-only: "delete" resets the user's edited bindings.
  const isDefault = w.source === 'default' || w.source === 'pack'
  const origin = w.source === 'pack' ? 'pack' : 'built-in'
  const [confirming, setConfirming] = useState(false)
  const remove = async () => {
    setConfirming(false)
    try {
      await del.mutateAsync({ id: w.id })
      toast.success(isDefault ? 'Bindings reset' : 'Workflow deleted')
    } catch (e) {
      toast.error(isDefault ? 'Nothing to reset' : 'Could not delete', e)
    }
  }
  return (
    <div className="stack" key={w.id}>
      <BindingEditor key={`${w.id}:${w.sha256}:${JSON.stringify(w.bindings)}`} workflow={w} />
      <TestRender workflow={w} providerId={props.providerId} />
      <div className="row">
        <Button variant={isDefault ? 'default' : 'danger'} onClick={() => setConfirming(true)}>
          {isDefault ? `Reset bindings to ${origin}` : 'Delete workflow'}
        </Button>
      </div>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={isDefault ? 'Reset bindings?' : 'Delete workflow?'}
        description={
          isDefault
            ? `Your bindings for “${w.name}” are replaced by the ${origin} ones.`
            : `“${w.name}” and its bindings are removed from this computer.`
        }
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void remove()}>
              {isDefault ? 'Reset' : 'Delete'}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  )
}

export default function WorkflowsPage() {
  const providers = useIpcQuery('providers:list', undefined)
  const comfy = (providers.data ?? []).filter((p) => p.kind === 'comfyui' && p.enabled)
  const [providerChoice, setProviderChoice] = useState<string>()
  const providerId = providerChoice ?? comfy[0]?.id
  const list = useIpcQuery('comfy:workflows:list', {})
  const [selectedId, setSelectedId] = useState<string>()
  const [importing, setImporting] = useState(false)
  const selected = list.data?.find((w) => w.id === selectedId)
  return (
    <div className="page page--wide">
      <PageHeader
        eyebrow="Application"
        title="Workflows"
        description="ComfyUI workflows for AI images, video and voice. Bind each workflow's inputs to the inject's media brief."
        actions={
          <>
            {comfy.length > 1 && (
              <select
                className="select"
                aria-label="ComfyUI provider"
                value={providerId}
                onChange={(e) => setProviderChoice(e.target.value)}
              >
                {comfy.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
            <Button variant="primary" onClick={() => setImporting(true)}>
              Import workflow
            </Button>
          </>
        }
      />
      {providers.data && <StatusCard providerId={providerId} />}
      {list.isError && (
        <p className="field__error" role="alert">
          {errorText(list.error)}
        </p>
      )}
      {list.data && <DefaultsCard list={list.data} />}
      {list.data && (
        <WorkflowList list={list.data} selectedId={selectedId} onSelect={setSelectedId} />
      )}
      {selected && <SelectedWorkflow workflow={selected} providerId={providerId} />}
      <ImportDialog open={importing} onOpenChange={setImporting} onImported={setSelectedId} />
    </div>
  )
}
