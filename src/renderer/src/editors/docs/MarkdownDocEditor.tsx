// WYSIWYG editor for one scenario document (handbook, briefing, hot wash, MSEL document):
// formatting toolbar, source toggle, autosave + explicit save, history with diff/restore,
// and "Regenerate" for the stage that writes it.
import { EditorContent } from '@tiptap/react'
import { Clock, FileCode, Save } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import type { Scenario, ScenarioDocKind } from '@shared/schemas/scenario'
import { Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { formatItems } from './format-items'
import { HistoryPanel } from './HistoryPanel'
import { LinkDialog } from './LinkDialog'
import { DOC_LABELS, DOC_STAGE, lastGenerated } from './owners'
import { RegenerateButton } from './RegenerateButton'
import { SaveProblem, SaveState } from './SaveState'
import { Toolbar } from './Toolbar'
import { useDocEditor } from './use-doc-editor'
import { errorText } from '../../lib/errors'

export interface DocEditorProps {
  projectPath: string
  scenario: Scenario
  kind: ScenarioDocKind
  onJob?: ((jobId: string) => void) | undefined
}

/** True when the newest user save is later than the stage's last successful run. */
function useEditedSinceGeneration(props: DocEditorProps): boolean {
  const history = useIpcQuery('scenarios:history', {
    projectPath: props.projectPath,
    scenarioId: props.scenario.id,
    artifact: props.kind,
  })
  const newestUser = history.data?.find((e) => e.by === 'user')?.at
  const generated = lastGenerated(props.scenario, DOC_STAGE[props.kind])
  return !!newestUser && (!generated || newestUser > generated)
}

type DocState = ReturnType<typeof useDocEditor>

/** Formatting toolbar (rich mode) and the source / history / save actions. */
function DocBar(props: {
  d: DocState
  label: string
  showHistory: boolean
  onHistory: () => void
  onLink: () => void
}) {
  const { d, label } = props
  return (
    <div className="doc-editor__bar">
      {d.editor && d.mode === 'rich' && (
        <Toolbar
          label={`${label} formatting`}
          controls={d.surfaceId}
          items={formatItems(d.editor, props.onLink)}
        />
      )}
      <div className="doc-editor__actions">
        <SaveState status={d.status} dirty={d.dirty} />
        <Button size="sm" aria-pressed={d.mode === 'source'} onClick={d.toggleSource}>
          <FileCode size={14} aria-hidden /> Markdown source
        </Button>
        <Button size="sm" aria-pressed={props.showHistory} onClick={props.onHistory}>
          <Clock size={14} aria-hidden /> History
        </Button>
        <Button size="sm" variant="primary" onClick={() => void d.save()}>
          <Save size={14} aria-hidden /> Save
        </Button>
      </div>
    </div>
  )
}

function EmptyNote(props: { label: string; generated: boolean; kind: ScenarioDocKind }) {
  const noun = props.label.toLowerCase()
  if (props.generated)
    return (
      <p className="muted">
        The {noun} has not been generated yet. Regenerate it, or start writing below.
      </p>
    )
  return (
    <p className="muted">
      No {noun} yet. Write them below; they are exported with the{' '}
      {props.kind === 'handouts' ? 'player packet' : 'facilitator material'}.
    </p>
  )
}

/** The page: the rich editor, or the markdown source in source mode. */
function DocPage(props: { d: DocState; label: string }) {
  const { d, label } = props
  return (
    <>
      <article aria-label={label} hidden={d.mode !== 'rich'} className="doc-editor__page">
        <EditorContent editor={d.editor} />
      </article>
      {d.mode === 'source' && (
        <textarea
          className="textarea doc-editor__source"
          aria-label={`${label} markdown source`}
          spellCheck={false}
          value={d.source}
          onChange={(e) => d.editSource(e.target.value)}
        />
      )}
    </>
  )
}

/** Cmd/Ctrl+S saves; Cmd/Ctrl+K opens the link dialog in rich mode. */
function docKeys(d: DocState, openLink: () => void) {
  return (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void d.save()
    } else if (mod && e.key.toLowerCase() === 'k' && d.mode === 'rich') {
      e.preventDefault()
      openLink()
    }
  }
}

function LoadError(props: { error: unknown }) {
  return (
    <p className="field__error" role="alert">
      Could not load: {errorText(props.error)}
    </p>
  )
}

export function MarkdownDocEditor(props: DocEditorProps) {
  const label = DOC_LABELS[props.kind]
  const ref = { projectPath: props.projectPath, scenarioId: props.scenario.id, kind: props.kind }
  const d = useDocEditor(ref, label)
  const [linkOpen, setLinkOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const edited = useEditedSinceGeneration(props)
  const empty = d.doc.data !== undefined && !d.doc.data.markdown.trim() && !d.dirty
  const stage = DOC_STAGE[props.kind]

  return (
    <div className="doc-editor" onKeyDown={docKeys(d, () => setLinkOpen(true))}>
      {stage && (
        <RegenerateButton
          {...{ projectPath: props.projectPath, scenarioId: props.scenario.id, stage }}
          label={label.toLowerCase()}
          hasContent={!empty}
          edited={edited || d.dirty}
          snapshot={() => d.save('Before regenerating', true)}
          onJob={props.onJob}
        />
      )}
      <DocBar
        d={d}
        label={label}
        showHistory={showHistory}
        onHistory={() => setShowHistory((v) => !v)}
        onLink={() => setLinkOpen(true)}
      />
      <SaveProblem status={d.status} error={d.error} onRetry={() => void d.retry()} />
      {d.doc.isError && <LoadError error={d.doc.error} />}
      <div className="doc-editor__body">
        <div className="doc-editor__main">
          {empty && <EmptyNote label={label} generated={!!stage} kind={props.kind} />}
          <DocPage d={d} label={label} />
        </div>
        {showHistory && (
          <HistoryPanel
            projectPath={props.projectPath}
            scenarioId={props.scenario.id}
            kind={props.kind}
            current={d.current()}
            dirty={d.dirty}
            onRestore={d.restore}
          />
        )}
      </div>
      {d.editor && <LinkDialog editor={d.editor} open={linkOpen} onOpenChange={setLinkOpen} />}
    </div>
  )
}
