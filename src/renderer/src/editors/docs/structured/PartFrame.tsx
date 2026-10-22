import { Save } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Scenario } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { PART_STAGE, type StructuredPart } from '../owners'
import { RegenerateButton } from '../RegenerateButton'
import { SaveProblem, SaveState } from '../SaveState'
import { useEditedSince, type useScenarioPart } from './use-scenario-part'

export interface PartEditorProps {
  projectPath: string
  scenario: Scenario
  onJob?: ((jobId: string) => void) | undefined
}

/** Heading, save state, save + regenerate actions and the conflict banner for one part. */
export function PartFrame(
  props: {
    title: string
    part: StructuredPart
    /** Lower-case noun for the regenerate button and dialog. */
    noun: string
    hasContent: boolean
    editor: Pick<
      ReturnType<typeof useScenarioPart>,
      'dirty' | 'status' | 'error' | 'retry' | 'save'
    >
    hint?: ReactNode
    children: ReactNode
  } & PartEditorProps,
) {
  const stage = PART_STAGE[props.part]
  const edited = useEditedSince(props.projectPath, props.scenario, stage)
  const e = props.editor
  return (
    <section className="part" aria-label={props.title}>
      <header className="part__head">
        <h3 className="section-title">{props.title}</h3>
        <div className="doc-editor__actions">
          <SaveState status={e.status} dirty={e.dirty} />
          <Button size="sm" variant="primary" onClick={() => void e.save()}>
            <Save size={14} aria-hidden /> Save
          </Button>
        </div>
      </header>
      {props.hint && <p className="muted part__hint">{props.hint}</p>}
      <SaveProblem status={e.status} error={e.error} onRetry={() => void e.retry()} />
      {props.children}
      <RegenerateButton
        projectPath={props.projectPath}
        scenarioId={props.scenario.id}
        stage={stage}
        label={props.noun}
        hasContent={props.hasContent}
        edited={edited || e.dirty}
        snapshot={() => e.save('Before regenerating', true)}
        onJob={props.onJob}
      />
    </section>
  )
}
