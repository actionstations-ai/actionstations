/**
 * Record a spoken answer in the browser (spec 0429 FR-18). `MediaRecorder` captures the
 * microphone in whatever the browser supports (Opus in WebM, or AAC in MP4 on Safari); when it
 * stops, the clip is decoded with the browser's own decoders, mixed to mono, resampled to
 * 16 kHz and written as a WAV, which is what the facilitator's speech model reads. Nothing is
 * stored on the device. The microphone is released as soon as recording stops.
 */
import { encodeWav16k, maxRecordingSeconds } from './calls'

export interface Recording {
  bytes: Uint8Array
  durationSec: number
}

export interface Recorder {
  /** Stops and resolves with the clip. Also called by the time limit. */
  stop(): Promise<Recording>
}

export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

async function toWav(blob: Blob): Promise<Recording> {
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const length = Math.max(1, Math.ceil(decoded.duration * 16_000))
    const offline = new OfflineAudioContext(1, length, 16_000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return {
      bytes: encodeWav16k(rendered.getChannelData(0)),
      durationSec: Math.round(decoded.duration * 10) / 10,
    }
  } finally {
    void ctx.close()
  }
}

/** Ask for the microphone and start. `onLimit` runs when the connection's size limit is reached. */
export async function startRecording(maxBytes: number, onLimit: () => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
  recorder.start()
  const limit = setTimeout(onLimit, maxRecordingSeconds(maxBytes) * 1000)
  return {
    async stop() {
      clearTimeout(limit)
      if (recorder.state !== 'inactive') recorder.stop()
      await stopped
      for (const track of stream.getTracks()) track.stop()
      return toWav(new Blob(chunks, { type: recorder.mimeType }))
    },
  }
}
