// Recommended models for this machine (ADR-0021) and pulling one through the tool's own
// mechanism: Ollama's pull API (via the provider-neutral model-pull entry), `lms get`, or a
// verified download into the folder a running ComfyUI reports. Ids come from this list only.
import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { HardwareView, RecommendedModel } from '@shared/schemas/setup'
import { AppError } from '../lib/errors'
import { pullProviderModel } from '../providers/model-pull'
import { MODEL_HOSTS } from './catalog'
import { downloadFile, type HostPolicy } from './fetch'
import type { Running } from './detect'
import { runCommand, type Runner } from './run'

const GB = 1e9

/** ComfyUI model folders the recommended models go into. */
export const COMFY_FOLDERS = ['checkpoints', 'text_encoders', 'diffusion_models', 'vae'] as const
export type ComfyFolder = (typeof COMFY_FOLDERS)[number]

export interface ComfyFile {
  repo: string
  /** Pinned Hugging Face revision (commit). */
  revision: string
  file: string
  /** Path inside the repository when it is not `file` at its root. */
  repoPath?: string
  folder: ComfyFolder
  sha256: string
  sizeBytes: number
}

export interface ModelDef extends Omit<RecommendedModel, 'installed' | 'needsRunning'> {
  /** Smallest budget this model is offered for. */
  minBudget: number
  /** Offered only below this budget (the tiers do not overlap). */
  maxBudget?: number
  /** Needs a GPU (or Apple Silicon) to be useful. */
  gpuOnly?: boolean
  files?: ComfyFile[]
}

// Text tiers measured from the Ollama registry manifests on 2026-10-24. The benchmark report
// (#434, scripts/bench/report.mjs) recommends a model per tier from these bounds.
export const TEXT_TIERS = [
  { min: 72, max: Infinity, ollama: ['gpt-oss:120b', 65.37], lms: 'openai/gpt-oss-120b' },
  { min: 24, max: 72, ollama: ['qwen3:30b', 18.56], lms: 'qwen/qwen3-30b-a3b-2507' },
  { min: 10, max: 24, ollama: ['qwen3.5:9b', 6.55], lms: 'qwen/qwen3.5-9b' },
  { min: 0, max: 10, ollama: ['qwen3.5:4b', 3.32], lms: 'qwen/qwen3.5-4b' },
] as const

const SDXL: ComfyFile = {
  repo: 'stabilityai/stable-diffusion-xl-base-1.0',
  revision: '462165984030d82259a11f4367a4eed129e94a7b',
  file: 'sd_xl_base_1.0.safetensors',
  folder: 'checkpoints',
  sha256: '31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b',
  sizeBytes: 6_938_078_334,
}
const LTXV: ComfyFile = {
  repo: 'Lightricks/LTX-Video',
  revision: '8984fa25007f376c1a299016d0957a37a2f797bb',
  file: 'ltxv-2b-0.9.8-distilled.safetensors',
  folder: 'checkpoints',
  sha256: '76aa8c4786af752fa6f951947129d5290c3c6c0b2fadcadea6b5e114ae2cad8f',
  sizeBytes: 6_340_744_492,
}
const T5: ComfyFile = {
  repo: 'comfyanonymous/flux_text_encoders',
  revision: '6af2a98e3f615bdfa612fbd85da93d1ed5f69ef5',
  file: 't5xxl_fp16.safetensors',
  folder: 'text_encoders',
  sha256: '6e480b09fae049a72d2a8c5fbccb8d3e92febeb233bbe9dfe7256958a9167635',
  sizeBytes: 9_787_841_024,
}

// FLUX.2 [klein] 4B (#356): the optional instruction edit of sdxl-photo's blank-screen scenes.
const KLEIN: ComfyFile = {
  repo: 'black-forest-labs/FLUX.2-klein-4B',
  revision: 'e7b7dc27f91deacad38e78976d1f2b499d76a294',
  file: 'flux-2-klein-4b.safetensors',
  folder: 'diffusion_models',
  sha256: 'ec3d4e733a771f61c052fb4856c48b336c55eaf2c65487c2a1faeb9bbda7a343',
  sizeBytes: 7_751_105_712,
}
const QWEN3_4B: ComfyFile = {
  repo: 'Comfy-Org/Z-Image-Turbo',
  revision: '6fc90a3b1b653e935a0d175e260736de25b84df5',
  file: 'qwen_3_4b.safetensors',
  repoPath: 'split_files/text_encoders/qwen_3_4b.safetensors',
  folder: 'text_encoders',
  sha256: '6c671498573ac2f7a5501502ccce8d2b08ea6ca2f661c458e708f36b36edfc5a',
  sizeBytes: 8_044_982_048,
}
const FLUX2_VAE: ComfyFile = {
  repo: 'Comfy-Org/Flux-2-Dev',
  revision: 'be27b9cf1b7212b3a281c2abbd9ecf6985242bb8',
  file: 'flux2-vae.safetensors',
  repoPath: 'split_files/vae/flux2-vae.safetensors',
  folder: 'vae',
  sha256: 'd64f3a68e1cc4f9f4e29b6e0da38a0204fe9a49f2d4053f0ec1fa1ca02f9c4b5',
  sizeBytes: 336_213_556,
}

export const MODEL_DEFS: ModelDef[] = [
  ...TEXT_TIERS.flatMap((t): ModelDef[] => [
    {
      id: `ollama:${t.ollama[0]}`,
      tool: 'ollama',
      role: 'text',
      name: t.ollama[0],
      sizeBytes: Math.round(t.ollama[1] * GB),
      approximate: false,
      license: 'Apache-2.0',
      minBudget: t.min * GB,
      maxBudget: t.max * GB,
    },
    {
      id: `lmstudio:${t.lms}`,
      tool: 'lmstudio',
      role: 'text',
      name: t.lms,
      sizeBytes: Math.round(t.ollama[1] * GB),
      approximate: true,
      license: 'Apache-2.0',
      note: 'LM Studio picks the variant (MLX or GGUF) for this machine; the size is approximate.',
      minBudget: t.min * GB,
      maxBudget: t.max * GB,
    },
  ]),
  {
    id: 'ollama:nomic-embed-text',
    tool: 'ollama',
    role: 'embedding',
    name: 'nomic-embed-text',
    sizeBytes: 274_302_450,
    approximate: false,
    license: 'Apache-2.0',
    note: 'For document search (Settings → Embeddings → Configured provider).',
    minBudget: 0,
  },
  {
    id: 'comfyui:sdxl-base-1.0',
    tool: 'comfyui',
    role: 'image',
    name: 'SDXL base 1.0',
    sizeBytes: SDXL.sizeBytes,
    approximate: false,
    license: 'CreativeML Open RAIL++-M',
    note: 'Used by the default image workflow (sdxl-photo).',
    minBudget: 8 * GB,
    gpuOnly: true,
    files: [SDXL],
  },
  {
    id: 'comfyui:ltxv-2b-0.9.8',
    tool: 'comfyui',
    role: 'video',
    name: 'LTX-Video 2B 0.9.8 distilled + T5-XXL text encoder',
    sizeBytes: LTXV.sizeBytes + T5.sizeBytes,
    approximate: false,
    license: 'LTX-Video Open Weights License; T5-XXL: Apache-2.0',
    note: 'Used by the default video workflow (image-to-video).',
    minBudget: 16 * GB,
    gpuOnly: true,
    files: [LTXV, T5],
  },
  {
    id: 'comfyui:flux2-klein-4b',
    tool: 'comfyui',
    role: 'image',
    name: 'FLUX.2 [klein] 4B + Qwen3 4B text encoder + FLUX.2 VAE',
    sizeBytes: KLEIN.sizeBytes + QWEN3_4B.sizeBytes + FLUX2_VAE.sizeBytes,
    approximate: false,
    license: 'Apache-2.0',
    note: 'Optional: the default image workflow (sdxl-photo) uses it to switch off screens and signs in blank-screen scenes.',
    minBudget: 32 * GB,
    gpuOnly: true,
    files: [KLEIN, QWEN3_4B, FLUX2_VAE],
  },
]

/** What is already on the machine, from the running tools. */
export interface InstalledModels {
  ollama: string[]
  lmstudio: string[]
  /** "checkpoints/sd_xl_base_1.0.safetensors" etc. */
  comfy: string[]
}

const ollamaHas = (have: string[], tag: string): boolean =>
  have.some((m) => m === tag || m === `${tag}:latest`)

function isInstalled(def: ModelDef, have: InstalledModels): boolean {
  if (def.tool === 'ollama') return ollamaHas(have.ollama, def.name)
  if (def.tool === 'lmstudio') {
    const short = def.name.split('/').pop() ?? def.name
    return have.lmstudio.some((m) => m === def.name || m.includes(short))
  }
  return (def.files ?? []).every((f) => have.comfy.includes(`${f.folder}/${f.file}`))
}

/** The models to offer on this machine, with what is already installed marked. */
export function recommendModels(hw: HardwareView, have: InstalledModels): RecommendedModel[] {
  return MODEL_DEFS.filter(
    (d) =>
      hw.budgetBytes >= d.minBudget &&
      hw.budgetBytes < (d.maxBudget ?? Infinity) &&
      (!d.gpuOnly || hw.gpu),
  ).map((d) => ({
    id: d.id,
    tool: d.tool,
    role: d.role,
    name: d.name,
    sizeBytes: d.sizeBytes,
    approximate: d.approximate,
    license: d.license,
    ...(d.note
      ? {
          note: hw.gpu || d.role === 'embedding' ? d.note : `${d.note} Runs on the CPU here: slow.`,
        }
      : hw.gpu
        ? {}
        : { note: 'Runs on the CPU here: slow.' }),
    installed: isInstalled(d, have),
    needsRunning: d.tool !== 'lmstudio',
  }))
}

/** Installed model lists from the probes (and ComfyUI's model folders when it runs). */
export async function installedModels(
  running: Running,
  fetchImpl: typeof fetch,
): Promise<InstalledModels> {
  const svc = (label: string) => running.services.find((s) => s.label === label && s.reachable)
  const comfy: string[] = []
  const comfyUrl = running.urls.comfyui
  if (comfyUrl) {
    for (const folder of COMFY_FOLDERS) {
      try {
        const res = await fetchImpl(`${comfyUrl}/models/${folder}`, {
          signal: AbortSignal.timeout(1500),
        })
        const list = res.ok ? ((await res.json()) as unknown) : []
        if (Array.isArray(list))
          for (const f of list) if (typeof f === 'string') comfy.push(`${folder}/${f}`)
      } catch {
        // Not listed: treated as not installed.
      }
    }
  }
  return { ollama: svc('Ollama')?.models ?? [], lmstudio: svc('LM Studio')?.models ?? [], comfy }
}

export function modelDef(id: string): ModelDef {
  const def = MODEL_DEFS.find((d) => d.id === id)
  if (!def) throw new AppError('NOT_FOUND', `Unknown recommended model "${id}"`)
  return def
}

export interface PullContext {
  signal: AbortSignal
  progress: (fraction: number, message: string) => void
  running: Running
  lms?: string
  run?: Runner
  fetchImpl?: typeof fetch
  /** Tests only: allow the local fixture server. */
  policy?: HostPolicy
  /** Tests only: where ComfyUI's model folders are (instead of asking ComfyUI). */
  comfyFolders?: Partial<Record<ComfyFolder, string>>
  /** Tests only: where a model file is served from. */
  fileUrl?: (f: ComfyFile) => string
}

/** "45%" / "45.2 %" in lms output. */
export function parsePercent(text: string): number | undefined {
  const all = [...text.matchAll(/(\d{1,3}(?:\.\d+)?)\s?%/g)]
  const last = all.at(-1)?.[1]
  const n = last === undefined ? NaN : Number(last)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : undefined
}

async function pullOllama(def: ModelDef, ctx: PullContext): Promise<void> {
  const baseUrl = ctx.running.urls.ollama
  if (!baseUrl) throw new AppError('VALIDATION', 'Start Ollama first, then download the model.')
  const config = {
    id: 'setup-ollama',
    kind: 'ollama' as const,
    label: 'Ollama',
    baseUrl,
    options: {},
    enabled: true,
  }
  await pullProviderModel(
    config,
    def.name,
    (p) => ctx.progress(p.fraction ?? 0, `${def.name}: ${p.status}`),
    ctx.signal,
  )
}

async function pullLms(def: ModelDef, ctx: PullContext): Promise<void> {
  if (!ctx.lms)
    throw new AppError(
      'VALIDATION',
      'Open LM Studio once so its lms command is set up, then try again.',
    )
  const res = await (ctx.run ?? runCommand)(ctx.lms, ['get', def.name, '--yes'], {
    signal: ctx.signal,
    onOutput: (t) => {
      const f = parsePercent(t)
      if (f !== undefined) ctx.progress(f, `${def.name}: ${Math.round(f * 100)}%`)
    },
  })
  if (res.code !== 0)
    throw new AppError(
      'PROVIDER',
      `lms get failed: ${(res.stderr || res.stdout).trim().slice(-300)}`,
    )
}

async function comfyFolder(folder: ComfyFolder, ctx: PullContext): Promise<string> {
  const given = ctx.comfyFolders?.[folder]
  if (given) return given
  const url = ctx.running.urls.comfyui
  if (!url) throw new AppError('VALIDATION', 'Start ComfyUI first, then download the model.')
  const res = await (ctx.fetchImpl ?? fetch)(`${url}/internal/folder_paths`, {
    signal: AbortSignal.timeout(3000),
  })
  const paths = res.ok ? ((await res.json()) as Record<string, unknown>) : {}
  const list = paths[folder]
  const first = Array.isArray(list)
    ? list.find((p): p is string => typeof p === 'string')
    : undefined
  if (!first || !isAbsolute(first))
    throw new AppError('PROVIDER', `ComfyUI did not report its ${folder} folder.`)
  return first
}

export const huggingFaceUrl = (f: ComfyFile): string =>
  `https://huggingface.co/${f.repo}/resolve/${f.revision}/${f.repoPath ?? f.file}`

async function pullComfy(def: ModelDef, ctx: PullContext): Promise<void> {
  const files = def.files ?? []
  const total = files.reduce((n, f) => n + f.sizeBytes, 0)
  let done = 0
  for (const f of files) {
    const dir = await comfyFolder(f.folder, ctx)
    await fs.mkdir(dir, { recursive: true })
    const dest = join(dir, f.file)
    const present = await fs
      .stat(dest)
      .then((s) => s.size === f.sizeBytes)
      .catch(() => false)
    if (!present) {
      await downloadFile(
        {
          url: ctx.fileUrl?.(f) ?? huggingFaceUrl(f),
          policy: ctx.policy ?? { hosts: MODEL_HOSTS },
          maxBytes: f.sizeBytes,
          expectedSha256: f.sha256,
          dest,
        },
        {
          signal: ctx.signal,
          ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
          onProgress: (p) =>
            ctx.progress(
              (done + p.receivedBytes) / total,
              `${f.file}: ${(p.receivedBytes / GB).toFixed(2)} / ${(f.sizeBytes / GB).toFixed(2)} GB`,
            ),
        },
      )
    }
    done += f.sizeBytes
  }
}

/** Pull one recommended model through its tool. */
export function pullModel(def: ModelDef, ctx: PullContext): Promise<void> {
  if (def.tool === 'ollama') return pullOllama(def, ctx)
  if (def.tool === 'lmstudio') return pullLms(def, ctx)
  return pullComfy(def, ctx)
}
