import { useState, type FormEvent } from 'react'
import { FastForward, Pause, Play, RotateCcw } from 'lucide-react'
import { exerciseMinutes } from '@shared/schemas/common'
import type { MselRow } from '@shared/schemas/scenario'
import { Button } from '../../components/ui'
import { RATES, formatClock, parseClockInput, parseRate, scenarioWallClock } from './clock'

export interface ExerciseClockProps {
  minutes: number
  running: boolean
  now: Date
  startWallClock: string | undefined
  dueCount: number
  nextJump: MselRow | undefined
  /** Clock speed, 1 = real time. */
  rate: number
  onToggle: () => void
  onReset: () => void
  onSet: (minutes: number) => void
  onNudge: (deltaMin: number) => void
  onRate: (rate: number) => void
  onJump: (minutes: number) => void
}

const NUDGES = [-5, -1, 1, 5, 15] as const
const NUDGE_KEYS: Partial<Record<number, string>> = {
  [-5]: 'Shift+[',
  [-1]: '[',
  1: ']',
  5: 'Shift+]',
}
const rateLabel = (r: number) => `${r}×`

const localTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function SetTimeForm(p: { onSet: (minutes: number) => void; onRate: (rate: number) => void }) {
  const [text, setText] = useState('')
  const [rateText, setRateText] = useState('')
  const [error, setError] = useState<string>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const minutes = text.trim() ? parseClockInput(text) : undefined
    const rate = rateText.trim() ? parseRate(rateText) : undefined
    if (text.trim() && minutes === undefined) return setError('Use H:MM, e.g. 1:15')
    if (rateText.trim() && rate === undefined) return setError('Rate is 0.25 to 60, e.g. 30')
    if (minutes === undefined && rate === undefined) return setError('Enter a time or a rate')
    setError(undefined)
    setText('')
    setRateText('')
    if (rate !== undefined) p.onRate(rate)
    if (minutes !== undefined) p.onSet(minutes)
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
      <label className="sr-only" htmlFor="fac-set-rate">
        Rate (0.25 to 60)
      </label>
      <input
        id="fac-set-rate"
        className="input fac-clock__input"
        placeholder="Rate ×"
        value={rateText}
        aria-invalid={!!error}
        aria-describedby={error ? 'fac-set-time-err' : undefined}
        onChange={(e) => setRateText(e.target.value)}
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
        <span className="fac-clock__label">
          {p.running ? 'Running' : 'Paused'}
          {p.rate !== 1 && ` at ${rateLabel(p.rate)}`}
        </span>
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
          onClick={() => p.nextJump && p.onJump(exerciseMinutes(p.nextJump.time))}
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
        <div className="fac-clock__nudges" role="group" aria-label="Move the clock">
          {NUDGES.map((d) => (
            <Button
              key={d}
              size="sm"
              onClick={() => p.onNudge(d)}
              aria-label={`${d < 0 ? 'Back' : 'Forward'} ${Math.abs(d)} minute${Math.abs(d) === 1 ? '' : 's'}`}
              aria-keyshortcuts={NUDGE_KEYS[d]}
            >
              {d > 0 ? `+${d}` : `−${-d}`}
            </Button>
          ))}
        </div>
        <div className="fac-clock__rate">
          <label className="fac-clock__label" htmlFor="fac-rate">
            Rate
          </label>
          <select
            id="fac-rate"
            className="select"
            value={String(p.rate)}
            onChange={(e) => p.onRate(Number(e.target.value))}
          >
            {[...new Set<number>([...RATES, p.rate])]
              .sort((a, b) => a - b)
              .map((r) => (
                <option key={r} value={String(r)}>
                  {rateLabel(r)}
                </option>
              ))}
          </select>
        </div>
        <SetTimeForm onSet={p.onSet} onRate={p.onRate} />
      </div>
    </section>
  )
}
