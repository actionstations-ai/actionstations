// One survey: build it (Questions), see it as participants do (Preview), and its Results with
// paper-response entry. Edits save a moment after each change.
import { Tabs } from 'radix-ui'
import { ArrowLeft, FileDown, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Badge, Button, PageHeader } from '../../components/ui'
import { fromProjectKey, projectKey } from '../../state/project'
import { PaperEntryForm } from './PaperEntryForm'
import { PrintStatus, SurveyDeliveryDialog } from './SurveyDeliveryDialog'
import { useSurveyPrint } from './use-survey-print'
import { SurveyEditor } from './SurveyEditor'
import { SurveyPreview } from './SurveyPreview'
import { SurveyResults } from './SurveyResults'
import { KIND_LABELS, STATUS_LABELS } from './survey-edit'
import { useSurveyDraft, type SurveyDraft } from './use-survey-draft'
import '../scenarios/scenarios.css'
import './surveys.css'

const SAVE_TEXT: Record<SurveyDraft['status'], string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved',
  invalid: 'Not saved yet',
  error: 'Could not save',
  conflict: 'Changed elsewhere',
}

function SaveState({ draft }: { draft: SurveyDraft }) {
  const bad = draft.status === 'error' || draft.status === 'conflict' || draft.status === 'invalid'
  return (
    <div className="sv-save" role="status" aria-live="polite">
      <span className={bad ? 'field__error' : 'muted'}>
        {SAVE_TEXT[draft.status]}
        {bad && draft.problem ? `: ${draft.problem}` : ''}
      </span>
      {draft.status === 'conflict' && (
        <Button size="sm" onClick={draft.reload}>
          Reload the survey
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

function ResultsTab(props: { projectPath: string; scenarioId: string; draft: SurveyDraft }) {
  const survey = props.draft.survey!
  const printing = useSurveyPrint(props.projectPath, props.scenarioId)
  return (
    <div className="sv-results-tab">
      <div className="row">
        <Button
          disabled={printing.running}
          onClick={() => void printing.print([survey.id], ['survey_results_pdf'])}
        >
          <FileDown size={16} aria-hidden /> Save results PDF
        </Button>
      </div>
      <PrintStatus printing={printing} />
      <SurveyResults
        projectPath={props.projectPath}
        scenarioId={props.scenarioId}
        surveyId={survey.id}
      />
      <PaperEntryForm
        projectPath={props.projectPath}
        scenarioId={props.scenarioId}
        survey={survey}
      />
    </div>
  )
}

export default function SurveyPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const surveyId = params.surveyId ?? ''
  const [search] = useSearchParams()
  const [tab, setTab] = useState(search.get('tab') ?? 'questions')
  const [delivering, setDelivering] = useState(false)
  const draft = useSurveyDraft(projectPath, scenarioId, surveyId)
  const listUrl = `/p/${projectKey(projectPath)}/scenarios/${scenarioId}/surveys`
  const survey = draft.survey
  const back = (
    <Link to={listUrl} className="back-link">
      <ArrowLeft size={14} aria-hidden /> All surveys
    </Link>
  )
  if (draft.loadError)
    return (
      <div className="page">
        {back}
        <p className="field__error" role="alert">
          Could not load this survey: {draft.loadError}
        </p>
      </div>
    )
  return (
    <div className="page page--wide survey-page">
      {back}
      <PageHeader
        eyebrow={survey ? KIND_LABELS[survey.kind] : 'Survey'}
        title={survey?.title || 'Loading…'}
        actions={
          survey && (
            <>
              <Badge tone={survey.status === 'ready' ? 'ok' : 'info'}>
                {STATUS_LABELS[survey.status]}
              </Badge>
              <Button
                variant="primary"
                onClick={() => {
                  // The form prints from the saved file: save pending edits first.
                  void draft.flush()
                  setDelivering(true)
                }}
              >
                <Send size={16} aria-hidden /> Deliver…
              </Button>
            </>
          )
        }
      />
      {survey && <SaveState draft={draft} />}
      {survey && (
        <Tabs.Root value={tab} onValueChange={setTab} className="tabs">
          <Tabs.List className="tabs__list" aria-label="Survey sections">
            <Tabs.Trigger value="questions" className="tabs__trigger">
              Questions
            </Tabs.Trigger>
            <Tabs.Trigger value="preview" className="tabs__trigger">
              Preview
            </Tabs.Trigger>
            <Tabs.Trigger value="results" className="tabs__trigger">
              Results
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="questions" className="tabs__panel">
            <SurveyEditor survey={survey} update={draft.update} />
          </Tabs.Content>
          <Tabs.Content value="preview" className="tabs__panel">
            <SurveyPreview survey={survey} />
          </Tabs.Content>
          <Tabs.Content value="results" className="tabs__panel">
            <ResultsTab projectPath={projectPath} scenarioId={scenarioId} draft={draft} />
          </Tabs.Content>
        </Tabs.Root>
      )}
      {survey && (
        <SurveyDeliveryDialog
          open={delivering}
          onOpenChange={setDelivering}
          projectPath={projectPath}
          scenarioId={scenarioId}
          survey={survey}
        />
      )}
    </div>
  )
}
