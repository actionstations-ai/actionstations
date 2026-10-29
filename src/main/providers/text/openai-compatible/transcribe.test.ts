// Speech to text through a local OpenAI-compatible server (#425 FR-3), against a stubbed
// fetch: 30 s windows as multipart WAV uploads, verbose_json segments mapped to recording
// time, and no request at all to a server off this computer.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { pcm16WavHeader, parseWavHeader } from '../../../lib/wav-pcm'
import type { TranscribeProgress } from '../../types'
import { OpenAiCompatibleTranscriber } from './transcribe'

const LOCAL: ProviderConfig = {
  id: 'whisper-cpp',
  kind: 'openai-compatible',
  label: 'whisper.cpp',
  baseUrl: 'http://127.0.0.1:8080/v1',
  defaultModel: 'whisper-1',
  options: {},
  enabled: true,
}

function wav(seconds: number): string {
  const data = Buffer.alloc(seconds * 16_000 * 2)
  const path = join(mkdtempSync(join(tmpdir(), 'ttx-oai-stt-')), 'audio.wav')
  writeFileSync(path, Buffer.concat([pcm16WavHeader(data.length, 16_000), data]))
  return path
}

interface Upload {
  url: string
  fields: Record<string, string>
  seconds: number
}

/** A server that hears "Line N." every 10 s of each uploaded window. */
function stubServer() {
  const uploads: Upload[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const form = init.body as FormData
      const file = form.get('file') as Blob
      const bytes = new Uint8Array(await file.arrayBuffer())
      const seconds = parseWavHeader(bytes, bytes.length).durationSec
      const fields: Record<string, string> = {}
      for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v
      uploads.push({ url, fields, seconds })
      const segments = []
      for (let t = 0; t + 8 <= seconds; t += 10)
        segments.push({ start: t, end: t + 8, text: ` Line ${uploads.length}.${t}` })
      return new Response(JSON.stringify({ language: 'english', segments }), {
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  return uploads
}

afterEach(() => vi.unstubAllGlobals())

describe('OpenAiCompatibleTranscriber', () => {
  it('uploads the recording in windows and reports segments in recording time', async () => {
    const uploads = stubServer()
    const t = new OpenAiCompatibleTranscriber(LOCAL, undefined)
    const windows: TranscribeProgress[] = []
    const out = await t.transcribe({ audioPath: wav(50), language: 'en' }, (w) => {
      windows.push(w)
    })
    expect(out).toEqual({ language: 'en', model: 'whisper-1' })
    expect(uploads[0]).toMatchObject({
      url: 'http://127.0.0.1:8080/v1/audio/transcriptions',
      fields: { model: 'whisper-1', response_format: 'verbose_json', language: 'en' },
      seconds: 30,
    })
    expect(uploads.length).toBeGreaterThan(1)
    const starts = windows.flatMap((w) => w.segments.map((s) => s.startSec))
    expect(starts.slice(0, 3)).toEqual([0, 10, 20])
    expect(windows.at(-1)!.progress).toBe(1)
  })

  it('never sends audio to a server on another computer', async () => {
    const uploads = stubServer()
    const t = new OpenAiCompatibleTranscriber(
      { ...LOCAL, baseUrl: 'https://api.example.com/v1' },
      'sk-test',
    )
    await expect(t.transcribe({ audioPath: wav(5) }, () => undefined)).rejects.toThrow(
      /runs only on this computer/,
    )
    expect(uploads).toEqual([])
  })
})
