// Record hot wash (#425): one control above the timeline. Before each recording a dialog
// asks the facilitator to confirm that everyone present was told. While it runs, the state is
// written out ("Recording", "Paused"), not shown by colour alone, the window title starts
// with "● Recording", and every change is announced through the page's status line.
import { useEffect, useId, useRef, useState } from 'react'
import { Mic, Pause, Play, Square } from 'lucide-react'
import { Button, Dialog } from '../../components/ui'
import {
  LEVEL_TEXT,
  LOW_DISK_BYTES,
  formatBytes,
  formatDuration,
  levelBars,
} from './recorder-model'
import type { Recorder, RecorderPhase } from './use-recorder'

function LevelMeter({ rms, level }: { rms: number; level: keyof typeof LEVEL_TEXT }) {
  const lit = levelBars(rms)
  return (
    <span className="fac-recorder__level">
      <span className="fac-recorder__bars" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="fac-recorder__bar" data-lit={i <= lit ? 'on' : 'off'} />
        ))}
      </span>
      <span>Input level: {LEVEL_TEXT[level]}</span>
    </span>
  )
}

function ConsentDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart: (title: string) => void
  keepAudio: boolean
}) {
  const [told, setTold] = useState(false)
  const [title, setTitle] = useState('Hot wash')
  const titleId = useId()
  const toldId = useId()
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Record the hot wash"
      description="The recording and its transcript stay in this project on this computer. Nothing is uploaded."
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!told} onClick={() => props.onStart(title.trim())}>
            <Mic size={14} aria-hidden /> Start recording
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor={titleId}>
          Recording title
        </label>
        <input
          id={titleId}
          className="input"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <label className="row" htmlFor={toldId}>
        <input
          id={toldId}
          type="checkbox"
          checked={told}
          onChange={(e) => setTold(e.target.checked)}
        />{' '}
        Everyone present has been told that this discussion is being recorded.
      </label>
      <p className="muted">
        {props.keepAudio
          ? 'The audio is kept after the transcript is saved (project setting).'
          : 'The audio is deleted once its transcript is saved. You can change this under Recordings.'}
      </p>
    </Dialog>
  )
}

export function RecorderControls(props: {
  recorder: Recorder
  freeBytes?: number | undefined
  keepAudio: boolean
  shortcutsOn: boolean
  consentOpen: boolean
  onConsentOpenChange: (open: boolean) => void
  onAnnounce: (text: string) => void
}) {
  const { recorder, onAnnounce } = props
  const { state } = recorder
  const active = state.phase === 'recording' || state.phase === 'paused'
  const lowDisk = props.freeBytes !== undefined && props.freeBytes < LOW_DISK_BYTES
  const { phase, recording } = state
  const announced = useRef(phase)

  useEffect(() => {
    if (announced.current === phase) return
    announced.current = phase
    const text: Partial<Record<RecorderPhase, string>> = {
      recording: 'Recording the hot wash',
      paused: 'Recording paused',
      idle: recording ? 'Recording stopped and saved' : '',
    }
    if (text[phase]) onAnnounce(text[phase]!)
  }, [phase, recording, onAnnounce])

  useEffect(() => {
    if (!active) return
    const before = document.title
    document.title = `● ${state.phase === 'paused' ? 'Paused' : 'Recording'} — ${before}`
    return () => {
      document.title = before
    }
  }, [active, state.phase])

  const keys = props.shortcutsOn
  return (
    <section className="fac-recorder" aria-label="Hot wash recording" data-state={state.phase}>
      {!active && (
        <div className="fac-recorder__row">
          <Button
            onClick={() => props.onConsentOpenChange(true)}
            disabled={state.phase === 'starting' || state.phase === 'stopping'}
            aria-keyshortcuts={keys ? 'R' : undefined}
          >
            <Mic size={14} aria-hidden />{' '}
            {state.phase === 'starting'
              ? 'Starting…'
              : state.phase === 'stopping'
                ? 'Saving…'
                : 'Record hot wash'}
            {keys && <kbd className="fac-recorder__kbd">R</kbd>}
          </Button>
          <span className="muted">
            Recorded and transcribed on this computer.
            {props.freeBytes !== undefined && ` Free space: ${formatBytes(props.freeBytes)}.`}
          </span>
        </div>
      )}
      {active && (
        <div className="fac-recorder__row">
          <p className="fac-recorder__state">
            <span className="fac-recorder__dot" aria-hidden />
            <strong>{state.phase === 'paused' ? 'Paused' : 'Recording'}</strong>
          </p>
          <span role="timer" aria-label="Recording time" className="mono">
            {formatDuration(state.elapsedSec)}
          </span>
          {state.device && <span className="muted">Microphone: {state.device}</span>}
          {state.phase === 'recording' && <LevelMeter rms={state.rms} level={state.level} />}
          {state.phase === 'recording' ? (
            <Button
              onClick={() => void recorder.pause()}
              aria-keyshortcuts={keys ? 'R' : undefined}
            >
              <Pause size={14} aria-hidden /> Pause
            </Button>
          ) : (
            <Button
              onClick={() => void recorder.resume()}
              aria-keyshortcuts={keys ? 'R' : undefined}
            >
              <Play size={14} aria-hidden /> Resume
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => void recorder.stop()}
            aria-keyshortcuts={keys ? 'Shift+R' : undefined}
          >
            <Square size={12} aria-hidden /> Stop
          </Button>
          {keys && <span className="muted">R pauses or resumes, Shift+R stops.</span>}
        </div>
      )}
      {lowDisk && (
        <p className="field__error" role="alert">
          Less than 1 GB of disk space is free. An hour of recording needs about 115 MB.
        </p>
      )}
      {state.error && (
        <p className="field__error" role="alert">
          {state.error}{' '}
          <Button size="sm" variant="ghost" onClick={recorder.clearError}>
            Dismiss
          </Button>
        </p>
      )}
      <ConsentDialog
        key={props.consentOpen ? 'open' : 'closed'}
        open={props.consentOpen}
        onOpenChange={props.onConsentOpenChange}
        keepAudio={props.keepAudio}
        onStart={(title) => {
          props.onConsentOpenChange(false)
          void recorder.start(title || undefined)
        }}
      />
    </section>
  )
}
