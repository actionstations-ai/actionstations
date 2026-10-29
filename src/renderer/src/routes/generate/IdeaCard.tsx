import type { ScenarioIdea } from '@shared/schemas/scenario'
import type { DomainProfile } from '@shared/domains'
import { ideaFamily, threatLabel } from '../../lib/domains'
import { Badge, Button } from '../../components/ui'
import { CitationChips } from '../scenarios/CitationChips'
import { GroundingBadge } from '../../components/GroundingBadge'
import type { GroundingResult } from '@shared/schemas/grounding'
import type { PlanFinding } from '@shared/schemas/plan-conflicts'
import { seamTitle } from '@shared/seams'

const DIFFICULTY_TONE = { introductory: 'ok', intermediate: 'info', advanced: 'warn' } as const

export function IdeaCard({
  idea,
  onDevelop,
  profile,
  grounding,
  findings = [],
}: {
  idea: ScenarioIdea
  onDevelop: () => void
  profile?: DomainProfile
  /** Source check of "Why it teaches" against the sections exercised (#423). */
  grounding?: GroundingResult | undefined
  /** The plan check's findings, to name the seams the idea tests (#427). */
  findings?: PlanFinding[]
}) {
  const headingId = `idea-${idea.id}`
  const byId = new Map(findings.map((f) => [f.id, f]))
  const tests = (idea.seamIds ?? []).flatMap((id) => {
    const f = byId.get(id)
    return f ? [seamTitle(f)] : []
  })
  const family = idea.threatFamily ?? (profile ? ideaFamily(idea, profile) : undefined)
  return (
    <li className="card idea-card" aria-labelledby={headingId}>
      <div className="idea-card__top">
        <h3 id={headingId}>{idea.title}</h3>
        <Badge tone={DIFFICULTY_TONE[idea.difficulty]}>{idea.difficulty}</Badge>
      </div>
      <p>{idea.hook}</p>
      <dl className="idea-card__facts">
        {family && (
          <div>
            <dt>Threat family</dt>
            <dd>{threatLabel(family)}</dd>
          </div>
        )}
        {idea.threat && (
          <div>
            <dt>Threat</dt>
            <dd>{idea.threat}</dd>
          </div>
        )}
        {idea.systemsAffected.length > 0 && (
          <div>
            <dt>Systems</dt>
            <dd>{idea.systemsAffected.join(', ')}</dd>
          </div>
        )}
        {idea.whyItTeaches && (
          <div>
            <dt>Why it teaches</dt>
            <dd>
              {idea.whyItTeaches} <GroundingBadge result={grounding} />
            </dd>
          </div>
        )}
        {tests.length > 0 && (
          <div>
            <dt>Tests</dt>
            <dd>
              {tests.length === 1 ? (
                tests[0]
              ) : (
                <ul className="idea-card__seams">
                  {tests.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        )}
        {idea.suggestedRoles.length > 0 && (
          <div>
            <dt>Suggested roles</dt>
            <dd>{idea.suggestedRoles.join(', ')}</dd>
          </div>
        )}
      </dl>
      {idea.sectionsExercised.length > 0 && (
        <div className="stack idea-card__sections">
          <span className="field__label">Sections exercised</span>
          <CitationChips citations={idea.sectionsExercised} />
        </div>
      )}
      <div className="idea-card__footer">
        <Button
          variant="primary"
          size="sm"
          onClick={onDevelop}
          aria-label={`Develop ${idea.title}`}
        >
          Develop this
        </Button>
      </div>
    </li>
  )
}
