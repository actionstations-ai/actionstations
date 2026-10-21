import type { EmbeddingSettings, EmbeddingStatus } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { jobs } from '../../jobs/manager'
import { requireProject } from '../../project/guard'
import { activeEmbedder, modelsDir, openIndex } from '../../retrieve'
import { getSettings } from '../../settings/store'
import {
  DEFAULT_LOCAL_MODEL,
  assertModelId,
  downloadModel,
  isModelDownloaded,
  modelDims,
} from '../../providers/embedding/local-onnx'
import { toAppError } from '../../lib/errors'

function localStatus(model: string): EmbeddingStatus {
  const downloaded = isModelDownloaded(modelsDir(), model)
  return {
    mode: 'local-onnx',
    model,
    dims: modelDims(model),
    ready: downloaded,
    downloaded,
    ...(downloaded ? {} : { message: 'Model not downloaded yet' }),
  }
}

async function providerStatus(settings: EmbeddingSettings): Promise<EmbeddingStatus> {
  try {
    const e = await activeEmbedder()
    return { mode: 'provider', model: e.model, dims: e.dims, ready: true, downloaded: false }
  } catch (err) {
    const message = toAppError(err).message
    return {
      mode: 'provider',
      model: settings.model,
      dims: 0,
      ready: false,
      downloaded: false,
      message,
    }
  }
}

export async function embeddingStatus(): Promise<EmbeddingStatus> {
  const { embeddings } = await getSettings()
  if (embeddings.mode === 'local-onnx') return localStatus(embeddings.model)
  if (embeddings.mode === 'provider') return providerStatus(embeddings)
  const e = await activeEmbedder()
  return {
    mode: 'hash',
    model: e.model,
    dims: e.dims,
    ready: true,
    downloaded: false,
    message: 'Built-in keyword-hash embeddings (offline)',
  }
}

/** The local model to download: the configured one in local-onnx mode, else the default. */
async function modelToDownload(): Promise<string> {
  const { embeddings } = await getSettings()
  const model = embeddings.mode === 'local-onnx' ? embeddings.model : DEFAULT_LOCAL_MODEL
  assertModelId(model)
  return model
}

export default defineHandlers({
  'retrieve:search': async ({ projectPath, query, k, mode, documentIds }) => {
    const root = await requireProject(projectPath)
    const index = await openIndex(root)
    return index.search(query, { k, mode, ...(documentIds ? { documentIds } : {}) })
  },
  'embeddings:status': () => embeddingStatus(),
  'embeddings:download-model': async () => {
    const model = await modelToDownload()
    const job = jobs.start(
      'embed-model-download',
      async (ctx) => {
        ctx.progress(0, `Downloading ${model}`)
        await downloadModel(modelsDir(), model, (p) => {
          const mb = (n: number): string => (n / 1e6).toFixed(1)
          ctx.progress(
            p.progress,
            `${p.file ?? model}: ${mb(p.loadedBytes)} / ${mb(p.totalBytes)} MB`,
          )
        })
        ctx.log(`Downloaded ${model}`)
        return { model }
      },
      { payload: { model } },
    )
    return { jobId: job.id }
  },
})
