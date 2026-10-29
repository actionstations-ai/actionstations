// Review and edit a micro-drill (#437, FR-5, FR-6): every field is editable, the build checks are
// listed, and only a Ready drill can be run. Hints are written once, here and at build time;
// the model writes none while a drill is running.
import { useState } from 'react'
import type { MicroDrill, MicroDrillStep } from '@shared/schemas'
import { Badge, Button, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

type Update = (fn: (d: MicroDrill) => MicroDrill) => void

const where = (c: { headingPath: string; page?: number | undefined }): string =>
  c.page ? `${c.headingPath}, page ${c.page}` : c.headingPath

function Area(props: {
  label: string
  value: string
  max: number
  rows?: number
  hint?: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={props.label} {...(props.hint ? { hint: props.hint } : {})}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          className="textarea"
          aria-describedby={describedBy}
          rows={props.rows ?? 2}
          maxLength={props.max}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

function StepEditor(props: {
  step: MicroDrillStep
  n: number
  update: (s: MicroDrillStep) => void
}) {
  const { step, n, update } = props
  const [h1, h2, h3] = step.hints
  return (
    <fieldset className="card stack micro-step">
      <legend className="micro-step__legend">Question {n}</legend>
      <Area
        label={`Question ${n}`}
        value={step.prompt}
        max={1200}
        rows={3}
        onChange={(v) => update({ ...step, prompt: v })}
      />
      <div>
        <h3 className="micro-h4">Expected points</h3>
        <ul className="micro-points">
          {step.expectedPoints.map((p, i) => (
            <li key={p.id}>
              <Area
                label={`Expected point ${i + 1} of question ${n}`}
                value={p.text}
                max={300}
                onChange={(v) =>
                  update({
                    ...step,
                    expectedPoints: step.expectedPoints.map((q) =>
                      q.id === p.id ? { ...q, text: v } : q,
                    ),
                  })
                }
              />
              <span className="muted">Source: {where(p.citation)}</span>
            </li>
          ))}
        </ul>
      </div>
      <Area
        label={`Level 1 hint for question ${n}`}
        hint="Points to the kind of thing to consider without naming the answer."
        value={h1.text}
        max={300}
        onChange={(v) => update({ ...step, hints: [{ ...h1, text: v }, h2, h3] })}
      />
      <Area
        label={`Level 2 hint for question ${n}`}
        hint={`Points to the plan section: ${where(h2.citation)}.`}
        value={h2.text}
        max={300}
        onChange={(v) => update({ ...step, hints: [h1, { ...h2, text: v }, h3] })}
      />
      <Area
        label={`Level 3 hint for question ${n}`}
        hint="Says what the plan requires."
        value={h3.text}
        max={600}
        onChange={(v) => update({ ...step, hints: [h1, h2, { ...h3, text: v }] })}
      />
      <Area
        label={`Level 3 quote from the plan for question ${n}`}
        hint={`Must appear word for word in ${where(h3.citation)}.`}
        value={h3.quote}
        max={600}
        onChange={(v) => update({ ...step, hints: [h1, h2, { ...h3, quote: v }] })}
      />
      <Area
        label={`Model answer for question ${n}`}
        value={step.modelAnswer}
        max={1200}
        rows={3}
        onChange={(v) => update({ ...step, modelAnswer: v })}
      />
    </fieldset>
  )
}

function Problems({ drill }: { drill: MicroDrill }) {
  if (!drill.lint.length)
    return <p className="muted">The checks found no problems the last time this drill was saved.</p>
  return (
    <div className="micro-problems" role="region" aria-labelledby="micro-problems-title">
      <h2 id="micro-problems-title" className="micro-h4">
        {drill.lint.length} {drill.lint.length === 1 ? 'problem' : 'problems'} to fix
      </h2>
      <ul>
        {drill.lint.map((i, k) => (
          <li key={`${i.code}-${k}`}>{i.message}</li>
        ))}
      </ul>
    </div>
  )
}

function Editor(props: { projectPath: string; initial: MicroDrill; onClose: () => void }) {
  const [drill, setDrill] = useState(props.initial)
  const [busy, setBusy] = useState(false)
  const update: Update = (fn) => setDrill((d) => fn(d))
  const save = async (status: MicroDrill['status']) => {
    setBusy(true)
    try {
      const saved = await call('microdrills:save', {
        projectPath: props.projectPath,
        drill: { ...drill, status },
      })
      setDrill(saved)
      toast.success(
        status === 'ready' ? 'Drill is Ready' : 'Saved',
        saved.lint.length
          ? `${saved.lint.length} problem(s) remain.`
          : 'The checks found no problems.',
      )
    } catch (e) {
      toast.error('Could not save', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page micro-page">
      <PageHeader
        eyebrow="Micro-drill"
        title={drill.title}
        description={`${drill.annex.documentTitle} › ${drill.annex.headingPath}`}
        actions={
          <Badge tone={drill.status === 'ready' ? 'ok' : 'neutral'}>
            {drill.status === 'ready' ? 'Ready' : 'Draft'}
          </Badge>
        }
      />
      <Problems drill={drill} />
      <Field label="Title">
        {({ id }) => (
          <input
            id={id}
            className="input"
            maxLength={120}
            value={drill.title}
            onChange={(e) => update((d) => ({ ...d, title: e.target.value }))}
          />
        )}
      </Field>
      <Area
        label="Situation"
        value={drill.situation}
        max={1500}
        rows={4}
        onChange={(v) => update((d) => ({ ...d, situation: v }))}
      />
      {drill.objectives.map((o, i) => (
        <Area
          key={o.id}
          label={`Objective ${i + 1}`}
          value={o.text}
          max={300}
          onChange={(v) =>
            update((d) => ({
              ...d,
              objectives: d.objectives.map((x) => (x.id === o.id ? { ...x, text: v } : x)),
            }))
          }
        />
      ))}
      <h2 className="section-title">Questions</h2>
      {drill.steps.map((s, i) => (
        <StepEditor
          key={s.id}
          step={s}
          n={i + 1}
          update={(next) =>
            update((d) => ({ ...d, steps: d.steps.map((x) => (x.id === s.id ? next : x)) }))
          }
        />
      ))}
      {drill.lint.length > 0 && (
        <label className="micro-override">
          <input
            type="checkbox"
            checked={drill.lintOverridden}
            onChange={(e) => update((d) => ({ ...d, lintOverridden: e.target.checked }))}
          />{' '}
          Mark Ready even though the problems above remain
        </label>
      )}
      <div className="row micro-actions">
        <Button disabled={busy} onClick={() => void save('draft')}>
          Save as draft and check
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void save('ready')}>
          Mark Ready
        </Button>
        <Button onClick={props.onClose}>Back to the drills</Button>
      </div>
    </div>
  )
}

export function MicroDrillEditor(props: {
  projectPath: string
  drillId: string
  onClose: () => void
}) {
  const q = useIpcQuery('microdrills:get', { projectPath: props.projectPath, id: props.drillId })
  if (q.isPending) return <p className="muted page">Loading the drill…</p>
  if (!q.data) return <p className="page">That drill could not be opened.</p>
  return <Editor projectPath={props.projectPath} initial={q.data} onClose={props.onClose} />
}
