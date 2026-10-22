import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { Inject, MediaAsset } from '@shared/schemas'
import type { ComposedDocument } from './compose'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

// The real window renderer needs Electron's browser process; record what it was asked to
// render and return distinct bytes per call instead.
const rendered: ComposedDocument[] = []
vi.mock('./window', () => ({
  renderPng: async (doc: ComposedDocument, scale = 2) => {
    rendered.push(doc)
    return {
      png: Buffer.from(`png#${rendered.length}`),
      width: doc.meta.width,
      height: doc.meta.height ?? 300,
      scale,
    }
  },
  renderPdf: async () => Buffer.from(`pdf#${rendered.length}`),
}))

// Resources: the shipped time_jump_card (paper, no slots) plus a test-only "tweet"
// template with one image slot, so composites can be exercised.
const resources = mkdtempSync(join(tmpdir(), 'ttx-res-'))
cpSync(resolve('templates/_shared'), join(resources, 'templates/_shared'), { recursive: true })
cpSync(
  resolve('templates/injects/time_jump_card'),
  join(resources, 'templates/injects/time_jump_card'),
  { recursive: true },
)
const tweetDir = join(resources, 'templates/injects/tweet')
mkdirSync(tweetDir, { recursive: true })
const tweetFiles: Record<string, unknown> = {
  'meta.json': {
    type: 'tweet',
    label: 'Tweet',
    version: '3',
    width: 600,
    variants: ['light', 'dark'],
    imageSlots: ['photo'],
  },
  'schema.json': {
    type: 'object',
    required: ['text'],
    properties: { text: { type: 'string' } },
    additionalProperties: false,
  },
  'preview.json': { fields: { text: 'hello' } },
}
for (const [f, v] of Object.entries(tweetFiles)) writeFileSync(join(tweetDir, f), JSON.stringify(v))
writeFileSync(
  join(tweetDir, 'template.html'),
  '<p>{{fields.text}}</p>{{#if assets.photo}}<img src="{{assets.photo}}">{{/if}}',
)
process.env.TTX_RESOURCES = resources

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: scenarioHandlers } = await import('../ipc/handlers/scenario')
const { default: renderHandlers } = await import('../ipc/handlers/render')
const { resetSettingsCache } = await import('../settings/store')
const { listInjects, saveInject } = await import('../scenario/store')
const { slotAssets, slotAssetId, slotOfAsset, renderInjectAssets } = await import('./inject')

const handlers = { ...projectHandlers, ...scenarioHandlers, ...renderHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

const TIME_JUMP_FIELDS = JSON.parse(
  readFileSync(resolve('templates/injects/time_jump_card/preview.json'), 'utf8'),
).fields as Record<string, unknown>

let projectPath: string
let scenarioId: string

beforeAll(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
})

beforeEach(async () => {
  rendered.length = 0
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-ri-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA' })).path
  const s = await invoke('scenarios:create-empty', { projectPath, title: 'Flight to Nowhere' })
  scenarioId = s.id
})

const makeInject = (over: Partial<Inject> = {}): Inject => ({
  id: 'inj-05',
  mselRowId: 'I-05',
  type: 'time_jump_card',
  title: 'Time jump',
  deliveryMode: 'read_aloud',
  fields: TIME_JUMP_FIELDS,
  citations: [],
  assets: [],
  versions: [],
  includeInDeck: true,
  locked: false,
  ...over,
})

const renderInject = (injectId = 'inj-05') =>
  invoke('render:inject', { projectPath, scenarioId, injectId })

const mediaDir = (injectId = 'inj-05') =>
  join(projectPath, 'scenarios', scenarioId, 'media', injectId)

const aiImage = (id: string, path: string): MediaAsset => ({
  id,
  kind: 'image',
  path,
  role: 'generated',
  provenance: {
    provider: 'comfyui',
    prompt: 'terminal crowd',
    createdAt: new Date().toISOString(),
  },
})

describe('render:inject', () => {
  it('writes PNG + PDF for a paper template with project-relative paths and provenance', async () => {
    await saveInject(projectPath, scenarioId, makeInject(), { by: 'ai' })
    const assets = await renderInject()
    expect(assets.map((a) => [a.kind, a.role])).toEqual([
      ['image', 'rendered'],
      ['pdf', 'rendered'],
    ])
    const [png, pdf] = assets as [MediaAsset, MediaAsset]
    expect(png.path).toBe(`scenarios/${scenarioId}/media/inj-05/${png.id}.png`)
    expect(pdf.path).toBe(`scenarios/${scenarioId}/media/inj-05/${pdf.id}.pdf`)
    expect(png).toMatchObject({ width: 816 * 2, height: 1056 * 2 })
    const bytes = readFileSync(join(projectPath, png.path))
    expect(png.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(png.provenance).toMatchObject({
      provider: 'template',
      templateId: 'time_jump_card',
      templateVersion: '1',
    })
    expect(existsSync(join(projectPath, pdf.path))).toBe(true)
    const stored = await listInjects(projectPath, scenarioId)
    expect(stored[0]!.assets).toEqual(assets)
  })

  it('replaces previous template outputs instead of duplicating them, keeping AI assets', async () => {
    const ai = aiImage('ai-1', `scenarios/x/media/inj-05/ai.png`)
    await saveInject(projectPath, scenarioId, makeInject({ assets: [ai] }), { by: 'ai' })
    const first = await renderInject()
    const second = await renderInject()
    expect(second).toHaveLength(3)
    expect(second[0]).toEqual(ai)
    const firstIds = first.filter((a) => a.role === 'rendered').map((a) => a.id)
    expect(second.some((a) => firstIds.includes(a.id))).toBe(false)
    expect(readdirSync(mediaDir()).sort()).toEqual(
      second
        .filter((a) => a.role === 'rendered')
        .map((a) => a.path.split('/').pop())
        .sort(),
    )
  })

  it('fills an image slot from a slot-tagged AI asset and marks the output composite', async () => {
    mkdirSync(mediaDir('tw-1'), { recursive: true })
    const id = slotAssetId('photo')
    const rel = `scenarios/${scenarioId}/media/tw-1/${id}.png`
    writeFileSync(join(projectPath, rel), 'fake image')
    const inject = makeInject({
      id: 'tw-1',
      type: 'tweet',
      fields: { text: 'Gate chaos at #NCIA' },
      assets: [aiImage(id, rel)],
    })
    await saveInject(projectPath, scenarioId, inject, { by: 'ai' })
    const assets = await renderInject('tw-1')
    expect(assets.map((a) => a.role)).toEqual(['generated', 'composite'])
    expect(assets[1]!.provenance.templateVersion).toBe('3')
    expect(rendered.at(-1)!.html).toContain(`${id}.png`)
  })

  it('rejects fields that do not match the template schema, listing the issues', async () => {
    await saveInject(projectPath, scenarioId, makeInject({ fields: { narration: 3 } }), {
      by: 'ai',
    })
    await expect(renderInject()).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringMatching(/newTime/),
    })
    expect(existsSync(mediaDir())).toBe(false)
  })

  it('guards ids and project paths', async () => {
    await expect(renderInject('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      invoke('render:inject', { projectPath, scenarioId, injectId: '../x' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(
      invoke('render:inject', { projectPath: tmpdir(), scenarioId, injectId: 'inj-05' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('never deletes files outside the inject media folder when replacing outputs', async () => {
    const outside = join(projectPath, 'project.json')
    const forged: MediaAsset = { ...aiImage('old', 'project.json'), role: 'rendered' }
    const rendered = await renderInjectAssets(
      projectPath,
      scenarioId,
      makeInject({ assets: [forged] }),
    )
    expect(existsSync(outside)).toBe(true)
    expect(rendered.inject.assets.map((a) => a.id)).not.toContain('old')
  })
})

describe('inject variant', () => {
  const tweet = (variant?: string) =>
    makeInject({
      id: 'tw-2',
      type: 'tweet',
      fields: { text: 'Delays at #NCIA' },
      ...(variant ? { variant } : {}),
    })

  it('renders the variant saved on the inject', async () => {
    await saveInject(projectPath, scenarioId, tweet('dark'), { by: 'user' })
    await renderInject('tw-2')
    expect(rendered.at(-1)!.html).toContain('class="variant-dark"')
  })

  it("falls back to the template's first variant when the saved one is unknown", async () => {
    await saveInject(projectPath, scenarioId, tweet('retired'), { by: 'user' })
    await renderInject('tw-2')
    expect(rendered.at(-1)!.html).toContain('class="variant-light"')
  })
})

describe('render:preview with an inject', () => {
  async function injectWithPhoto() {
    mkdirSync(mediaDir('tw-3'), { recursive: true })
    const id = slotAssetId('photo')
    const rel = `scenarios/${scenarioId}/media/tw-3/${id}.png`
    writeFileSync(join(projectPath, rel), 'fake image')
    const inject = makeInject({
      id: 'tw-3',
      type: 'tweet',
      fields: { text: 'x' },
      assets: [aiImage(id, rel)],
    })
    await saveInject(projectPath, scenarioId, inject, { by: 'ai' })
    return id
  }
  const preview = (extra: { injectId?: string } = {}) =>
    invoke('render:preview', {
      type: 'tweet',
      fields: { text: 'Draft text' },
      projectPath,
      scenarioId,
      scale: 1,
      ...extra,
    })

  it("fills image slots from the inject's own AI images", async () => {
    const id = await injectWithPhoto()
    await preview({ injectId: 'tw-3' })
    const html = rendered.at(-1)!.html
    expect(html).toContain(`${id}.png`)
    expect(html).toContain('Draft text')
  })

  it('keeps template sample images without an inject, or for an inject without images', async () => {
    const id = await injectWithPhoto()
    await preview()
    expect(rendered.at(-1)!.html).not.toContain(`${id}.png`)
    await preview({ injectId: 'no-such-inject' })
    expect(rendered.at(-1)!.html).not.toContain('<img')
  })

  it('guards the project path', async () => {
    await expect(
      invoke('render:preview', {
        type: 'tweet',
        fields: {},
        projectPath: tmpdir(),
        scenarioId,
        injectId: 'tw-3',
        scale: 1,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('slot convention', () => {
  const meta = { imageSlots: ['photo', 'avatar'] }
  it('reads the slot from `<slot>-<ULID>` ids', () => {
    expect(slotOfAsset({ id: slotAssetId('photo') })).toBe('photo')
    expect(slotOfAsset({ id: 'photo-1' })).toBeUndefined()
    expect(slotOfAsset({ id: '01J9ZQ3W5Y8K2M4N6P7R9S1T3V' })).toBeUndefined()
  })

  it('maps tagged images to known slots only', () => {
    const a = aiImage(slotAssetId('avatar'), 'a.png')
    const b = aiImage(slotAssetId('banner'), 'b.png')
    const m = slotAssets([a, b], meta)
    expect([...m.keys()]).toEqual(['avatar'])
  })

  it('lets an untagged image fill a single-slot template, never a multi-slot one', () => {
    const untagged = aiImage('01J9ZQ3W5Y8K2M4N6P7R9S1T3V', 'a.png')
    expect(slotAssets([untagged], { imageSlots: ['photo'] }).get('photo')).toBe(untagged)
    expect(slotAssets([untagged], meta).size).toBe(0)
    expect(slotAssets([{ ...untagged, role: 'rendered' }], { imageSlots: ['photo'] }).size).toBe(0)
  })
})
