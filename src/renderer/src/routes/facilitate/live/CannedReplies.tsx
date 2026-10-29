// The SimCell script for the chosen persona, as one-tap inserts into the composer (spec 0413
// FR-5). Nothing is sent from here.
import type { SimcellScript } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'

export function CannedReplies({
  script,
  onInsert,
}: {
  script: SimcellScript | undefined
  onInsert: (text: string) => void
}) {
  if (!script || (script.hardQuestions.length === 0 && script.concessions.length === 0)) return null
  const row = (kind: string, text: string, i: number) => (
    <li key={`${kind}-${i}`} className="fac-msg__canned-row">
      <span>
        <strong>{kind}:</strong> {text}
      </span>
      <Button size="sm" onClick={() => onInsert(text)} aria-label={`Insert ${kind}: ${text}`}>
        Insert
      </Button>
    </li>
  )
  return (
    <section className="fac-msg__canned" aria-label={`Script for ${script.rolePlayed}`}>
      <h4>Script: {script.rolePlayed}</h4>
      {script.trigger && <p className="fac-hint">{script.trigger}</p>}
      <ul>
        {script.hardQuestions.map((q, i) => row('Question', q, i))}
        {script.concessions.map((c, i) => row('Concession', c, i))}
      </ul>
    </section>
  )
}
