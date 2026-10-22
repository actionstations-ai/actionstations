// Apply a workflow's bindings: MediaJob values → node inputs by [nodeId, 'inputs', name].
// A binding whose source has no value leaves the workflow's literal in place.
import { randomInt } from 'node:crypto'
import type { WorkflowBinding } from '@shared/ipc/comfy'
import { AppError } from '../../../lib/errors'
import type { WorkflowSidecar } from '../../../comfy/sidecar'
import type { ApiWorkflow } from '../../../comfy/workflow'
import type { MediaJob } from '../../types'

export interface BindContext {
  job: MediaJob
  sidecar: WorkflowSidecar
  seed: number
  /** LoadImage value of the uploaded job.inputImagePath. */
  uploadedImage?: string
}

/** Inputs that count frames, so a durationSec binding converts seconds → frames. */
const FRAME_INPUTS = new Set(['length', 'frames', 'num_frames', 'video_frames', 'frame_count'])
const DEFAULT_FPS = 24
/** KSampler accepts 0 … 2^64-1; stay within JS safe integers and JSON. */
const MAX_SEED = 2 ** 48 - 1

export function randomSeed(): number {
  return randomInt(0, MAX_SEED)
}

function joinPrompt(...parts: (string | undefined)[]): string | undefined {
  const text = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')
  return text || undefined
}

export function composeImagePrompt(ctx: BindContext): string | undefined {
  const { brief } = ctx.job
  const style = brief.imageStyle ? ctx.sidecar.styles?.[brief.imageStyle] : undefined
  return joinPrompt(brief.imagePrompt, style)
}

export function composeVideoPrompt(ctx: BindContext): string | undefined {
  const { brief } = ctx.job
  return joinPrompt(brief.videoPrompt ?? brief.imagePrompt)
}

export function clampDuration(ctx: BindContext): number | undefined {
  const sec = ctx.job.brief.durationSec
  if (sec === undefined || !(sec > 0)) return undefined
  const max = ctx.sidecar.maxDurationSec
  return max ? Math.min(sec, max) : sec
}

/** Seconds → frame count of the form step·n + 1 (what Wan / LTX-Video latents expect). */
export function framesFor(seconds: number, fps: number, step: number): number {
  const n = Math.max(1, Math.round((seconds * fps) / step))
  return n * step + 1
}

function durationValue(ctx: BindContext, inputName: string): number | undefined {
  const sec = clampDuration(ctx)
  if (sec === undefined) return undefined
  if (!FRAME_INPUTS.has(inputName)) return sec
  return framesFor(sec, ctx.sidecar.fps ?? DEFAULT_FPS, ctx.sidecar.frameStep ?? 1)
}

function firstLine(ctx: BindContext) {
  return ctx.job.brief.voiceLines?.find((l) => l.text.trim())
}

export function sourceValue(binding: WorkflowBinding, ctx: BindContext): unknown {
  const { job } = ctx
  switch (binding.source) {
    case 'imagePrompt':
      return composeImagePrompt(ctx)
    case 'videoPrompt':
      return composeVideoPrompt(ctx)
    case 'negativePrompt':
      return joinPrompt(job.brief.negativePrompt ?? ctx.sidecar.negativePrompt)
    case 'seed':
      return ctx.seed
    case 'width':
      return job.width
    case 'height':
      return job.height
    case 'durationSec':
      return durationValue(ctx, binding.target[2])
    case 'text': {
      const lines = (job.brief.voiceLines ?? []).map((l) => l.text.trim()).filter(Boolean)
      return lines.length ? lines.join(' ') : undefined
    }
    case 'voiceStyle':
      return firstLine(ctx)?.voiceStyle || undefined
    case 'speaker':
      return firstLine(ctx)?.speaker
    case 'inputImage':
      return ctx.uploadedImage
    case 'referenceAudio':
      return undefined
    case 'literal':
      return binding.value
  }
}

/** Copy of the workflow with every binding that has a value written into its node input. */
export function applyBindings(
  workflow: ApiWorkflow,
  bindings: WorkflowBinding[],
  ctx: BindContext,
): ApiWorkflow {
  const out = structuredClone(workflow)
  for (const binding of bindings) {
    const [nodeId, , inputName] = binding.target
    const node = out[nodeId]
    if (!node) throw new AppError('VALIDATION', `Workflow binding targets missing node "${nodeId}"`)
    const value = sourceValue(binding, ctx)
    if (value !== undefined) node.inputs[inputName] = value
  }
  return out
}

/** Refuse jobs the workflow cannot honour before anything is queued. */
export function assertJobFits(bindings: WorkflowBinding[], ctx: BindContext): void {
  const sources = new Set(bindings.map((b) => b.source))
  if (sources.has('inputImage') && !ctx.job.inputImagePath)
    throw new AppError('VALIDATION', 'This workflow needs an input image (image-to-video)')
  if (sources.has('imagePrompt') && !composeImagePrompt(ctx))
    throw new AppError('VALIDATION', 'The media brief has no image prompt')
  if (sources.has('videoPrompt') && !composeVideoPrompt(ctx))
    throw new AppError('VALIDATION', 'The media brief has no video or image prompt')
  if (sources.has('text') && !firstLine(ctx))
    throw new AppError('VALIDATION', 'The media brief has no voice lines to speak')
}
