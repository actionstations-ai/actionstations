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

export function MarkdownDocEditor(props: DocEditorProps) {
  const label = DOC_LABELS[props.kind]
  const ref = { projectPath: props.projectPath, scenarioId: props.scenario.id, kind: props.kind }
  const d = useDocEditor(ref, label)
  const [linkOpen, setLinkOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const edited = useEditedSinceGeneration(props)
  const empty = d.doc.data !== undefined && !d.doc.data.markdown.trim() && !d.dirty

  function onKeyDown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void d.save()
    } else if (mod && e.key.toLowerCase() === 'k' && d.mode === 'rich') {
      e.preventDefault()
      setLinkOpen(true)
    }
  }

  return (
    <div className="doc-editor" onKeyDown={onKeyDown}>
      <RegenerateButton
        projectPath={props.projectPath}
        scenarioId={props.scenario.id}
        stage={DOC_STAGE[props.kind]}
        label={label.toLowerCase()}
        hasContent={!empty}
        edited={edited || d.dirty}
        snapshot={() => d.save('Before regenerating', true)}
        onJob={props.onJob}
      />
      <div className="doc-editor__bar">
        {d.editor && d.mode === 'rich' && (
          <Toolbar
            label={`${label} formatting`}
            controls={d.surfaceId}
            items={formatItems(d.editor, () => setLinkOpen(true))}
          />
        )}
        <div className="doc-editor__actions">
          <SaveState status={d.status} dirty={d.dirty} />
          <Button size="sm" aria-pressed={d.mode === 'source'} onClick={d.toggleSource}>
            <FileCode size={14} aria-hidden /> Markdown source
          </Button>
          <Button size="sm" aria-pressed={showHistory} onClick={() => setShowHistory((v) => !v)}>
            <Clock size={14} aria-hidden /> History
          </Button>
          <Button size="sm" variant="primary" onClick={() => void d.save()}>
            <Save size={14} aria-hidden /> Save
          </Button>
        </div>
      </div>
      <SaveProblem status={d.status} error={d.error} onRetry={() => void d.retry()} />
      {d.doc.isError && <p className="field__error">Could not load: {d.doc.error.message}</p>}
      <div className="doc-editor__body">
        <div className="doc-editor__main">
          {empty && (
            <p className="muted">
              The {label.toLowerCase()} has not been generated yet. Regenerate it, or start writing
              below.
            </p>
          )}
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
