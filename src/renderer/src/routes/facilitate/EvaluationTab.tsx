// The Evaluation tab of facilitator mode (#421, FR-8): for the selected inject, its criteria
// (the critical tasks that name it, else its expected action) with a four-way rating and a note
// each. Observations go to scenarios/<id>/evaluation.json through evaluation:observe; the live
// evaluator form (#416) adds evaluators' incoming observations to the same tab. Ratings are
// about procedures: the form never asks for a player's name.
import { useEffect, useId, useRef, useState } from 'react'
import { capabilityName } from '@shared/core-capabilities'
import {
  RATING_LABELS,
  RATINGS,
  type Observation,
  type Rating,
  type RowCriterion,
} from '@shared/schemas/evaluation'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { CitationChips } from '../scenarios/CitationChips'
import { LiveObservations } from './live/LiveObservations'
import { observationId } from './evaluation'
import type { TimelineEntry } from './Timeline'
import { NOTE_SAVE_DELAY_MS } from './use-facilitator-state'

const EVALUATOR_KEY = 'ttx.facilitate.evaluator'

function rememberedEvaluator(): string {
  try {
    return localStorage.getItem(EVALUATOR_KEY) ?? ''
  } catch {
    return ''
  }
}

interface CriterionProps {
  projectPath: string
  scenarioId: string
  criterion: RowCriterion
  existing: Observation | undefined
  exerciseTime: string
  evaluator: string
}

function CriterionCard(p: CriterionProps) {
  const { criterion: c, existing } = p
  const groupId = useId()
  const noteId = useId()
  const [note, setNote] = useState(existing?.note ?? '')
  const [seen, setSeen] = useState(existing?.id)
  /** The rating just clicked, shown while its save is in flight. */
  const [pending, setPending] = useState<Rating | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Another row was selected (new criterion props): show its stored note.
  if (seen !== existing?.id) {
    setSeen(existing?.id)
    setNote(existing?.note ?? '')
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const req = { projectPath: p.projectPath, scenarioId: p.scenarioId }
  const write = async (rating: Rating, text: string) => {
    setPending(rating)
    const observation: Observation = {
      id: observationId(c.rowId, c.id),
      at: new Date().toISOString(),
      exerciseTime: p.exerciseTime,
      rowId: c.rowId,
      ...(c.taskId ? { taskId: c.taskId } : {}),
      criterionId: c.id,
      rating,
      note: text,
      ...(p.evaluator.trim() ? { evaluator: p.evaluator.trim().slice(0, 60) } : {}),
      source: 'facilitate',
    }
    try {
      const record = await call('evaluation:observe', { ...req, observation })
      queryClient.setQueryData(['evaluation:get', req], record)
    } catch (e) {
      toast.error('Could not save the rating', e)
    } finally {
      setPending(undefined)
    }
  }
  const clear = async () => {
    if (!existing) return
    try {
      const record = await call('evaluation:remove', { ...req, observationId: existing.id })
      queryClient.setQueryData(['evaluation:get', req], record)
      setNote('')
    } catch (e) {
      toast.error('Could not clear the rating', e)
    }
  }
  const onNote = (text: string) => {
    setNote(text)
    clearTimeout(timer.current)
    if (!existing) return
    timer.current = setTimeout(() => void write(existing.rating, text), NOTE_SAVE_DELAY_MS)
  }

  return (
    <article className="fac-criterion" aria-labelledby={`${groupId}-text`}>
      <p id={`${groupId}-text`} className="fac-criterion__text">
        {c.taskId && <span className="mono">{c.taskId} </span>}
        {c.text}
      </p>
      <p className="fac-criterion__meta">
        <Badge tone={c.capability ? 'info' : 'neutral'}>
          {c.capability ? capabilityName(c.capability) : 'Expected action'}
        </Badge>
        {c.citation && <CitationChips citations={[c.citation]} />}
      </p>
      <fieldset className="fac-rating" aria-describedby={`${groupId}-text`}>
        <legend className="sr-only">Rating for {c.text}</legend>
        {RATINGS.map((r) => (
          <label key={r} className="fac-rating__option" data-rating={r}>
            <input
              type="radio"
              name={groupId}
              value={r}
              checked={(pending ?? existing?.rating) === r}
              onChange={() => void write(r, note)}
            />
            {RATING_LABELS[r]}
          </label>
        ))}
        {existing && (
          <Button size="sm" variant="ghost" onClick={() => void clear()}>
            Clear
          </Button>
        )}
      </fieldset>
      <div className="field">
        <label className="field__label" htmlFor={noteId}>
          Note for {c.taskId ?? c.rowId}
        </label>
        <textarea
          id={noteId}
          className="textarea"
          rows={2}
          value={note}
          placeholder={existing ? 'What you saw; no names' : 'Pick a rating first'}
          disabled={!existing}
          onChange={(e) => onNote(e.target.value)}
        />
      </div>
    </article>
  )
}

export interface EvaluationTabProps {
  projectPath: string
  scenario: Scenario
  selected: TimelineEntry | undefined
  /** The exercise clock ("H:MM") when a rating is recorded. */
  exerciseTime: string
}

export function EvaluationTab(props: EvaluationTabProps) {
  const req = { projectPath: props.projectPath, scenarioId: props.scenario.id }
  const criteria = useIpcQuery('evaluation:criteria', req)
  const record = useIpcQuery('evaluation:get', req)
  const [evaluator, setEvaluator] = useState(rememberedEvaluator)
  const evaluatorId = useId()
  const row = props.selected?.row
  const mine = row ? (criteria.data ?? []).filter((c) => c.rowId === row.id) : []
  const byId = new Map((record.data?.observations ?? []).map((o) => [o.id, o]))
  const hasGuides = props.scenario.evaluation?.eegs.length > 0
  return (
    <div className="fac-eval">
      <div className="field">
        <label className="field__label" htmlFor={evaluatorId}>
          Evaluator label (optional)
        </label>
        <input
          id={evaluatorId}
          className="input"
          maxLength={60}
          placeholder="Evaluator 2"
          value={evaluator}
          onChange={(e) => {
            setEvaluator(e.target.value)
            try {
              localStorage.setItem(EVALUATOR_KEY, e.target.value)
            } catch {
              // Not remembered; still used for this session.
            }
          }}
        />
      </div>
      {!hasGuides && (
        <p className="muted">
          This scenario has no evaluation guides yet; each inject's expected action is the
          criterion. Generate the guides on the Scenario page (Evaluation tab) for criteria taken
          from your plans.
        </p>
      )}
      {!row && <p className="muted">Select an inject in the timeline to rate its criteria.</p>}
      {row && (
        <h2 className="fac-eval__title">
          <span className="mono">
            {row.time} · {row.id}
          </span>{' '}
          {props.selected?.deliveredAt ? (
            <Badge tone="ok">Delivered {props.selected.deliveredAt}</Badge>
          ) : (
            <Badge>Not delivered yet</Badge>
          )}
        </h2>
      )}
      {criteria.isError && (
        <p className="field__error" role="alert">
          Could not load the criteria.
        </p>
      )}
      {row && criteria.data && !mine.length && (
        <p className="muted">
          Nothing to rate on {row.id}: control cards carry no expected action for the players.
        </p>
      )}
      {mine.map((c) => (
        <CriterionCard
          key={`${c.rowId}-${c.id}`}
          projectPath={props.projectPath}
          scenarioId={props.scenario.id}
          criterion={c}
          existing={byId.get(observationId(c.rowId, c.id))}
          exerciseTime={props.exerciseTime}
          evaluator={evaluator}
        />
      ))}
      <LiveObservations projectPath={props.projectPath} scenarioId={props.scenario.id} />
    </div>
  )
}
