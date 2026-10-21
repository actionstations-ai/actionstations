import { describe, expect, it } from 'vitest'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STAGE_OUTPUT_SCHEMAS, type StageOutputSchemaName } from '@shared/schemas'
import { jsonSpec } from '../json'
import { MockMediaProvider, MockTextProvider, clearMockResponses, setMockResponse } from './adapter'
import { MOCK_FIXTURES } from './fixtures'

const config = { id: 'mock', kind: 'mock' as const, label: 'Mock', options: {}, enabled: true }

describe('mock provider', () => {
  it('has a schema-valid fixture for every stage output schema', () => {
    for (const name of Object.keys(STAGE_OUTPUT_SCHEMAS) as StageOutputSchemaName[]) {
      expect(() => STAGE_OUTPUT_SCHEMAS[name].parse(MOCK_FIXTURES[name]), name).not.toThrow()
    }
  })

  it('returns structured output and streams tokens', async () => {
    const p = new MockTextProvider(config)
    let streamed = ''
    const r = await p.chat(
      {
        messages: [{ role: 'user', content: 'go' }],
        json: jsonSpec('PhasePlanOutput', STAGE_OUTPUT_SCHEMAS.PhasePlanOutput),
      },
      (t) => (streamed += t),
    )
    expect((r.json as { phases: unknown[] }).phases).toHaveLength(4)
    expect(streamed).toBe(r.text)
  })

  it('accepts per-test overrides', async () => {
    setMockResponse('*', () => 'custom')
    const r = await new MockTextProvider(config).chat({
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.text).toBe('custom')
    clearMockResponses()
  })

  it('writes placeholder media files', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-mock-'))
    const m = new MockMediaProvider(config)
    const [img] = await m.generate({
      kind: 'image',
      injectId: 'I-06',
      brief: { paths: ['ai_image'] },
      outDir,
      width: 64,
      height: 32,
    })
    expect(statSync(img!.filePath).size).toBeGreaterThan(0)
    const [wav] = await m.generate({
      kind: 'audio',
      injectId: 'I-05b',
      brief: { paths: ['tts'] },
      outDir,
    })
    expect(wav!.mimeType).toBe('audio/wav')
  })
})
