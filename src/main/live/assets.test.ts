import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BlobMeta, BlobRef } from '@shared/live/schemas'
import { LIMITS } from '@shared/live/protocol'
import type { MediaAsset } from '@shared/schemas/media'
import { DEVICE_MAX_WIDTH, planMedia, stageInject, type StageContext } from './assets'

const provenance = { provider: 'template', createdAt: '2026-01-01T00:00:00.000Z' }
const asset = (
  over: Partial<MediaAsset> & Pick<MediaAsset, 'id' | 'kind' | 'path'>,
): MediaAsset => ({
  role: 'rendered',
  provenance,
  ...over,
})

describe('planMedia', () => {
  it('lists the device rendition first and the original second for a wide template page', () => {
    const plan = planMedia({
      assets: [
        asset({ id: 'a1', kind: 'image', path: 'm/a1.png', width: 1600 }),
        asset({ id: 'p1', kind: 'pdf', path: 'm/a1.pdf' }),
      ],
    })
    expect(plan.map((p) => [p.name, p.downscale])).toEqual([
      ['device', true],
      ['original', false],
    ])
  })

  it('sends a narrow page and an AI photo as they are, with no original', () => {
    expect(
      planMedia({ assets: [asset({ id: 'a1', kind: 'image', path: 'x.png', width: 800 })] }),
    ).toHaveLength(1)
    const photo = planMedia({
      assets: [asset({ id: 'g1', kind: 'image', path: 'x.jpg', role: 'generated', width: 3000 })],
    })
    expect(photo.map((p) => [p.name, p.downscale])).toEqual([['device', false]])
  })

  it('plans a video with its poster, and audio alongside', () => {
    const plan = planMedia({
      assets: [
        asset({ id: 'v1', kind: 'video', path: 'v.mp4', posterPath: 'v.jpg', role: 'generated' }),
        asset({ id: 'au', kind: 'audio', path: 'a.mp3' }),
      ],
    })
    expect(plan.map((p) => p.name)).toEqual(['device', 'poster', 'audio'])
  })

  it('plans nothing for an inject with no media', () => {
    expect(planMedia({ assets: [] })).toEqual([])
  })
})

function project(files: Record<string, Uint8Array | string>) {
  const root = mkdtempSync(join(tmpdir(), 'as-stage-'))
  for (const [rel, data] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, data)
  }
  return root
}

function context(root: string, over: Partial<StageContext> = {}) {
  const uploads: { meta: BlobMeta; bytes: Uint8Array }[] = []
  const ctx: StageContext = {
    root,
    limits: LIMITS.lan,
    cache: new Map(),
    resize: async (png, width) => new Uint8Array(Math.min(png.length, width)),
    putBlob: async (meta, bytes) => {
      uploads.push({ meta, bytes })
      return { blobId: `b${uploads.length}`.padEnd(22, 'x'), ...meta } as unknown as BlobRef
    },
    ...over,
  }
  return { ctx, uploads }
}

describe('stageInject', () => {
  const inject = {
    assets: [asset({ id: 'a1', kind: 'image', path: 'media/a1.png', width: 2000, height: 1000 })],
  }

  it('shrinks the device rendition to at most 1200 px wide and uploads the original too', async () => {
    const root = project({ 'media/a1.png': new Uint8Array(5000) })
    const { ctx, uploads } = context(root)
    const staged = await stageInject(ctx, inject)
    expect(staged.refs).toHaveLength(2)
    expect(uploads[0]!.meta).toMatchObject({
      name: 'device',
      mime: 'image/png',
      width: 1000,
      height: 500,
    })
    expect(uploads[0]!.meta.width!).toBeLessThanOrEqual(DEVICE_MAX_WIDTH)
    expect(uploads[1]!.meta).toMatchObject({ name: 'original', width: 2000 })
  })

  it('does not upload a file twice for the same session', async () => {
    const root = project({ 'media/a1.png': new Uint8Array(100) })
    const { ctx, uploads } = context(root)
    await stageInject(ctx, inject)
    await stageInject(ctx, inject)
    expect(uploads).toHaveLength(2)
  })

  it('leaves out a file over the blob cap and says so', async () => {
    const root = project({ 'media/a1.png': new Uint8Array(100) })
    const { ctx } = context(root, {
      limits: { ...LIMITS.lan, blobBytes: 50 },
      resize: async (p) => p,
    })
    const staged = await stageInject(ctx, inject)
    expect(staged.refs).toHaveLength(0)
    expect(staged.omitted.map((o) => o.name)).toEqual(['device', 'original'])
  })

  it('leaves out a file that cannot be read instead of failing the release', async () => {
    const { ctx } = context(project({}))
    const staged = await stageInject(ctx, inject)
    expect(staged.refs).toEqual([])
    expect(staged.omitted).toHaveLength(2)
  })
})
