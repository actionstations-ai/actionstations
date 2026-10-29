// Read-and-try preview of a survey as participants see it. Answers stay in this view; "Check
// answers" shows which required questions are still empty. Built from the same helpers the
// player page uses (src/shared/survey-layout.ts), never from the player bundle.
import { useState } from 'react'
import type { Survey } from '@shared/schemas/survey'
import { cleanAnswers, missingRequired, questionCount } from '@shared/survey-layout'
import { Button, EmptyState } from '../../components/ui'
import { emptyFormValue, type FormValue } from './form-value'
import { SurveyForm } from './SurveyForm'

export function SurveyPreview({ survey }: { survey: Survey }) {
  const [value, setValue] = useState<FormValue>(emptyFormValue)
  const [missing, setMissing] = useState<Set<string>>()
  if (!questionCount(survey))
    return <EmptyState title="No questions yet" body="Add questions on the Questions tab." />
  const check = () => {
    const gaps = missingRequired(survey, cleanAnswers(survey, value.answers, value.otherText))
    setMissing(new Set(gaps.map((q) => q.id)))
  }
  return (
    <div className="sv-preview">
      <p className="muted">This is how participants see the survey. Nothing here is saved.</p>
      <div className="sv-preview__sheet">
        <h2>{survey.title}</h2>
        <SurveyForm
          survey={survey}
          value={value}
          onChange={setValue}
          {...(missing ? { missing } : {})}
          idPrefix="preview"
        />
      </div>
      <div className="row">
        <Button onClick={check}>Check answers</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setValue(emptyFormValue())
            setMissing(undefined)
          }}
        >
          Clear
        </Button>
        <span role="status" aria-live="polite">
          {missing &&
            (missing.size
              ? `${missing.size} required ${missing.size === 1 ? 'question has' : 'questions have'} no answer.`
              : 'All required questions are answered.')}
        </span>
      </div>
    </div>
  )
}
