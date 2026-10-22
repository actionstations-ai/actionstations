import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { exportMedia } = await import('./media')
const { providerSummary, scenarioJson, scenarioMarkdown } = await import('./manifest')

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')

describe('media export', () => {
  it('copies every asset under its S3-… name, adds the poster and an MP3 per WAV', async () => {
    const model = fixtureModel()
    const out = mkdtempSync(join(tmpdir(), 'ttx-export-media-'))
    const { files, warnings } = await exportMedia(model, out)
    expect(warnings).toEqual([])
    expect(readdirSync(join(out, 'media')).sort()).toEqual(
      [
        'S3-I02a-helpdesk_ticket.pdf',
        'S3-I02a-helpdesk_ticket.png',
        'S3-I04-tweet-attached_image.png',
        'S3-I04-tweet.png',
        'S3-I05b-radio_call.mp3',
        'S3-I05b-radio_call.png',
        'S3-I05b-radio_call.wav',
        'S3-I06-fids_board-poster.png',
        'S3-I06-fids_board.mp4',
      ].sort(),
    )
    const mp3 = readFileSync(join(out, 'media/S3-I05b-radio_call.mp3'))
    expect(mp3.length).toBeGreaterThan(100)
    expect(files.find((f) => f.kind === 'mp3')?.sha256).toBe(sha(mp3))
  })

  it('lists missing source files as warnings instead of failing', async () => {
    const model = fixtureModel()
    model.available.delete(model.injects[0]!.assets[0]!.path)
    const out = mkdtempSync(join(tmpdir(), 'ttx-export-media-'))
    const { warnings } = await exportMedia(model, out)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/^I-02a: missing file/)
  })
})

describe('scenario.md manifest', () => {
  it('front matter lists every media file with its real sha256', async () => {
    const model = fixtureModel()
    const out = mkdtempSync(join(tmpdir(), 'ttx-export-md-'))
    const { files } = await exportMedia(model, out)
    const md = scenarioMarkdown(model, files)
    const front = load(md.split('---\n')[1]!) as {
      id: string
      version: number
      generatedAt: string
      media: { file: string; sha256: string; bytes: number }[]
    }
    expect(front.id).toBe(model.scenario.id)
    expect(front.version).toBe(model.scenario.version)
    expect(front.generatedAt).toBe(model.generatedAt)
    expect(front.media).toHaveLength(readdirSync(join(out, 'media')).length)
    for (const m of front.media) {
      const data = readFileSync(join(out, m.file))
      expect(m.sha256).toBe(sha(data))
      expect(m.bytes).toBe(data.length)
    }
  })

  it('escapes pipes in MSEL cells so the table keeps its shape', () => {
    const model = fixtureModel()
    model.scenario.msel[1]!.event = 'Call: "A | B"\nsecond line'
    const md = scenarioMarkdown(model, [])
    expect(md).toContain('Call: "A \\| B" second line')
    expect(md).toContain('## Phase 1: The Glitch (Hour 0:00 – 1:00)')
  })

  it('summarizes text providers from provenance', () => {
    const at = '2026-10-21T00:00:00.000Z'
    const runs = [
      {
        stage: 'phase_plan',
        startedAt: at,
        status: 'ok',
        providerRef: { providerId: 'lm' },
        model: 'qwen',
        inputTokens: 10,
        outputTokens: 5,
        repairAttempts: 0,
      },
      {
        stage: 'rubric',
        startedAt: at,
        status: 'ok',
        providerRef: { providerId: 'lm' },
        model: 'qwen',
        inputTokens: 1,
        outputTokens: 2,
        repairAttempts: 0,
      },
      {
        stage: 'critique',
        startedAt: at,
        status: 'error',
        providerRef: { providerId: 'x' },
        repairAttempts: 0,
      },
    ] as Parameters<typeof providerSummary>[0]
    expect(providerSummary(runs)).toEqual([
      { provider: 'lm', model: 'qwen', stages: 2, inputTokens: 11, outputTokens: 7 },
    ])
  })
})

describe('scenario.json', () => {
  it('inlines injects and documents into the full scenario', () => {
    const model = fixtureModel()
    const json = JSON.parse(scenarioJson(model))
    expect(json.format).toBe('tabletop-gen/scenario-export')
    expect(json.scenario.msel).toHaveLength(model.scenario.msel.length)
    expect(json.scenario.injects).toHaveLength(model.injects.length)
    expect(json.documents.handbook).toContain('Controller')
  })
})
