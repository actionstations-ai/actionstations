// Built-in speech to text (#425): Whisper ONNX models through transformers.js in the
// speech-to-text utilityProcess. Nothing here touches the network; models arrive only through
// downloadWhisperModel (a user-started model-pull job with pinned, hash-checked files).
import { totalmem } from 'node:os'
import type { ModelInfo, ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { userDataPath } from '../../../lib/paths'
import {
  downloadModelFiles,
  hasModelFiles,
  type DownloadOptions,
} from '../../embedding/model-files'
import { sttRunner, type SttRunner } from '../stt-host'
import type { SpeechToTextProvider, TranscribeJob, TranscribeProgress } from '../../types'
import {
  WHISPER_MODELS,
  defaultWhisperModel,
  findWhisperModel,
  whisperFiles,
  type WhisperModel,
} from './models'

export const LOCAL_WHISPER_ID = 'local-whisper'

/** The config used when no provider is routed to `transcribe`. */
export const LOCAL_WHISPER_CONFIG: ProviderConfig = {
  id: LOCAL_WHISPER_ID,
  kind: 'local-whisper',
  label: 'Built-in Whisper',
  options: {},
  enabled: true,
}

export const speechModelsDir = (): string => userDataPath('models')

export function isWhisperDownloaded(model: WhisperModel, modelsDir = speechModelsDir()): boolean {
  return hasModelFiles(modelsDir, model.id, whisperFiles(model))
}

export function downloadWhisperModel(
  model: WhisperModel,
  opts: DownloadOptions = {},
  modelsDir = speechModelsDir(),
): Promise<void> {
  return downloadModelFiles(modelsDir, model.id, whisperFiles(model), model.pin, opts)
}

const notDownloaded = (m: WhisperModel) =>
  new AppError(
    'PROVIDER',
    `The speech model ${m.name} is not downloaded. Download it in Settings › Speech to text.`,
  )

/** The model to use: the one asked for, else a downloaded default, else the default. */
export function pickWhisperModel(requested: string | undefined, modelsDir: string): WhisperModel {
  if (requested) {
    const m = findWhisperModel(requested)
    if (!m) throw new AppError('VALIDATION', `Unknown speech model "${requested}"`)
    return m
  }
  const preferred = defaultWhisperModel(totalmem())
  if (isWhisperDownloaded(preferred, modelsDir)) return preferred
  return WHISPER_MODELS.find((m) => isWhisperDownloaded(m, modelsDir)) ?? preferred
}

export class LocalWhisperProvider implements SpeechToTextProvider {
  readonly kind = 'local-whisper' as const

  constructor(
    readonly config: ProviderConfig,
    private readonly modelsDir: () => string = speechModelsDir,
    private readonly runner: () => Promise<SttRunner> = sttRunner,
  ) {}

  get id(): string {
    return this.config.id
  }

  async listModels(): Promise<ModelInfo[]> {
    return WHISPER_MODELS.filter((m) => isWhisperDownloaded(m, this.modelsDir())).map((m) => ({
      id: m.name,
      label: `${m.name} (${m.label})`,
      kind: 'speech' as const,
      sizeBytes: m.downloadBytes,
    }))
  }

  async health(): Promise<ProviderHealth> {
    const n = (await this.listModels()).length
    return n
      ? { ok: true, message: `${n} speech model${n === 1 ? '' : 's'} downloaded` }
      : { ok: false, message: 'No speech model downloaded yet' }
  }

  async transcribe(
    job: TranscribeJob,
    onWindow: (p: TranscribeProgress) => void | Promise<void>,
  ): Promise<{ language: string; model: string }> {
    const dir = this.modelsDir()
    const model = pickWhisperModel(job.model, dir)
    if (!isWhisperDownloaded(model, dir)) throw notDownloaded(model)
    const runner = await this.runner()
    const result = await runner.transcribe(
      {
        modelsDir: dir,
        model: model.id,
        dtype: model.dtype,
        multilingual: model.multilingual,
        audioPath: job.audioPath,
        fromSec: job.fromSec ?? 0,
        ...(model.multilingual && job.language ? { language: job.language } : {}),
      },
      onWindow,
      job.signal,
    )
    return { language: result.language, model: model.name }
  }
}
