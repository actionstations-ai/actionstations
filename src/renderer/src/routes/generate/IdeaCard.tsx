import type { ScenarioIdea } from '@shared/schemas/scenario'
import { Badge, Button } from '../../components/ui'
import { CitationChips } from '../scenarios/CitationChips'

const DIFFICULTY_TONE = { introductory: 'ok', intermediate: 'info', advanced: 'warn' } as const

export function IdeaCard({ idea, onDevelop }: { idea: ScenarioIdea; onDevelop: () => void }) {
  const headingId = `idea-${idea.id}`
  return (
    <li className="card idea-card" aria-labelledby={headingId}>
      <div className="idea-card__top">
        <h3 id={headingId}>{idea.title}</h3>
        <Badge tone={DIFFICULTY_TONE[idea.difficulty]}>{idea.difficulty}</Badge>
      </div>
      <p>{idea.hook}</p>
      <dl className="idea-card__facts">
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
            <dd>{idea.whyItTeaches}</dd>
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
