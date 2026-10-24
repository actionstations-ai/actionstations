// ComfyUI MediaProvider (#32): bind the job into an API-format workflow, queue it, follow it
// over WebSocket (history polling as fallback), and download the outputs into job.outDir.
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import type { ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import {
  defaultWorkflowId,
  projectRootFor,
  setAvailableNodes,
  workflowForRender,
} from '../../../comfy/store'
import type { WorkflowSidecar } from '../../../comfy/sidecar'
import { modelNameOf, workflowSha256, type ApiWorkflow } from '../../../comfy/workflow'
import { elapsed, numberOption } from '../../text/common'
import type {
  MediaCapability,
  MediaJob,
  MediaOutput,
  MediaProgress,
  MediaProvider,
} from '../../types'
import {
  applyBindings,
  assertJobFits,
  composeImagePrompt,
  composeVideoPrompt,
  randomSeed,
  type BindContext,
} from './bind'
import { ComfyClient, outputFiles, type ComfyFile } from './client'
import { ExecutionWatcher, waitForCompletion } from './watch'

const MIME: Record<string, { kind: MediaCapability; mime: string }> = {
  '.png': { kind: 'image', mime: 'image/png' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.webp': { kind: 'image', mime: 'image/webp' },
  '.mp4': { kind: 'video', mime: 'video/mp4' },
  '.webm': { kind: 'video', mime: 'video/webm' },
  '.mov': { kind: 'video', mime: 'video/quicktime' },
  '.gif': { kind: 'video', mime: 'image/gif' },
  '.wav': { kind: 'audio', mime: 'audio/wav' },
  '.mp3': { kind: 'audio', mime: 'audio/mpeg' },
  '.flac': { kind: 'audio', mime: 'audio/flac' },
  '.ogg': { kind: 'audio', mime: 'audio/ogg' },
}

/** Overall wait per job unless options.timeoutMs says otherwise. */
const JOB_TIMEOUT_MS: Record<MediaCapability, number> = {
  image: 15 * 60_000,
  video: 120 * 60_000,
  audio: 15 * 60_000,
}

/** Width × height from a PNG IHDR chunk. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Seconds of video the bound workflow asks for (frame count ÷ fps), when it can be read. */
export function boundDurationSec(
  workflow: ApiWorkflow,
  sidecar: WorkflowSidecar,
): number | undefined {
  const fps = sidecar.fps
  if (!fps) return undefined
  for (const node of Object.values(workflow)) {
    const frames = node.inputs.length ?? node.inputs.num_frames
    if (typeof frames === 'number' && frames > 1) return Math.round((frames / fps) * 100) / 100
  }
  return undefined
}

export class ComfyMediaProvider implements MediaProvider {
  readonly kind = 'comfyui' as const
  readonly client: ComfyClient

  constructor(readonly config: ProviderConfig) {
    if (!config.baseUrl) throw new AppError('VALIDATION', 'ComfyUI needs a base URL')
    this.client = new ComfyClient(
      config.baseUrl,
      numberOption(config, 'requestTimeoutMs') ?? 30_000,
    )
  }

  get id(): string {
    return this.config.id
  }

  capabilities(): Set<MediaCapability> {
    return new Set<MediaCapability>(['image', 'video', 'audio'])
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const stats = await this.client.systemStats(signal)
      const system = (stats.system ?? {}) as Record<string, unknown>
      const devices = (stats.devices ?? []) as { name?: string; type?: string }[]
      return {
        ok: true,
        latencyMs: elapsed(start),
        message:
          `ComfyUI ${String(system.comfyui_version ?? '')} on ${devices[0]?.type ?? 'unknown device'}`.trim(),
        details: { comfyuiVersion: system.comfyui_version, device: devices[0]?.name },
      }
    } catch (err) {
      return { ok: false, latencyMs: elapsed(start), message: (err as Error).message }
    }
  }

  /** Node classes from /object_info; also refreshes the store's missing-node cache. */
  async nodeClasses(signal?: AbortSignal): Promise<string[]> {
    const classes = await this.client.nodeClasses(signal)
    setAvailableNodes(classes)
    return classes
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    const workflowId = job.workflowId ?? (await defaultWorkflowId(job.kind))
    if (!workflowId)
      throw new AppError(
        'VALIDATION',
        `No ComfyUI workflow is set for ${job.kind}. Choose one on the Workflows page.`,
      )
    const projectRoot = await projectRootFor(job.outDir)
    const { workflow, sidecar } = await workflowForRender(workflowId, projectRoot)
    const ctx = await this.bindContext(job, sidecar)
    assertJobFits(sidecar.bindings, ctx)
    const bound = applyBindings(workflow, sidecar.bindings, ctx)
    onProgress?.({ progress: 0.02, message: `Queueing ${sidecar.name}` })
    const entry = await this.run(bound, job, onProgress)
    const files = outputFiles(entry).filter((f) => MIME[extname(f.filename).toLowerCase()])
    if (!files.length)
      throw new AppError('PROVIDER', `ComfyUI workflow "${sidecar.name}" produced no output files`)
    const provenance = {
      provider: this.id,
      ...optional('model', modelNameOf(bound)),
      workflowHash: workflowSha256(bound),
      ...optional(
        'prompt',
        job.kind === 'video' ? composeVideoPrompt(ctx) : composeImagePrompt(ctx),
      ),
      ...optional('negativePrompt', job.brief.negativePrompt ?? sidecar.negativePrompt),
      seed: ctx.seed,
    }
    const outputs = await this.saveOutputs(files, job, provenance, boundDurationSec(bound, sidecar))
    onProgress?.({ progress: 1, message: 'Media ready' })
    return outputs
  }

  private async bindContext(job: MediaJob, sidecar: WorkflowSidecar): Promise<BindContext> {
    const needsImage = sidecar.bindings.some((b) => b.source === 'inputImage')
    const uploadedImage =
      needsImage && job.inputImagePath
        ? await this.client.uploadImage(job.inputImagePath, job.signal)
        : undefined
    return {
      job,
      sidecar,
      seed: job.seed ?? randomSeed(),
      ...(uploadedImage ? { uploadedImage } : {}),
    }
  }

  private async run(workflow: ApiWorkflow, job: MediaJob, onProgress?: (p: MediaProgress) => void) {
    const clientId = randomUUID()
    const watcher = await ExecutionWatcher.open(this.client.wsUrl(clientId))
    let promptId: string | undefined
    try {
      promptId = await this.client.queuePrompt(workflow, clientId, job.signal)
      return await waitForCompletion(this.client, promptId, watcher, {
        timeoutMs: numberOption(this.config, 'timeoutMs') ?? JOB_TIMEOUT_MS[job.kind],
        ...(job.signal ? { signal: job.signal } : {}),
        ...(onProgress ? { onProgress } : {}),
      })
    } catch (err) {
      if (promptId) await this.client.cancel(promptId)
      throw err
    } finally {
      watcher.close()
    }
  }

  private async saveOutputs(
    files: ComfyFile[],
    job: MediaJob,
    provenance: MediaOutput['provenance'],
    durationSec: number | undefined,
  ): Promise<MediaOutput[]> {
    await fs.mkdir(job.outDir, { recursive: true })
    const stamp = Date.now()
    const poster = job.kind === 'video' ? await this.copyPoster(job, stamp) : undefined
    const outputs: MediaOutput[] = []
    for (const [i, file] of files.entries()) {
      const ext = extname(file.filename).toLowerCase()
      const info = MIME[ext]!
      const bytes = await this.client.download(file, job.signal)
      const filePath = join(job.outDir, `${job.injectId}-${info.kind}-${stamp}-${i + 1}${ext}`)
      await fs.writeFile(filePath, bytes)
      const size = info.mime === 'image/png' ? pngSize(bytes) : undefined
      outputs.push({
        kind: info.kind,
        filePath,
        mimeType: info.mime,
        ...(size ?? {}),
        ...(info.kind === 'video' && durationSec ? { durationSec } : {}),
        ...(info.kind === 'video' && poster ? { posterPath: poster } : {}),
        provenance,
      })
    }
    return outputs
  }

  /** The input image doubles as the clip's poster frame. */
  private async copyPoster(job: MediaJob, stamp: number): Promise<string | undefined> {
    if (!job.inputImagePath) return undefined
    const target = join(
      job.outDir,
      `${job.injectId}-poster-${stamp}${extname(job.inputImagePath).toLowerCase() || '.png'}`,
    )
    await fs.copyFile(job.inputImagePath, target)
    return target
  }
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V }
}
