// Capability rating cards of the AAR/IP (#419, FR-5): per exercised Core Capability the
// model's proposed rating with its rationale, the observation counts, and the rating a person
// confirms as a labelled radio group. The document prints only confirmed ratings. Each card
// lists the capability's strengths and areas for improvement with a lock and an Evidence
// button that opens the evidence drawer.
import { Lock } from 'lucide-react'
import { useId } from 'react'
import { capabilityName } from '@shared/core-capabilities'
import {
  CAPABILITY_RATING_DEFINITIONS,
  CAPABILITY_RATING_LABELS,
  CAPABILITY_RATINGS,
  type Aar,
  type CapabilityAnalysis,
  type CapabilityRating,
  type Finding,
} from '@shared/schemas/aar'
import { RATING_LABELS, RATINGS } from '@shared/schemas/evaluation'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, Button } from '../../../components/ui'

export interface SelectedFinding {
  capability: CapabilityAnalysis['capability']
  kind: 'strength' | 'improvement'
  finding: Finding
}

export interface CapabilityRatingsProps {
  aar: Aar
  scenario: Scenario
  onChange: (fn: (a: Aar) => Aar) => void
  onEvidence: (selected: SelectedFinding) => void
}

/** Objectives the capability is mapped to, by name. */
function objectiveNames(s: Scenario, c: CapabilityAnalysis): string[] {
  const ids = c.objectiveRefs.length
    ? c.objectiveRefs
    : (s.evaluation?.objectiveCapabilities ?? [])
        .filter((p) => p.capability === c.capability)
        .map((p) => p.objectiveId)
  return ids.map((id) => {
    const o = s.objectives.find((x) => x.id === id)
    return o ? o.name || o.text : id
  })
}

function Counts({ c }: { c: CapabilityAnalysis }) {
  const total = RATINGS.reduce((n, r) => n + c.observationCounts[r], 0)
  if (!total) return <span className="muted">No observations</span>
  return (
    <span className="fac-counts" aria-label="Observation counts">
      {RATINGS.filter((r) => c.observationCounts[r] > 0).map((r) => (
        <span key={r} className="fac-counts__item" data-rating={r}>
          {RATING_LABELS[r]} {c.observationCounts[r]}
        </span>
      ))}
    </span>
  )
}

function RatingGroup(props: {
  c: CapabilityAnalysis
  onRating: (rating: CapabilityRating | undefined) => void
}) {
  const id = useId()
  const name = capabilityName(props.c.capability)
  return (
    <fieldset className="aar-rating">
      <legend className="field__label">Confirmed rating for {name}</legend>
      <label className="fac-rating__option">
        <input
          type="radio"
          name={id}
          value=""
          checked={!props.c.rating}
          onChange={() => props.onRating(undefined)}
        />
        Not confirmed
      </label>
      {CAPABILITY_RATINGS.map((r) => (
        <label key={r} className="fac-rating__option" title={CAPABILITY_RATING_LABELS[r]}>
          <input
            type="radio"
            name={id}
            value={r}
            checked={props.c.rating === r}
            onChange={() => props.onRating(r)}
          />
          {r}
          <span className="sr-only"> {CAPABILITY_RATING_LABELS[r]}</span>
        </label>
      ))}
    </fieldset>
  )
}

function FindingLine(props: {
  selected: SelectedFinding
  onLock: (locked: boolean) => void
  onEvidence: () => void
}) {
  const { finding: f, kind } = props.selected
  const n = f.evidence.length
  return (
    <li className="aar-finding">
      <span className="aar-finding__title">
        <Badge tone={kind === 'strength' ? 'ok' : 'warn'}>
          {kind === 'strength' ? 'Strength' : 'Improve'}
        </Badge>{' '}
        {f.title}
      </span>
      <span className="aar-finding__actions">
        <label className="check" title="Keep this finding on a re-draft">
          <input
            type="checkbox"
            checked={f.locked}
            onChange={(e) => props.onLock(e.target.checked)}
          />
          <Lock size={12} aria-hidden /> Keep
        </label>
        <Button size="sm" onClick={props.onEvidence} aria-label={`Evidence for ${f.title}`}>
          Evidence ({n})
        </Button>
      </span>
    </li>
  )
}

function updateCapability(
  aar: Aar,
  capability: string,
  fn: (c: CapabilityAnalysis) => CapabilityAnalysis,
): Aar {
  return {
    ...aar,
    capabilities: aar.capabilities.map((c) => (c.capability === capability ? fn(c) : c)),
  }
}

function setLock(c: CapabilityAnalysis, id: string, locked: boolean): CapabilityAnalysis {
  const lock = (list: Finding[]) => list.map((f) => (f.id === id ? { ...f, locked } : f))
  return {
    ...c,
    strengths: lock(c.strengths),
    areasForImprovement: lock(c.areasForImprovement),
  }
}

function CapabilityCard(props: CapabilityRatingsProps & { c: CapabilityAnalysis }) {
  const { c } = props
  const name = capabilityName(c.capability)
  const change = (fn: (x: CapabilityAnalysis) => CapabilityAnalysis) =>
    props.onChange((a) => updateCapability(a, c.capability, fn))
  const findings: SelectedFinding[] = [
    ...c.strengths.map((f) => ({
      capability: c.capability,
      kind: 'strength' as const,
      finding: f,
    })),
    ...c.areasForImprovement.map((f) => ({
      capability: c.capability,
      kind: 'improvement' as const,
      finding: f,
    })),
  ]
  const objectives = objectiveNames(props.scenario, c)
  return (
    <article className="card aar-capability" aria-label={name}>
      <h3 className="aar-capability__title">
        {name}
        {c.rating ? (
          <Badge tone="ok">{CAPABILITY_RATING_LABELS[c.rating]}</Badge>
        ) : (
          <Badge tone="warn">Rating pending</Badge>
        )}
      </h3>
      {objectives.length > 0 && <p className="muted">Objectives: {objectives.join('; ')}</p>}
      <p className="aar-capability__proposed">
        <strong>Proposed:</strong>{' '}
        {c.proposedRating
          ? `${CAPABILITY_RATING_LABELS[c.proposedRating]} (${c.proposedRating})`
          : 'no rating (not enough evidence)'}
        {c.ratingRationale && <span className="muted"> — {c.ratingRationale}</span>}
      </p>
      <Counts c={c} />
      <RatingGroup c={c} onRating={(rating) => change((x) => ({ ...x, rating }))} />
      {findings.length > 0 && (
        <ul className="aar-findings" aria-label={`Findings for ${name}`}>
          {findings.map((sel) => (
            <FindingLine
              key={sel.finding.id}
              selected={sel}
              onLock={(locked) => change((x) => setLock(x, sel.finding.id, locked))}
              onEvidence={() => props.onEvidence(sel)}
            />
          ))}
        </ul>
      )}
    </article>
  )
}

export function CapabilityRatings(props: CapabilityRatingsProps) {
  const pending = props.aar.capabilities.filter((c) => !c.rating).length
  const total = props.aar.capabilities.length
  return (
    <section className="aar-ratings" aria-labelledby="aar-ratings-title">
      <header className="part__head">
        <h2 id="aar-ratings-title" className="section-title">
          Capability ratings
        </h2>
        <Badge tone={pending ? 'warn' : 'ok'}>
          {pending ? `Ratings pending: ${pending} of ${total}` : 'All ratings confirmed'}
        </Badge>
      </header>
      <p className="muted part__hint">
        The draft proposes a rating per capability from the observations and notes. Confirm or
        change it here; the document prints only confirmed ratings.
      </p>
      <details className="aar-definitions">
        <summary>HSEEP rating definitions</summary>
        <dl>
          {CAPABILITY_RATINGS.map((r) => (
            <div key={r}>
              <dt>
                {CAPABILITY_RATING_LABELS[r]} ({r})
              </dt>
              <dd>{CAPABILITY_RATING_DEFINITIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </details>
      {!total && <p className="muted">No capabilities were analysed in this draft.</p>}
      {props.aar.capabilities.map((c) => (
        <CapabilityCard key={c.capability} {...props} c={c} />
      ))}
    </section>
  )
}
