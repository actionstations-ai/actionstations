import { useId, useRef, useState } from 'react'
import type { ChannelResponse } from '@shared/ipc'
import { Badge, Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { CodeTextarea, type CodeTextareaHandle } from './CodeTextarea'
import { DiffView } from './DiffView'
import { HelpPanel } from './HelpPanel'
import {
  hasOverride,
  issuesFrom,
  LAYER_LABEL,
  layerBelow,
  basePhrase,
  startingText,
  type EditScope,
  type LineIssue,
} from './prompt-utils'
import { errorText } from '../../lib/errors'

const PROMPT_QUERIES = ['prompts:list', 'prompts:get'] as const
type Layers = ChannelResponse<'prompts:get'>

interface EditorProps {
  name: string
  scope: EditScope
  projectPath?: string
}

function ResetDialog(props: {
  open: boolean
  name: string
  scope: EditScope
  baseLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && props.onCancel()}
      title={`Reset ${props.name}?`}
      description={`Deletes the ${props.scope} override. The ${props.baseLabel} takes effect again. This cannot be undone.`}
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="danger" onClick={props.onConfirm}>
            Reset
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

function IssueList(props: { id: string; issues: LineIssue[]; onGoTo: (line: number) => void }) {
  if (!props.issues.length) return <div id={props.id} />
  return (
    <div id={props.id} className="prompt-issues" role="alert">
      <p className="prompt-issues__title">Not saved — fix these problems:</p>
      <ul>
        {props.issues.map((issue, i) => (
          <li key={i}>
            <button
              type="button"
              className="prompt-issues__line"
              onClick={() => props.onGoTo(issue.line)}
            >
              Line {issue.line}
            </button>{' '}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EditorToolbar(props: {
  name: string
  scopeLabel: string
  baseLabel: string
  overridden: boolean
  dirty: boolean
  showDiff: boolean
  busy: boolean
  onToggleDiff: () => void
  onDiscard: () => void
  onReset: () => void
  onSave: () => void
}) {
  const baseLabel = props.baseLabel
  return (
    <header className="prompt-editor__header">
      <div>
        <h2 className="mono">{props.name}</h2>
        <p className="muted">
          Editing the {props.scopeLabel.toLowerCase()}.{' '}
          {props.overridden ? (
            <Badge tone="info">Override saved</Badge>
          ) : (
            <Badge>Using {baseLabel}</Badge>
          )}
          {props.dirty && <Badge tone="warn">Unsaved changes</Badge>}
        </p>
      </div>
      <div className="row">
        <Button size="sm" aria-pressed={props.showDiff} onClick={props.onToggleDiff}>
          {props.showDiff ? 'Hide diff' : 'Show diff'}
        </Button>
        {props.dirty && (
          <Button size="sm" variant="ghost" onClick={props.onDiscard}>
            Discard changes
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          disabled={!props.overridden || props.busy}
          onClick={props.onReset}
        >
          Reset to {baseLabel}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!props.dirty || props.busy}
          onClick={props.onSave}
        >
          Save
        </Button>
      </div>
    </header>
  )
}

function useSaveReset(props: EditorProps) {
  const save = useIpcMutation('prompts:save', { invalidates: [...PROMPT_QUERIES] })
  const reset = useIpcMutation('prompts:reset', { invalidates: [...PROMPT_QUERIES] })
  const target = {
    name: props.name,
    scope: props.scope,
    ...(props.scope === 'project' && props.projectPath ? { projectPath: props.projectPath } : {}),
  }
  return { save, reset, target }
}

function EditorForm(props: EditorProps & { layers: Layers }) {
  const raw = props.layers.raw
  const base = layerBelow(props.scope, raw)
  const initial = startingText(props.scope, raw)
  const overridden = hasOverride(props.scope, raw)
  const [draft, setDraft] = useState(initial)
  const [issues, setIssues] = useState<LineIssue[]>([])
  const [showDiff, setShowDiff] = useState(overridden)
  const [confirmReset, setConfirmReset] = useState(false)
  const editor = useRef<CodeTextareaHandle>(null)
  const issuesId = useId()
  const { save, reset, target } = useSaveReset(props)
  const dirty = draft !== initial
  const baseLabel = basePhrase(base.layer, props.layers.pack?.packName)

  const onSave = () => {
    if (!dirty || save.isPending) return
    save.mutate(
      { ...target, raw: draft },
      {
        onSuccess: () => {
          setIssues([])
          toast.success(`Saved ${props.scope} override of ${props.name}`)
        },
        onError: (err) => {
          const found = issuesFrom(err.details)
          setIssues(found.length ? found : [{ line: 1, message: errorText(err) }])
        },
      },
    )
  }
  const onReset = () => {
    setConfirmReset(false)
    reset.mutate(target, {
      onSuccess: () => toast.success(`${props.name} reset to ${baseLabel}`),
      onError: (err) => toast.error('Could not reset prompt', err),
    })
  }
  const scopeLabel = props.scope === 'project' ? LAYER_LABEL.project : LAYER_LABEL.global

  return (
    <div className="prompt-editor">
      <EditorToolbar
        name={props.name}
        scopeLabel={scopeLabel}
        baseLabel={baseLabel}
        overridden={overridden}
        dirty={dirty}
        showDiff={showDiff}
        busy={save.isPending || reset.isPending}
        onToggleDiff={() => setShowDiff((v) => !v)}
        onDiscard={() => {
          setDraft(initial)
          setIssues([])
        }}
        onReset={() => setConfirmReset(true)}
        onSave={onSave}
      />
      <div className="prompt-editor__body">
        <div className="prompt-editor__main">
          <CodeTextarea
            ref={editor}
            label={`${props.name} (${scopeLabel.toLowerCase()})`}
            value={draft}
            onChange={setDraft}
            onSave={onSave}
            errorLines={new Set(issues.map((i) => i.line))}
            describedBy={issuesId}
          />
          <IssueList
            id={issuesId}
            issues={issues}
            onGoTo={(line) => editor.current?.goToLine(line)}
          />
          {showDiff && <DiffView before={base.text} after={draft} baseLabel={baseLabel} />}
        </div>
        <HelpPanel frontmatter={props.layers.effective.frontmatter} />
      </div>
      <ResetDialog
        open={confirmReset}
        name={props.name}
        scope={props.scope}
        baseLabel={baseLabel}
        onCancel={() => setConfirmReset(false)}
        onConfirm={onReset}
      />
    </div>
  )
}

export function PromptEditor(props: EditorProps) {
  const layers = useIpcQuery('prompts:get', {
    name: props.name,
    ...(props.projectPath ? { projectPath: props.projectPath } : {}),
  })
  if (layers.isPending) return <p className="muted">Loading {props.name}…</p>
  if (layers.error)
    return (
      <p className="field__error" role="alert">
        Could not load {props.name}: {errorText(layers.error)}
      </p>
    )
  const start = startingText(props.scope, layers.data.raw)
  return (
    <EditorForm key={`${props.name}:${props.scope}:${start}`} {...props} layers={layers.data} />
  )
}
