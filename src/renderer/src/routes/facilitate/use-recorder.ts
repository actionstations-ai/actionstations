// Hot wash recorder (#425): microphone → 16 kHz AudioContext → recorder worklet (PCM16, ~1 s
// chunks) → hotwash:append, in order, one call at a time. Main allows the microphone only for
// a few seconds after hotwash:mic-arm, so Record asks main first, then opens the stream.
// Leaving the page stops the recording (the audio so far is kept).
import { useCallback, useEffect, useRef, useState } from 'react'
import workletUrl from './recorder-worklet.ts?worker&url'
import type { HotwashRecording } from '@shared/schemas/hotwash'
import { call } from '../../lib/api'
import { inputLevel, microphoneErrorText, type InputLevel } from './recorder-model'

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping'

export interface RecorderState {
  phase: RecorderPhase
  recording?: HotwashRecording
  elapsedSec: number
  level: InputLevel
  rms: number
  device?: string
  error?: string
}

interface Chunk {
  pcm: ArrayBuffer
  peak: number
  rms: number
  final: boolean
}

interface Session {
  stream: MediaStream
  context: AudioContext
  node: AudioWorkletNode
  recording: HotwashRecording
  seq: number
  /** Appends run one after another so main sees chunks in order. */
  chain: Promise<unknown>
  paused: boolean
  onFinal?: () => void
}

const platform = (): string => window.ttx?.platform ?? ''

async function openMicrophone(): Promise<MediaStream> {
  const arm = await call('hotwash:mic-arm')
  if (arm.access !== 'granted')
    throw Object.assign(new Error('Microphone access is off'), { name: 'NotAllowedError' })
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
}

async function openGraph(stream: MediaStream, onChunk: (c: Chunk) => void) {
  const context = new AudioContext({ sampleRate: 16_000 })
  await context.audioWorklet.addModule(workletUrl)
  const node = new AudioWorkletNode(context, 'hotwash-recorder', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
  })
  node.port.onmessage = (e: MessageEvent<Chunk>) => onChunk(e.data)
  const mute = context.createGain()
  mute.gain.value = 0
  context.createMediaStreamSource(stream).connect(node).connect(mute).connect(context.destination)
  return { context, node }
}

function closeSession(s: Session): void {
  s.node.port.onmessage = null
  s.node.disconnect()
  for (const t of s.stream.getTracks()) t.stop()
  void s.context.close().catch(() => undefined)
}

/** Wait for the worklet's last partial chunk (or give up after half a second). */
function flush(s: Session): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 500)
    s.onFinal = () => {
      clearTimeout(timer)
      resolve()
    }
    s.node.port.postMessage('flush')
  })
}

/** A recording that never got audio (the audio graph failed to open) is removed again. */
async function discard(t: RecorderTarget, recordingId: string): Promise<void> {
  const req = { projectPath: t.projectPath, scenarioId: t.scenarioId, recordingId }
  await call('hotwash:record-stop', req).catch(() => undefined)
  await call('hotwash:delete', req).catch(() => undefined)
}

export interface RecorderTarget {
  projectPath: string
  scenarioId: string
  exerciseMin?: number
}

export function useRecorder(target: RecorderTarget, onChange?: () => void) {
  const [state, setState] = useState<RecorderState>({
    phase: 'idle',
    elapsedSec: 0,
    level: 'silent',
    rms: 0,
  })
  const session = useRef<Session | undefined>(undefined)
  const targetRef = useRef(target)
  targetRef.current = target
  const stopRef = useRef<() => Promise<void>>(async () => undefined)

  const send = useCallback((s: Session, c: Chunk) => {
    if (c.final) s.onFinal?.()
    if (s.paused || c.pcm.byteLength === 0) return
    setState((st) => ({ ...st, level: inputLevel(c.peak, c.rms), rms: c.rms }))
    const seq = s.seq++
    const { projectPath, scenarioId } = targetRef.current
    s.chain = s.chain
      .then(() =>
        call('hotwash:append', {
          projectPath,
          scenarioId,
          recordingId: s.recording.id,
          seq,
          pcm: new Uint8Array(c.pcm),
        }),
      )
      .then((r) => {
        setState((st) => ({ ...st, elapsedSec: r.durationSec }))
        if (r.full) void stopRef.current()
      })
      .catch((err: unknown) => setState((st) => ({ ...st, error: (err as Error).message })))
  }, [])

  const start = useCallback(
    async (title?: string) => {
      if (session.current) return
      setState({ phase: 'starting', elapsedSec: 0, level: 'silent', rms: 0 })
      let stream: MediaStream | undefined
      let started: HotwashRecording | undefined
      try {
        stream = await openMicrophone()
        const device = stream.getAudioTracks()[0]?.label || undefined
        const { projectPath, scenarioId, exerciseMin } = targetRef.current
        const recording = await call('hotwash:record-start', {
          projectPath,
          scenarioId,
          consent: true,
          ...(title ? { title } : {}),
          ...(exerciseMin !== undefined ? { exerciseMin } : {}),
          ...(device ? { device } : {}),
        })
        started = recording
        const s: Partial<Session> = {
          stream,
          recording,
          seq: 0,
          chain: Promise.resolve(),
          paused: false,
        }
        const graph = await openGraph(stream, (c) => send(s as Session, c))
        Object.assign(s, graph)
        session.current = s as Session
        setState((st) => ({ ...st, phase: 'recording', recording, ...(device ? { device } : {}) }))
        onChange?.()
      } catch (err) {
        for (const t of stream?.getTracks() ?? []) t.stop()
        if (started) void discard(targetRef.current, started.id)
        setState({
          phase: 'idle',
          elapsedSec: 0,
          level: 'silent',
          rms: 0,
          error: microphoneErrorText(err, platform()),
        })
      }
    },
    [send, onChange],
  )

  const lifecycle = useCallback(
    async (channel: 'hotwash:record-pause' | 'hotwash:record-resume') => {
      const s = session.current
      if (!s) return
      const pausing = channel === 'hotwash:record-pause'
      if (pausing) s.paused = true
      await s.chain
      const { projectPath, scenarioId } = targetRef.current
      try {
        const recording = await call(channel, {
          projectPath,
          scenarioId,
          recordingId: s.recording.id,
        })
        if (!pausing) s.paused = false
        setState((st) => ({ ...st, phase: pausing ? 'paused' : 'recording', recording }))
        onChange?.()
      } catch (err) {
        s.paused = !pausing
        setState((st) => ({ ...st, error: (err as Error).message }))
      }
    },
    [onChange],
  )

  const stop = useCallback(async () => {
    const s = session.current
    if (!s) return
    session.current = undefined
    setState((st) => ({ ...st, phase: 'stopping' }))
    if (!s.paused) await flush(s)
    closeSession(s)
    await s.chain
    const { projectPath, scenarioId } = targetRef.current
    try {
      const recording = await call('hotwash:record-stop', {
        projectPath,
        scenarioId,
        recordingId: s.recording.id,
      })
      setState({ phase: 'idle', elapsedSec: 0, level: 'silent', rms: 0, recording })
    } catch (err) {
      setState({
        phase: 'idle',
        elapsedSec: 0,
        level: 'silent',
        rms: 0,
        error: (err as Error).message,
      })
    }
    onChange?.()
  }, [onChange])
  stopRef.current = stop

  // Leaving Facilitate (or closing the window) stops and keeps what was recorded.
  useEffect(() => () => void stopRef.current(), [])

  return {
    state,
    start,
    pause: () => lifecycle('hotwash:record-pause'),
    resume: () => lifecycle('hotwash:record-resume'),
    stop,
    clearError: () =>
      setState((st) => {
        const { error: _e, ...rest } = st
        return rest
      }),
  }
}

export type Recorder = ReturnType<typeof useRecorder>
