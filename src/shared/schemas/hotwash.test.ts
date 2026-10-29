// Hot wash file schemas (#425): defaults, forward compatibility, path rules.
import { describe, expect, it } from 'vitest'
import { HotwashRecording, HotwashSettings, Transcript } from './hotwash'
import { Project } from './project'

const AT = '2026-10-28T14:05:00.000Z'

describe('hot wash schemas', () => {
  it('keeps keys written by a newer build when a recording or transcript is saved again', () => {
    const rec = HotwashRecording.parse({
      id: 'R1',
      source: 'microphone',
      startedAt: AT,
      status: 'ready',
      diarization: { speakers: 3 },
    })
    expect(rec).toMatchObject({ title: 'Hot wash', sampleRate: 16000, channels: 1, pauses: [] })
    expect((rec as Record<string, unknown>).diarization).toEqual({ speakers: 3 })
    const t = Transcript.parse({
      id: 'T1',
      recordingId: 'R1',
      model: 'whisper-base',
      providerId: 'local-whisper',
      language: 'en',
      createdAt: AT,
      updatedAt: AT,
      summary: 'later feature',
    })
    expect(t).toMatchObject({ doneUntilSec: 0, complete: false, revision: 0, segments: [] })
    expect(JSON.parse(JSON.stringify(t)).summary).toBe('later feature')
  })

  it('refuses an audio path that leaves the project and a sample rate other than 16 kHz', () => {
    const base = { id: 'R1', source: 'microphone', startedAt: AT, status: 'ready' }
    expect(HotwashRecording.safeParse({ ...base, audioPath: '../../etc/passwd' }).success).toBe(
      false,
    )
    expect(HotwashRecording.safeParse({ ...base, audioPath: '/abs/audio.wav' }).success).toBe(false)
    expect(HotwashRecording.safeParse({ ...base, sampleRate: 44100 }).success).toBe(false)
  })

  it('deletes audio after transcription unless the project keeps it, and shows the notice', () => {
    expect(HotwashSettings.parse({})).toEqual({ keepAudio: false, showRecordingNotice: true })
    const project = Project.parse({
      id: 'P1',
      name: 'Rivergate',
      createdAt: AT,
      updatedAt: AT,
      appVersion: '0.7.0',
    })
    expect(project.hotwash).toBeUndefined()
  })
})
