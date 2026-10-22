// The four media steps for one inject (AI image → template render → TTS + post-FX →
// video) and the MediaAsset bookkeeping they share: generated files land in
// scenarios/<id>/media/<injectId>/<assetId>.<ext>, paths stored project-relative, every
// asset with provenance and a sha256. The template step is render/inject.ts, which fills
// the template's image slots from generated assets named `<slot>-<ULID>`.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import type { Brand, Inject, MediaAsset, MediaBrief, Provenance } from '@shared/schemas'
import type { RenderPath } from '@shared/taxonomy'
import type { JobContext } from '../../jobs/manager'
import { AppError } from '../../lib/errors'
import { ensureDir, safeJoin, toRel } from '../../lib/fs'
import { newId, nowIso } from '../../lib/ids'
import type { MediaJob, MediaOutput, MediaProgress } from '../../providers/types'
import { slotAssetId } from '../../render/inject'
import type { InjectDeps, MediaTask } from './deps'

export interface StepContext {
  root: string
  scenarioId: string
  deps: InjectDeps
  ctx: JobContext
  inject: Inject
  brief: MediaBrief
  brand: Brand
  outDir: string
  /** Template image slot the AI image fills (from the plan). */
  imageSlot?: string
  /** Progress window for this inject: [from, to). */
  window: [number, number]
}

/** Which assets a render path produces (so re-rendering a path replaces only its assets). */
export function assetsOfPath(assets: MediaAsset[], path: RenderPath): MediaAsset[] {
  return assets.filter((a) => {
    switch (path) {
      case 'ai_image':
        return a.kind === 'image' && a.role === 'generated'
      case 'template':
        return (a.kind === 'image' || a.kind === 'pdf') && a.role !== 'generated'
      case 'tts':
        return a.kind === 'audio'
      case 'ai_video':
        return a.kind === 'video'
    }
  })
}

const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')

/** Move a provider's output file to <outDir>/<assetId>.<ext> and describe it. */
async function stored(
  step: StepContext,
  id: string,
  kind: MediaAsset['kind'],
  srcPath: string,
  meta: Partial<Pick<MediaAsset, 'width' | 'height' | 'durationSec' | 'posterPath'>>,
  provenance: Omit<Provenance, 'createdAt'>,
): Promise<MediaAsset> {
  await ensureDir(step.outDir)
  const dest = join(step.outDir, `${id}${extname(srcPath).toLowerCase() || '.bin'}`)
  if (dest !== srcPath) await fs.rename(srcPath, dest)
  const bytes = await fs.readFile(dest)
  return {
    id,
    kind,
    path: toRel(step.root, dest),
    role: 'generated',
    ...meta,
    sha256: sha256(bytes),
    provenance: { ...provenance, createdAt: nowIso() },
  }
}

/** Remove an asset's file (and poster) when its path is re-rendered. */
export async function removeAssetFiles(root: string, assets: MediaAsset[]): Promise<void> {
  for (const a of assets) {
    for (const rel of [a.path, a.posterPath]) {
      if (!rel) continue
      try {
        await fs.rm(safeJoin(root, rel), { force: true })
      } catch {
        // A path outside the project is never deleted; the asset entry is dropped anyway.
      }
    }
  }
}

const dims = (style: MediaBrief['imageStyle']): { width: number; height: number } =>
  style === 'portrait' ? { width: 832, height: 1216 } : { width: 1216, height: 832 }

function onProgress(step: StepContext, label: string): (p: MediaProgress) => void {
  const [from, to] = step.window
  return (p) =>
    step.ctx.progress(
      from + (to - from) * Math.min(1, p.progress),
      `${label}${p.message ? `: ${p.message}` : ''}`,
      { stage: 'media_render', itemId: step.inject.id },
    )
}

type JobExtras = Partial<Pick<MediaJob, 'width' | 'height' | 'inputImagePath' | 'seed'>>

async function generate(
  step: StepContext,
  task: MediaTask,
  extra: JobExtras = {},
): Promise<MediaOutput> {
  const { provider, providerId } = await step.deps.resolveMediaProvider(task, step.root)
  if (!provider.capabilities().has(task))
    throw new AppError('VALIDATION', `Provider "${providerId}" cannot generate ${task}`)
  const outputs = await provider.generate(
    {
      kind: task,
      injectId: step.inject.id,
      brief: step.brief,
      outDir: step.outDir,
      signal: step.ctx.signal,
      ...extra,
    },
    onProgress(step, `${task} for ${step.inject.mselRowId}`),
  )
  const out = outputs[0]
  if (!out) throw new AppError('PROVIDER', `Provider "${providerId}" returned no ${task} output`)
  return out
}

/** AI image (SDXL etc.) as a 'generated' asset whose id names the template slot it fills. */
export async function imageStep(step: StepContext): Promise<MediaAsset> {
  if (!step.brief.imagePrompt)
    throw new AppError('VALIDATION', 'The media brief has no image prompt')
  const out = await generate(step, 'image', { ...dims(step.brief.imageStyle) })
  const id = step.imageSlot ? slotAssetId(step.imageSlot) : newId()
  return stored(
    step,
    id,
    'image',
    out.filePath,
    { ...(out.width ? { width: out.width } : {}), ...(out.height ? { height: out.height } : {}) },
    {
      ...out.provenance,
      prompt: step.brief.imagePrompt,
      negativePrompt: step.brief.negativePrompt,
    },
  )
}

/** Template render via render/inject.ts: PNG (+PDF), composited from the slot assets. */
export async function templateStep(
  step: StepContext,
  current: Inject,
): Promise<{ inject: Inject; assets: MediaAsset[] }> {
  return step.deps.renderer(step.root, step.scenarioId, current, { brand: step.brand })
}

/** TTS for the voice lines, then the post-FX chain when the audio workstream provides it. */
export async function ttsStep(step: StepContext): Promise<MediaAsset> {
  if (!step.brief.voiceLines?.length)
    throw new AppError('VALIDATION', 'The media brief has no voice lines')
  const out = await generate(step, 'audio')
  let wavPath = out.filePath
  const effects = step.brief.postFx ?? []
  let applied: string[] | undefined
  if (effects.length && step.deps.applyPostFx) {
    const fx = await step.deps.applyPostFx({ wavPath, outDir: step.outDir, effects })
    if (fx.wavPath !== wavPath) await fs.rm(wavPath, { force: true })
    wavPath = fx.wavPath
    applied = effects
  } else if (effects.length) {
    step.ctx.log(
      `media_render ${step.inject.mselRowId}: post-FX ${effects.join('+')} skipped (audio FX chain not installed)`,
      'info',
      { stage: 'media_render', itemId: step.inject.id },
    )
  }
  return stored(
    step,
    newId(),
    'audio',
    wavPath,
    { ...(out.durationSec !== undefined ? { durationSec: out.durationSec } : {}) },
    { ...out.provenance, ...(applied ? { postFx: applied } : {}) },
  )
}

/** Short AI video (image-to-video from the generated still when there is one) + poster. */
export async function videoStep(
  step: StepContext,
  image: MediaAsset | undefined,
): Promise<MediaAsset> {
  const out = await generate(step, 'video', {
    ...(image ? { inputImagePath: safeJoin(step.root, image.path) } : {}),
    ...dims(step.brief.imageStyle),
  })
  const poster = out.posterPath
    ? await stored(step, newId(), 'image', out.posterPath, {}, out.provenance)
    : undefined
  return stored(
    step,
    newId(),
    'video',
    out.filePath,
    {
      ...(out.width ? { width: out.width } : {}),
      ...(out.height ? { height: out.height } : {}),
      ...(out.durationSec !== undefined ? { durationSec: out.durationSec } : {}),
      ...(poster ? { posterPath: poster.path } : {}),
    },
    { ...out.provenance, prompt: step.brief.videoPrompt ?? step.brief.imagePrompt },
  )
}
