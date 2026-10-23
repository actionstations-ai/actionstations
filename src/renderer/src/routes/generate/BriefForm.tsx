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

type SetField = <K extends keyof BriefDraft>(key: K, value: BriefDraft[K]) => void

function IdeaLine(props: { title: string; onClear?: (() => void) | undefined }) {
  return (
    <p className="brief-form__idea">
      Developing idea: <strong>{props.title}</strong>{' '}
      {props.onClear && (
        <Button size="sm" variant="ghost" onClick={props.onClear}>
          Start blank
        </Button>
      )}
    </p>
  )
}

function PromptField(props: { draft: BriefDraft; errors: BriefErrors; set: SetField }) {
  const { errors } = props
  return (
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
          value={props.draft.userPrompt}
          placeholder="e.g. An attacker tampers with the AODB so FIDS, BHS and the PA mislead passengers during a holiday rush."
          onChange={(e) => props.set('userPrompt', e.target.value)}
        />
      )}
    </Field>
  )
}

/** Duration, phase count and the narrative start time. */
function TimingFields(props: { draft: BriefDraft; errors: BriefErrors; set: SetField }) {
  const { draft, errors, set } = props
  return (
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
  )
}

/** The draft with the chosen threat family, or without one. */
function withThreat(draft: BriefDraft, family: BriefDraft['threatFamily']): BriefDraft {
  const { threatFamily: _old, ...rest } = draft
  return family ? { ...rest, threatFamily: family } : rest
}

export function BriefForm(props: Props) {
  const { draft } = props
  const [errors, setErrors] = useState<BriefErrors>({})
  const set: SetField = (key, value) => props.onChange({ ...draft, [key]: value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateDraft(draft)
    setErrors(found)
    if (Object.keys(found).length === 0) props.onSubmit(draft)
  }
  return (
    <form className="card brief-form" onSubmit={submit} aria-label="Scenario brief" noValidate>
      {props.ideaTitle && <IdeaLine title={props.ideaTitle} onClear={props.onClearIdea} />}
      <PromptField draft={draft} errors={errors} set={set} />
      {props.profile && props.suggestion && (
        <ThreatChoice
          profile={props.profile}
          suggestion={props.suggestion}
          value={draft.threatFamily}
          onChange={(v) => props.onChange(withThreat(draft, v))}
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
      <TimingFields draft={draft} errors={errors} set={set} />
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
