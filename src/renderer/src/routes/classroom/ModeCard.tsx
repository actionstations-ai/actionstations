// The Classroom switch (#718, ADR-0090): off by default, turned on only after the instructor
// reads the notice that scores name students.
import { useState } from 'react'
import type { ClassroomState } from '@shared/ipc/classroom'
import { Badge, Button } from '../../components/ui'
import { call, change } from './use-classroom'

export function ModeCard(props: { projectPath: string; state: ClassroomState }) {
  const { projectPath, state } = props
  const [understood, setUnderstood] = useState(false)
  const set = (enabled: boolean) =>
    change('Could not change Classroom mode', () =>
      call('classroom:set-enabled', { projectPath, enabled }),
    )
  return (
    <section className="card stack" aria-labelledby="classroom-mode-title">
      <h2 id="classroom-mode-title" className="section-title">
        Classroom mode{' '}
        <Badge tone={state.enabled ? 'ok' : 'neutral'}>{state.enabled ? 'On' : 'Off'}</Badge>
      </h2>
      <p>{state.notice}</p>
      {state.enabled ? (
        <div className="row">
          <Button onClick={() => void set(false)}>Turn off</Button>
          <span className="muted">Turning it off keeps the records in this project folder.</span>
        </div>
      ) : (
        <>
          <label className="row">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            I have read this notice
          </label>
          <div className="row">
            <Button variant="primary" disabled={!understood} onClick={() => void set(true)}>
              Turn on Classroom mode
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
