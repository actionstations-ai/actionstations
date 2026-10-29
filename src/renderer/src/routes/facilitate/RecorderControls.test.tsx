// @vitest-environment happy-dom
// Record hot wash controls (#425): consent before every recording, the state in words, the
// window title, keyboard hints, and the warnings.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecorderControls } from './RecorderControls'
import type { Recorder, RecorderState } from './use-recorder'

afterEach(() => {
  cleanup()
  document.title = 'Action Stations'
})

function fakeRecorder(state: Partial<RecorderState> = {}): Recorder {
  return {
    state: { phase: 'idle', elapsedSec: 0, level: 'silent', rms: 0, ...state },
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    clearError: vi.fn(),
  }
}

function setup(recorder: Recorder, extra: { freeBytes?: number; consentOpen?: boolean } = {}) {
  const onConsentOpenChange = vi.fn()
  const onAnnounce = vi.fn()
  const view = render(
    <RecorderControls
      recorder={recorder}
      freeBytes={extra.freeBytes}
      keepAudio={false}
      shortcutsOn
      consentOpen={extra.consentOpen ?? false}
      onConsentOpenChange={onConsentOpenChange}
      onAnnounce={onAnnounce}
    />,
  )
  return { onConsentOpenChange, onAnnounce, view }
}

describe('RecorderControls', () => {
  it('opens the consent dialog from Record hot wash', async () => {
    const { onConsentOpenChange } = setup(fakeRecorder(), { freeBytes: 41e9 })
    const button = screen.getByRole('button', { name: /Record hot wash/ })
    expect(button.getAttribute('aria-keyshortcuts')).toBe('R')
    expect(screen.getByText(/Free space: 41 GB/)).toBeTruthy()
    await userEvent.click(button)
    expect(onConsentOpenChange).toHaveBeenCalledWith(true)
  })

  it('starts only after the facilitator confirms everyone was told', async () => {
    const recorder = fakeRecorder()
    setup(recorder, { consentOpen: true })
    const start = screen.getByRole('button', { name: /Start recording/ }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(screen.getByText(/audio is deleted once its transcript is saved/)).toBeTruthy()
    const title = screen.getByLabelText('Recording title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Mid-exercise discussion')
    await userEvent.click(screen.getByLabelText(/Everyone present has been told/))
    expect(start.disabled).toBe(false)
    await userEvent.click(start)
    expect(recorder.start).toHaveBeenCalledWith('Mid-exercise discussion')
  })

  it('writes the recording state out, with time, microphone, level and controls', async () => {
    const recorder = fakeRecorder({
      phase: 'recording',
      elapsedSec: 1421,
      device: 'MacBook Pro Microphone',
      level: 'good',
      rms: 0.1,
    })
    setup(recorder)
    expect(screen.getByText('Recording')).toBeTruthy()
    expect(screen.getByRole('timer', { name: 'Recording time' }).textContent).toBe('0:23:41')
    expect(screen.getByText('Microphone: MacBook Pro Microphone')).toBeTruthy()
    expect(screen.getByText('Input level: good')).toBeTruthy()
    expect(document.title).toMatch(/^● Recording/)
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(recorder.pause).toHaveBeenCalled()
    const stop = screen.getByRole('button', { name: 'Stop' })
    expect(stop.getAttribute('aria-keyshortcuts')).toBe('Shift+R')
    await userEvent.click(stop)
    expect(recorder.stop).toHaveBeenCalled()
  })

  it('shows Paused in words and offers Resume', async () => {
    const recorder = fakeRecorder({ phase: 'paused', elapsedSec: 60 })
    setup(recorder)
    expect(screen.getByText('Paused')).toBeTruthy()
    expect(document.title).toMatch(/^● Paused/)
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(recorder.resume).toHaveBeenCalled()
  })

  it('announces state changes through the status line', () => {
    const { onAnnounce, view } = setup(fakeRecorder())
    view.rerender(
      <RecorderControls
        recorder={fakeRecorder({ phase: 'recording' })}
        keepAudio={false}
        shortcutsOn
        consentOpen={false}
        onConsentOpenChange={vi.fn()}
        onAnnounce={onAnnounce}
      />,
    )
    expect(onAnnounce).toHaveBeenCalledWith('Recording the hot wash')
  })

  it('warns when the disk is nearly full and shows errors as alerts', () => {
    setup(fakeRecorder({ error: 'Microphone access is off for Action Stations.' }), {
      freeBytes: 500e6,
    })
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent)
    expect(alerts.some((t) => /Less than 1 GB/.test(t ?? ''))).toBe(true)
    expect(alerts.some((t) => /Microphone access is off/.test(t ?? ''))).toBe(true)
  })
})
