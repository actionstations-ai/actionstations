// "Enter paper responses": type in one returned form at a time. Each saved response lands in
// the same results as live ones (channel 'paper'). The form clears after each save and focus
// returns to its start, so a stack of forms is typed in without the mouse.
import { useRef, useState } from 'react'
import type { Survey } from '@shared/schemas/survey'
import { cleanAnswers, missingRequired } from '@shared/survey-layout'
import { Button } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { emptyFormValue, type FormValue } from './form-value'
import { SurveyForm } from './SurveyForm'

export function PaperEntryForm(props: {
  projectPath: string
  scenarioId: string
  survey: Survey
  onSaved?: (count: number) => void
}) {
  const { survey } = props
  const [value, setValue] = useState<FormValue>(emptyFormValue)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastId, setLastId] = useState<string>()
  const top = useRef<HTMLHeadingElement>(null)

  const save = async () => {
    setError('')
    const cleaned = cleanAnswers(survey, value.answers, value.otherText)
    const gaps = missingRequired(survey, cleaned)
    if (gaps.length) {
      setMissing(new Set(gaps.map((q) => q.id)))
      setError(`Answer the required questions first (${gaps.length}).`)
      return
    }
    if (!Object.keys(cleaned.answers).length && !Object.keys(cleaned.otherText).length) {
      setError('This form has no answers. Fill in at least one question.')
      return
    }
    setSaving(true)
    try {
      const r = await call('surveys:add-response', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        surveyId: survey.id,
        response: {
          channel: 'paper',
          ...cleaned,
          ...(value.roleGroup ? { roleGroup: value.roleGroup } : {}),
        },
      })
      setValue(emptyFormValue())
      setMissing(new Set())
      setLastId(r.responseId)
      setMessage(`Response saved. ${r.count} ${r.count === 1 ? 'response' : 'responses'} so far.`)
      props.onSaved?.(r.count)
      top.current?.focus()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const undo = async () => {
    if (!lastId) return
    try {
      const r = await call('surveys:delete-responses', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        surveyId: survey.id,
        responseId: lastId,
      })
      setLastId(undefined)
      setMessage(`Last entry removed. ${r.count} ${r.count === 1 ? 'response' : 'responses'} left.`)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <form
      className="sv-paper"
      aria-labelledby="sv-paper-title"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h2 id="sv-paper-title" tabIndex={-1} ref={top}>
        Enter paper responses
      </h2>
      <p className="muted">
        Type in one returned form at a time. Nothing about who filled it in is stored.
      </p>
      <p className="sv-paper__status" role="status" aria-live="polite">
        {message}
      </p>
      <SurveyForm
        survey={survey}
        value={value}
        onChange={setValue}
        missing={missing}
        idPrefix="paper"
      />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save response'}
        </Button>
        <Button onClick={() => setValue(emptyFormValue())} disabled={saving}>
          Clear form
        </Button>
        {lastId && (
          <Button variant="ghost" onClick={() => void undo()}>
            Remove the last entry
          </Button>
        )}
      </div>
    </form>
  )
}
