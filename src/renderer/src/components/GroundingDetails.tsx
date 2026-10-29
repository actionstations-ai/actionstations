// Source-check details (#423, FR-5/FR-7/FR-8): why an item has its label (each claim, its best
// plan passage, the terms found and not found, a passage that says something different), what
// the model said when it was asked, and the actions: Verify with model, Mark grounded, Mark
// unsupported, Clear my label. Reasons and quotes are rendered as text, never HTML.
import { useState } from 'react'
import type { ClaimEvidence, GroundingResult } from '@shared/schemas/grounding'
import { call } from '../lib/api'
import { LABEL_TEXT, type ShownLabel } from '../lib/grounding'
import { queryClient } from '../lib/query'
import { trackJob } from '../state/jobs'
import { GroundingBadge } from './GroundingBadge'
import { toast } from './toast-store'
import { Button, Dialog, Field } from './ui'
import './grounding.css'

const labelWord = (l: GroundingResult['label']): string =>
  l === 'none' ? 'No plan claim' : LABEL_TEXT[l as ShownLabel]

function Claim({ c, n }: { c: ClaimEvidence; n: number }) {
  return (
    <li className="grounding-details__claim">
      <h4>Claim {n}</h4>
      <p>{c.text}</p>
      <p className="muted grounding-details__terms">
        {c.headingPath ? `Closest passage: ${c.headingPath}. ` : 'No cited passage. '}
        {Math.round(c.overlap * 100)}% of its words are in the cited passages
        {c.similarity !== undefined
          ? `; meaning similarity ${Math.round(c.similarity * 100)}%`
          : ''}
        .
      </p>
      {c.matched.length > 0 && (
        <p className="grounding-details__terms">Found: {c.matched.join(', ')}</p>
      )}
      {c.missing.length > 0 && (
        <p className="grounding-details__terms">Not found: {c.missing.join(', ')}</p>
      )}
      {c.conflicting.map((k, i) => (
        <blockquote key={i} className="grounding-details__quote">
          The plan says something different from “{k.term}”: “{k.passage}”
        </blockquote>
      ))}
    </li>
  )
}

function Layers({ r }: { r: GroundingResult }) {
  return (
    <ul className="grounding-details__layers" aria-label="How this label was set">
      <li>
        <GroundingBadge result={r} />
      </li>
      <li>Automatic check: {labelWord(r.label)}</li>
      {r.model && (
        <li>
          Model ({r.model.model || r.model.providerId}): {labelWord(r.model.label)}
          {r.model.discarded > 0 &&
            `; ${r.model.discarded} answer${r.model.discarded > 1 ? 's' : ''} without a quote from the passage ignored`}
        </li>
      )}
      {r.override && (
        <li>
          Your label: {labelWord(r.override.label)}
          {r.override.note ? ` (${r.override.note})` : ''}
        </li>
      )}
    </ul>
  )
}

function ModelQuotes({ r }: { r: GroundingResult }) {
  if (!r.model?.quotes.length) return null
  return (
    <section aria-label="What the model quoted">
      <h3>What the model quoted</h3>
      {r.model.quotes.map((q, i) => (
        <blockquote key={i} className="grounding-details__quote">
          <span className="muted">{q.claim}: </span>“{q.quote}”
        </blockquote>
      ))}
    </section>
  )
}

function useActions(props: DetailsProps, note: string) {
  const [busy, setBusy] = useState(false)
  const req = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['grounding:scenario'] })
    void queryClient.invalidateQueries({ queryKey: ['scenarios:lint'] })
  }
  const override = async (label?: 'grounded' | 'unsupported') => {
    setBusy(true)
    try {
      await call('grounding:override', {
        ...req,
        itemKey: props.itemKey,
        ...(label ? { label } : {}),
        ...(label && note.trim() ? { note: note.trim() } : {}),
      })
      refresh()
      toast.success(label ? `Marked ${LABEL_TEXT[label].toLowerCase()}` : 'Your label was cleared')
    } catch (e) {
      toast.error('Could not change the label', e)
    } finally {
      setBusy(false)
    }
  }
  const verify = async () => {
    setBusy(true)
    try {
      const { jobId } = await call('grounding:verify', { ...req, itemKeys: [props.itemKey] })
      trackJob(jobId, { kind: 'grounding-verify', ...req })
      toast.info('Asking the model', 'The label updates when the check finishes.')
    } catch (e) {
      toast.error('Could not start the check', e)
    } finally {
      setBusy(false)
    }
  }
  return { busy, override, verify }
}

interface DetailsProps {
  projectPath: string
  scenarioId: string
  itemKey: string
  /** "Row I-07", "Inject I-07 controller note". */
  title: string
  result: GroundingResult | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GroundingDetails(props: DetailsProps) {
  const [note, setNote] = useState('')
  const a = useActions(props, note)
  const r = props.result
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`Source check: ${props.title}`}
      description="Whether the plan passages this item cites say what it claims."
      footer={<Button onClick={() => props.onOpenChange(false)}>Close</Button>}
    >
      {!r ? (
        <p className="muted">Checking…</p>
      ) : (
        <div className="grounding-details">
          <Layers r={r} />
          <p>{r.reason}</p>
          {r.claims.length > 0 && (
            <ol className="grounding-details__claims" aria-label="Claims">
              {r.claims.map((c, i) => (
                <Claim key={i} c={c} n={i + 1} />
              ))}
            </ol>
          )}
          <ModelQuotes r={r} />
          {r.label !== 'none' && (
            <div className="grounding-details__actions">
              <Button onClick={() => void a.verify()} disabled={a.busy}>
                Verify with model
              </Button>
              <Field label="Note (optional)" hint="Saved with your label.">
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    className="input"
                    value={note}
                    maxLength={1000}
                    aria-describedby={describedBy}
                    onChange={(e) => setNote(e.target.value)}
                  />
                )}
              </Field>
              <Button onClick={() => void a.override('grounded')} disabled={a.busy}>
                Mark grounded
              </Button>
              <Button onClick={() => void a.override('unsupported')} disabled={a.busy}>
                Mark unsupported
              </Button>
              {r.override && (
                <Button variant="ghost" onClick={() => void a.override()} disabled={a.busy}>
                  Clear my label
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
