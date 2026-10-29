// ComfyUI workflows (#32, #33): status vs /object_info, workflow store, bindings, per-media
// defaults and a one-off test render for the Workflows page.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { defineHandlers } from '../registry'
import { AppError } from '../../lib/errors'
import { userDataPath } from '../../lib/paths'
import { requireProject } from '../../project/guard'
import { isRemoteProvider } from '@shared/provider-network'
import { configFor, connectionTestMediaProvider, mediaProviderFor } from '../../providers/resolve'
import { ComfyMediaProvider } from '../../providers/media/comfyui/provider'
import {
  deleteWorkflow,
  getDefaults,
  importWorkflow,
  listWorkflows,
  loadWorkflow,
  saveBindings,
  setDefaults,
  updateWorkflowFromPack,
  workflowInputs,
} from '../../comfy/store'
import { ensurePacksLoaded } from '../../packs/state'

const STATUS_TIMEOUT_MS = 60_000
const TEST_RENDER_TIMEOUT_MS = 60 * 60_000
const MAX_PREVIEW_BYTES = 40 * 1024 * 1024
const TEST_PROMPT =
  'busy airport terminal concourse in the afternoon, travelers with rolling suitcases, large windows, airline staff at a gate desk'

/** projectPath is optional on these channels; when present it must pass the project guard. */
const projectRoot = async (projectPath?: string): Promise<string | undefined> =>
  projectPath ? requireProject(projectPath) : undefined

async function comfyProvider(providerId: string): Promise<ComfyMediaProvider> {
  const config = await configFor(providerId)
  if (config.kind !== 'comfyui')
    throw new AppError('VALIDATION', `"${config.label}" is not a ComfyUI provider`)
  // Test renders and workflow checks on the Workflows page: no project content (#433).
  const provider = await connectionTestMediaProvider(config)
  if (!(provider instanceof ComfyMediaProvider))
    throw new AppError('INTERNAL', 'ComfyUI adapter is not available')
  return provider
}

const SAMPLE_IMAGE = join('comfy', 'test-renders', 'last-image.png')

/** The most recent test-render image, used as the input for an image-to-video test. */
async function sampleImage(): Promise<string | undefined> {
  const p = userDataPath(SAMPLE_IMAGE)
  return (await fs.stat(p).catch(() => undefined)) ? p : undefined
}

export default defineHandlers({
  'comfy:status': async ({ providerId }) => {
    const provider = await comfyProvider(providerId)
    const signal = AbortSignal.timeout(STATUS_TIMEOUT_MS)
    const health = await provider.health(signal)
    if (!health.ok) return { ok: false, message: health.message, workflows: [] }
    await provider.nodeClasses(signal)
    const workflows = (await listWorkflows()).map((w) => ({
      id: w.id,
      missingNodes: w.missingNodes ?? [],
    }))
    return { ok: true, message: health.message, system: health.details ?? {}, workflows }
  },
  'comfy:workflows:list': async ({ projectPath }) => listWorkflows(await projectRoot(projectPath)),
  'comfy:workflows:import': async ({ projectPath, filePath, name, mediaType }) => {
    const root = await projectRoot(projectPath)
    return importWorkflow({ filePath, name, mediaType, ...(root ? { projectRoot: root } : {}) })
  },
  'comfy:workflows:save-bindings': async ({ id, projectPath, bindings }) => {
    const root = await projectRoot(projectPath)
    return saveBindings({ id, bindings, ...(root ? { projectRoot: root } : {}) })
  },
  'comfy:workflows:delete': async ({ id, projectPath }) =>
    deleteWorkflow(id, await projectRoot(projectPath)),
  'comfy:workflows:updateFromPack': async ({ id, projectPath, confirmEdited }) => {
    await ensurePacksLoaded()
    const root = await requireProject(projectPath)
    return updateWorkflowFromPack(id, root, { confirmEdited: confirmEdited ?? false })
  },
  'comfy:workflows:inputs': async ({ id, projectPath }) =>
    workflowInputs(id, await projectRoot(projectPath)),
  'comfy:defaults:get': async () => getDefaults(),
  'comfy:defaults:set': async (next) => setDefaults(next),
  'comfy:test-render': async ({ providerId, workflowId, projectPath, prompt }) => {
    const root = await projectRoot(projectPath)
    const provider = await comfyProvider(providerId)
    const { entry } = await loadWorkflow(workflowId, root)
    const outDir = root
      ? join(root, '.cache', 'comfy-test')
      : userDataPath('comfy', 'test-renders', `${Date.now()}`)
    const inputImagePath = entry.mediaType === 'video' ? await sampleImage() : undefined
    if (entry.mediaType === 'video' && !inputImagePath)
      throw new AppError(
        'VALIDATION',
        'Run a test render of an image workflow first; video tests animate it.',
      )
    const text = prompt?.trim() || TEST_PROMPT
    const started = Date.now()
    // A cloud ComfyUI gets the prompt (which the user may have typed) through the outbound gate.
    const generator = isRemoteProvider(provider.config)
      ? await mediaProviderFor(provider.config)
      : provider
    const [out] = await generator.generate({
      kind: entry.mediaType,
      injectId: 'test',
      workflowId,
      outDir,
      ...(inputImagePath ? { inputImagePath } : {}),
      brief: {
        paths: [entry.mediaType === 'video' ? 'ai_video' : 'ai_image'],
        imagePrompt: text,
        videoPrompt: text,
        durationSec: 3,
        voiceLines: [{ speaker: 'Ops', voiceStyle: '', text: 'Test transmission, one two three.' }],
      },
      signal: AbortSignal.timeout(TEST_RENDER_TIMEOUT_MS),
    })
    if (!out) throw new AppError('PROVIDER', 'The workflow produced no output')
    const bytes = await fs.readFile(out.filePath)
    if (bytes.length > MAX_PREVIEW_BYTES)
      throw new AppError('VALIDATION', `Output is too large to preview (${bytes.length} bytes)`)
    if (out.kind === 'image') {
      await fs.mkdir(userDataPath('comfy', 'test-renders'), { recursive: true })
      await fs.copyFile(out.filePath, userDataPath(SAMPLE_IMAGE))
    }
    return {
      mimeType: out.mimeType,
      dataUrl: `data:${out.mimeType};base64,${bytes.toString('base64')}`,
      ...(out.provenance.seed !== undefined ? { seed: out.provenance.seed } : {}),
      elapsedMs: Date.now() - started,
      ...(out.provenance.workflowHash ? { workflowHash: out.provenance.workflowHash } : {}),
    }
  },
})
