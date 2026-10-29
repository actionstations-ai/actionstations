// A scenario's surveys: the list with status and response counts, and "New survey" from a
// template (HSEEP Participant Feedback Form, knowledge check, confidence, debriefs) or blank.
import { ArrowLeft, Copy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { SurveyListItem } from '@shared/ipc'
import { questionCount } from '@shared/survey-layout'
import { Badge, Button, Dialog, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { KIND_LABELS, STATUS_LABELS, TIMING_LABELS } from './survey-edit'
import '../scenarios/scenarios.css'
import './surveys.css'

function NewSurvey(props: { projectPath: string; scenarioId: string; base: string }) {
  const templates = useIpcQuery('surveys:templates', undefined)
  const navigate = useNavigate()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const create = async (templateId: string) => {
    setBusy(templateId)
    setError('')
    try {
      const { surveys } = await call('surveys:from-template', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        templateId,
      })
      void queryClient.invalidateQueries({ queryKey: ['surveys:list'] })
      navigate(`${props.base}/${surveys[0]!.id}`)
    } catch (err) {
      setError(errorText(err))
      setBusy('')
    }
  }
  const listed = (templates.data ?? []).filter((t) => t.listed)
  return (
    <section className="sv-new" aria-labelledby="sv-new-title">
      <h2 id="sv-new-title">New survey</h2>
      <ul className="grid-cards">
        {listed.map((t) => (
          <li key={t.id} className="card sv-template">
            <h3>{t.title.replace(/\s*\(before\)$/, '')}</h3>
            <p className="muted">{t.description}</p>
            <Button size="sm" disabled={!!busy} onClick={() => void create(t.id)}>
              <Plus size={14} aria-hidden />{' '}
              {busy === t.id ? 'Creating…' : `Create ${t.title.replace(/\s*\(before\)$/, '')}`}
            </Button>
          </li>
        ))}
        <li className="card sv-template">
          <h3>Blank survey</h3>
          <p className="muted">Start from scratch with your own questions.</p>
          <Button size="sm" disabled={!!busy} onClick={() => void create('blank')}>
            <Plus size={14} aria-hidden /> {busy === 'blank' ? 'Creating…' : 'Create blank survey'}
          </Button>
        </li>
      </ul>
      {templates.isError && (
        <p className="field__error">Could not load the templates: {errorText(templates.error)}</p>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function SurveyRow(props: {
  item: SurveyListItem
  base: string
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { survey, responseCount } = props.item
  const n = questionCount(survey)
  return (
    <li className="card sv-row">
      <div className="sv-row__main">
        <h3>
          <Link to={`${props.base}/${survey.id}`}>{survey.title}</Link>
        </h3>
        <p className="muted">
          {KIND_LABELS[survey.kind]} · {TIMING_LABELS[survey.timing]} · {n}{' '}
          {n === 1 ? 'question' : 'questions'}
        </p>
      </div>
      <div className="row sv-row__meta">
        <Badge
          tone={
            survey.status === 'ready' ? 'ok' : survey.status === 'archived' ? 'neutral' : 'info'
          }
        >
          {STATUS_LABELS[survey.status]}
        </Badge>
        <span>
          {responseCount} {responseCount === 1 ? 'response' : 'responses'}
        </span>
        <Link className="btn btn--sm" to={`${props.base}/${survey.id}?tab=results`}>
          Results
        </Link>
        <Button
          size="sm"
          variant="ghost"
          icon
          aria-label={`Duplicate ${survey.title}`}
          onClick={props.onDuplicate}
        >
          <Copy size={14} aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon
          aria-label={`Delete ${survey.title}`}
          onClick={props.onDelete}
        >
          <Trash2 size={14} aria-hidden />
        </Button>
      </div>
    </li>
  )
}

function DeleteDialog(props: {
  item: SurveyListItem | undefined
  onClose: () => void
  onConfirm: () => void
}) {
  const s = props.item
  return (
    <Dialog
      open={!!s}
      onOpenChange={(open) => !open && props.onClose()}
      title={`Delete "${s?.survey.title ?? ''}"?`}
      description={
        s?.responseCount
          ? `Its ${s.responseCount} ${s.responseCount === 1 ? 'response is' : 'responses are'} deleted too. This cannot be undone.`
          : 'This cannot be undone.'
      }
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="danger" onClick={props.onConfirm}>
            Delete survey
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

export default function SurveysPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const scenarioUrl = `/p/${projectKey(projectPath)}/scenarios/${scenarioId}`
  const base = `${scenarioUrl}/surveys`
  const scenario = useIpcQuery(
    'scenarios:get',
    { projectPath, scenarioId },
    { enabled: !!scenarioId },
  )
  const list = useIpcQuery('surveys:list', { projectPath, scenarioId }, { enabled: !!scenarioId })
  const [deleting, setDeleting] = useState<SurveyListItem>()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['surveys:list'] })
  const duplicate = (surveyId: string) =>
    call('surveys:duplicate', { projectPath, scenarioId, surveyId }).then(refresh, (err: unknown) =>
      toast.error('Could not duplicate the survey', err),
    )
  const remove = (surveyId: string) => {
    setDeleting(undefined)
    call('surveys:delete', { projectPath, scenarioId, surveyId }).then(refresh, (err: unknown) =>
      toast.error('Could not delete the survey', err),
    )
  }
  return (
    <div className="page page--wide surveys-page">
      <Link to={scenarioUrl} className="back-link">
        <ArrowLeft size={14} aria-hidden /> Back to scenario
      </Link>
      <PageHeader
        eyebrow="Surveys"
        title={scenario.data?.title ?? 'Loading…'}
        description="Participant feedback, knowledge checks, confidence self-assessments and staff debriefs. Responses are anonymous."
      />
      <section aria-labelledby="sv-list-title">
        <h2 id="sv-list-title">This scenario's surveys</h2>
        {list.isError && (
          <p className="field__error" role="alert">
            Could not load the surveys: {errorText(list.error)}
          </p>
        )}
        {list.data && !list.data.length && (
          <EmptyState
            title="No surveys yet"
            body="Start with the HSEEP Participant Feedback Form below."
          />
        )}
        {!!list.data?.length && (
          <ul className="sv-list">
            {list.data.map((item) => (
              <SurveyRow
                key={item.survey.id}
                item={item}
                base={base}
                onDuplicate={() => void duplicate(item.survey.id)}
                onDelete={() => setDeleting(item)}
              />
            ))}
          </ul>
        )}
      </section>
      <NewSurvey projectPath={projectPath} scenarioId={scenarioId} base={base} />
      <DeleteDialog
        item={deleting}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove(deleting.survey.id)}
      />
    </div>
  )
}
