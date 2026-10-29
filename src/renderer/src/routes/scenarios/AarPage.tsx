// The After-Action Report / Improvement Plan (#419): the document in the Markdown editor,
// beside it the capability ratings a person confirms and the evidence behind each finding,
// below it the Improvement Plan table. The model drafts; a person decides what prints.
import { ArrowLeft, Download } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { aarStatus, type Aar } from '@shared/schemas/aar'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, Button, EmptyState, PageHeader } from '../../components/ui'
import { MarkdownDocEditor } from '../../editors/docs/MarkdownDocEditor'
import {
  CapabilityRatings,
  type SelectedFinding,
} from '../../editors/docs/structured/CapabilityRatings'
import { EvidenceDrawer } from '../../editors/docs/structured/EvidenceDrawer'
import { ImprovementPlanEditor } from '../../editors/docs/structured/ImprovementPlanEditor'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { DraftAarButton } from './DraftAarButton'
import { hasRecordEvidence } from './aar-evidence'
import { useAarDraft, type AarDraft } from './use-aar-draft'
import './scenarios.css'
import './aar.css'

const SAVE_TEXT: Record<AarDraft['status'], string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Could not save',
  conflict: 'Changed elsewhere',
}

function SaveLine({ draft }: { draft: AarDraft }) {
  const bad = draft.status === 'error' || draft.status === 'conflict'
  return (
    <div className="aar-save" role="status" aria-live="polite">
      <span className={bad ? 'field__error' : 'muted'}>
        {SAVE_TEXT[draft.status]}
        {bad && draft.problem ? `: ${draft.problem}` : ''}
      </span>
      {draft.status === 'conflict' && (
        <Button size="sm" onClick={draft.reload}>
          Reload the draft
        </Button>
      )}
      {draft.status === 'error' && (
        <Button size="sm" onClick={() => void draft.flush()}>
          Try again
        </Button>
      )}
    </div>
  )
}

function Empty(props: { projectPath: string; scenario: Scenario; hasEvidence: boolean }) {
  return (
    <EmptyState
      title="No After-Action Report yet"
      body={
        <>
          The draft is built from what the exercise produced: facilitator notes, 3-Up / 3-Down hot
          wash items and the decision log from Facilitate, evaluator observations, the live-play
          session log when there is one, and survey results. Strengths and areas for improvement are
          grouped by Core Capability and cite the plan sections involved; you confirm the ratings
          and set the owners and dates before anything prints as final.
          {!props.hasEvidence &&
            ' Run the exercise (or write notes and hot wash items in Facilitate) first.'}
        </>
      }
      actions={
        <DraftAarButton
          projectPath={props.projectPath}
          scenarioId={props.scenario.id}
          hasEvidence={props.hasEvidence}
          hasDraft={false}
          variant="primary"
        />
      }
    />
  )
}

function AarBody(props: { projectPath: string; scenario: Scenario; aar: Aar; draft: AarDraft }) {
  const { projectPath, scenario, aar, draft } = props
  const [selected, setSelected] = useState<SelectedFinding>()
  const record = useIpcQuery(
    'aar:record',
    {
      projectPath,
      scenarioId: scenario.id,
      ...(aar.liveSessionId ? { sessionId: aar.liveSessionId } : {}),
    },
    { enabled: !!selected },
  )
  return (
    <>
      <div className="aar-layout">
        <div className="aar-layout__doc">
          <MarkdownDocEditor
            key={aar.updatedAt}
            projectPath={projectPath}
            scenario={scenario}
            kind="aar"
          />
        </div>
        <aside className="aar-layout__side">
          <SaveLine draft={draft} />
          {selected ? (
            <EvidenceDrawer
              selected={selected}
              record={record.data}
              loading={record.isLoading}
              onClose={() => setSelected(undefined)}
            />
          ) : null}
          <CapabilityRatings
            aar={aar}
            scenario={scenario}
            onChange={draft.update}
            onEvidence={setSelected}
          />
        </aside>
      </div>
      <ImprovementPlanEditor aar={aar} scenario={scenario} onChange={draft.update} />
    </>
  )
}

export default function AarPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const scenarioQ = useIpcQuery('scenarios:get', { projectPath, scenarioId })
  const stateQ = useIpcQuery('facilitator:state-get', { projectPath, scenarioId })
  const draft = useAarDraft(projectPath, scenarioId)
  const base = `/p/${projectKey(projectPath)}/scenarios/${scenarioId}`
  const back = (
    <Link to={base} className="back-link">
      <ArrowLeft size={14} aria-hidden /> Back to scenario
    </Link>
  )
  const error = scenarioQ.error ? errorText(scenarioQ.error) : draft.loadError
  if (error)
    return (
      <div className="page">
        {back}
        <p className="field__error" role="alert">
          Could not load the After-Action Report: {error}
        </p>
      </div>
    )
  const scenario = scenarioQ.data
  const aar = draft.aar
  const hasEvidence = stateQ.data ? hasRecordEvidence(stateQ.data) : true
  return (
    <div className="page page--wide aar-page">
      {back}
      <PageHeader
        eyebrow="After-Action Report / Improvement Plan"
        title={scenario?.title ?? 'Loading…'}
        description="HSEEP 2020 layout, drafted from the exercise record. Confirm the ratings and set the owners and dates; only confirmed ratings print."
        actions={
          scenario && aar ? (
            <>
              <Badge tone={aarStatus(aar) === 'draft' ? 'warn' : 'ok'}>
                {aarStatus(aar) === 'draft' ? 'Draft: ratings pending' : 'Ratings confirmed'}
              </Badge>
              <DraftAarButton
                projectPath={projectPath}
                scenarioId={scenario.id}
                hasEvidence={hasEvidence}
                hasDraft
                onDone={draft.reload}
              />
              <Link
                className="btn"
                to={`/program/import/${projectKey(projectPath)}/${scenario.id}`}
              >
                Send corrective actions to program
              </Link>
              <Link className="btn" to={`${base}/export`}>
                <Download size={16} aria-hidden /> Export…
              </Link>
            </>
          ) : null
        }
      />
      {scenario && aar === null && (
        <Empty projectPath={projectPath} scenario={scenario} hasEvidence={hasEvidence} />
      )}
      {scenario && aar && (
        <AarBody projectPath={projectPath} scenario={scenario} aar={aar} draft={draft} />
      )}
      {(!scenario || aar === undefined) && <p className="muted">Loading…</p>}
    </div>
  )
}
