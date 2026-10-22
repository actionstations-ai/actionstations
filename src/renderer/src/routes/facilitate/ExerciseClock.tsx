import { useState, type FormEvent } from 'react'
import { FastForward, Pause, Play, RotateCcw } from 'lucide-react'
import { exerciseMinutes } from '@shared/schemas/common'
import type { MselRow } from '@shared/schemas/scenario'
import { Button } from '../../components/ui'
import { formatClock, parseClockInput, scenarioWallClock } from './clock'

export interface ExerciseClockProps {
  minutes: number
  running: boolean
  now: Date
  startWallClock: string | undefined
  dueCount: number
  nextJump: MselRow | undefined
  onToggle: () => void
  onReset: () => void
  onSet: (minutes: number) => void
}

const localTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function SetTimeForm({ onSet }: { onSet: (minutes: number) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const minutes = parseClockInput(text)
    if (minutes === undefined) return setError('Use H:MM, e.g. 1:15')
    setError(undefined)
    setText('')
    onSet(minutes)
  }
  return (
    <form className="fac-clock__set" onSubmit={submit} aria-label="Set exercise time">
      <label className="sr-only" htmlFor="fac-set-time">
        Exercise time (H:MM)
      </label>
      <input
        id="fac-set-time"
        className="input fac-clock__input"
        placeholder="H:MM"
        value={text}
        aria-invalid={!!error}
        aria-describedby={error ? 'fac-set-time-err' : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      <Button type="submit" size="sm">
        Set time
      </Button>
      {error && (
        <span id="fac-set-time-err" className="field__error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}

export function ExerciseClock(p: ExerciseClockProps) {
  const narrative = scenarioWallClock(p.startWallClock, p.minutes)
  return (
    <section className="fac-clock" aria-label="Exercise clock">
      <div className="fac-clock__time">
        <span className="fac-clock__label">{p.running ? 'Running' : 'Paused'}</span>
        <span className="fac-clock__value mono" role="timer" aria-label="Exercise time">
          {formatClock(p.minutes)}
        </span>
        <span className="fac-clock__meta">
          {narrative && <>Scenario time {narrative} · </>}
          Local time {localTime(p.now)}
          {' · '}
          <strong>{p.dueCount}</strong> due
        </span>
      </div>
      <div className="fac-clock__controls">
        <Button variant="primary" onClick={p.onToggle} aria-keyshortcuts="Space">
          {p.running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          {p.running ? 'Pause' : p.minutes > 0 ? 'Resume' : 'Start'}
        </Button>
        <Button onClick={p.onReset} disabled={!p.running && p.minutes === 0}>
          <RotateCcw size={16} aria-hidden /> Reset
        </Button>
        <Button
          onClick={() => p.nextJump && p.onSet(exerciseMinutes(p.nextJump.time))}
          disabled={!p.nextJump}
          title={
            p.nextJump
              ? `Advance the clock to ${p.nextJump.id} (${p.nextJump.time})`
              : 'No time jump ahead'
          }
        >
          <FastForward size={16} aria-hidden />
          {p.nextJump ? `Time jump to ${p.nextJump.time}` : 'Time jump'}
        </Button>
        <SetTimeForm onSet={p.onSet} />
      </div>
    </section>
  )
}
