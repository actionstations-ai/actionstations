import { useState, type FormEvent } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Field } from '../../components/ui'
import type { DomainProfile } from '@shared/domains'
import type { ThreatSuggestion } from '../../lib/domains'
import { ListEditor } from './ListEditor'
import { ThreatChoice } from './ThreatChoice'
import { validateDraft, type BriefDraft, type BriefErrors } from './brief-form'

interface Props {
  draft: BriefDraft
  onChange: (d: BriefDraft) => void
  onSubmit: (d: BriefDraft) => void
  submitting: boolean
  roleSuggestions: string[]
  /** The project's effective domain profile; with `suggestion`, shows the threat choice. */
  profile?: DomainProfile
  suggestion?: ThreatSuggestion
  ideaTitle?: string
  onClearIdea?: () => void
}

function NumberField(props: {
  label: string
  value: string
  error?: string | undefined
  min: number
  max: number
  step: number
  onChange: (v: string) => void
}) {
  return (
    <Field label={props.label} {...(props.error ? { error: props.error } : {})}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type="number"
          className="input"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export function BriefForm(props: Props) {
  const { draft } = props
  const [errors, setErrors] = useState<BriefErrors>({})
  const set = <K extends keyof BriefDraft>(key: K, value: BriefDraft[K]) =>
    props.onChange({ ...draft, [key]: value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateDraft(draft)
    setErrors(found)
    if (Object.keys(found).length === 0) props.onSubmit(draft)
  }
  return (
    <form className="card brief-form" onSubmit={submit} aria-label="Scenario brief" noValidate>
      {props.ideaTitle && (
        <p className="brief-form__idea">
          Developing idea: <strong>{props.ideaTitle}</strong>{' '}
          {props.onClearIdea && (
            <Button size="sm" variant="ghost" onClick={props.onClearIdea}>
              Start blank
            </Button>
          )}
        </p>
      )}
      <Field
        label="Threat or theme"
        hint="What happens, to which systems, and what you want players to struggle with."
        {...(errors.userPrompt ? { error: errors.userPrompt } : {})}
      >
        {({ id, describedBy, invalid }) => (
          <textarea
            id={id}
            className="textarea brief-form__prompt"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={draft.userPrompt}
            placeholder="e.g. An attacker tampers with the AODB so FIDS, BHS and the PA mislead passengers during a holiday rush."
            onChange={(e) => set('userPrompt', e.target.value)}
          />
        )}
      </Field>
      {props.profile && props.suggestion && (
        <ThreatChoice
          profile={props.profile}
          suggestion={props.suggestion}
          value={draft.threatFamily}
          onChange={(v) => {
            const { threatFamily: _old, ...rest } = draft
            props.onChange(v ? { ...rest, threatFamily: v } : rest)
          }}
        />
      )}
      <ListEditor
        label="Audience roles"
        variant="chips"
        items={draft.audience}
        onChange={(v) => set('audience', v)}
        placeholder="e.g. Airport Operations"
        suggestions={props.roleSuggestions}
      />
      <div className="brief-form__grid">
        <NumberField
          label="Duration (hours)"
          value={draft.durationHours}
          error={errors.durationHours}
          min={0.5}
          max={24}
          step={0.5}
          onChange={(v) => set('durationHours', v)}
        />
        <NumberField
          label="Phases"
          value={draft.phaseCount}
          error={errors.phaseCount}
          min={1}
          max={8}
          step={1}
          onChange={(v) => set('phaseCount', v)}
        />
        <Field
          label="Start time"
          hint="Narrative clock at STARTEX."
          {...(errors.startWallClock ? { error: errors.startWallClock } : {})}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="time"
              className="input"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={draft.startWallClock}
              onChange={(e) => set('startWallClock', e.target.value)}
            />
          )}
        </Field>
      </div>
      <ListEditor
        label="Learning objectives"
        items={draft.learningObjectives}
        onChange={(v) => set('learningObjectives', v)}
        placeholder="e.g. Coordinate public messaging across IT, Ops and PIO"
      />
      <ListEditor
        label="Constraints"
        items={draft.constraints}
        onChange={(v) => set('constraints', v)}
        placeholder="e.g. Must test TIRP §13.6; one red herring per phase"
      />
      <div className="row brief-form__actions">
        <Button type="submit" variant="primary" disabled={props.submitting}>
          <Sparkles size={16} aria-hidden /> {props.submitting ? 'Starting…' : 'Generate scenario'}
        </Button>
      </div>
    </form>
  )
}
