// Import a hot wash recorded elsewhere (#425 FR-8): the file is decoded here with the
// browser's own decoders (wav, mp3, m4a, ogg, webm), mixed to mono and resampled to 16 kHz
// with an OfflineAudioContext, then stored like a recording through hotwash:append. No ffmpeg.
import type { HotwashRecording } from '@shared/schemas/hotwash'
import { call } from '../../lib/api'
import { floatToPcm16, importProblem, pcmChunks } from './recorder-model'

const RATE = 16_000

async function decodeToMono16k(file: File): Promise<Float32Array> {
  const bytes = await file.arrayBuffer()
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(bytes)
  } catch {
    throw new Error('This file could not be read as audio.')
  } finally {
    void ctx.close().catch(() => undefined)
  }
  const problem = importProblem(file.name, file.size, decoded.duration)
  if (problem) throw new Error(problem)
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  return (await offline.startRendering()).getChannelData(0)
}

export async function importAudioFile(
  file: File,
  target: { projectPath: string; scenarioId: string },
  onProgress: (fraction: number) => void,
): Promise<HotwashRecording> {
  const early = importProblem(file.name, file.size)
  if (early) throw new Error(early)
  const samples = await decodeToMono16k(file)
  const chunks = pcmChunks(floatToPcm16(samples))
  const rec = await call('hotwash:import-start', {
    ...target,
    name: file.name,
    durationSec: Math.max(0.01, samples.length / RATE),
  })
  const req = { ...target, recordingId: rec.id }
  try {
    for (let seq = 0; seq < chunks.length; seq++) {
      await call('hotwash:append', { ...req, seq, pcm: chunks[seq]! })
      if (seq % 20 === 0) onProgress(seq / chunks.length)
    }
    return await call('hotwash:record-stop', req)
  } catch (err) {
    await call('hotwash:record-stop', req).catch(() => undefined)
    await call('hotwash:delete', req).catch(() => undefined)
    throw err
  }
}
