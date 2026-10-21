// What the Providers page knows about tasks and provider kinds. Display data only; the main
// process is the authority on what an adapter can actually do.
import type { ProviderKind, ProviderRef, ProviderRouting, ProviderTask } from '@shared/schemas'
import type { ChannelResponse } from '@shared/ipc'

export type RoutingView = ChannelResponse<'routing:get'>
export type ProviderViewT = ChannelResponse<'providers:list'>[number]

export interface TaskInfo {
  task: ProviderTask
  label: string
  purpose: string
  kinds: ProviderKind[]
}

const TEXT_KINDS: ProviderKind[] = ['anthropic', 'openai-compatible', 'ollama', 'mock']

export const TASKS: TaskInfo[] = [
  {
    task: 'ideate',
    label: 'Ideation',
    purpose: 'Brainstorms scenario concepts and threat storylines from your documents.',
    kinds: TEXT_KINDS,
  },
  {
    task: 'draft',
    label: 'Drafting',
    purpose: 'Writes the MSEL, injects, controller handbook and player briefing.',
    kinds: TEXT_KINDS,
  },
  {
    task: 'critique',
    label: 'Critique',
    purpose: 'Reviews drafts against your plans and the exercise objectives.',
    kinds: TEXT_KINDS,
  },
  {
    task: 'embed',
    label: 'Embeddings',
    purpose: 'Indexes documents for search when embedding mode is "Configured provider".',
    kinds: ['openai-compatible', 'ollama', 'mock'],
  },
  {
    task: 'image',
    label: 'Image',
    purpose: 'Generates photographic scene images (text-bearing media use templates).',
    kinds: ['comfyui', 'mock'],
  },
  {
    task: 'video',
    label: 'Video',
    purpose: 'Generates short video clips for injects.',
    kinds: ['comfyui', 'mock'],
  },
  {
    task: 'audio',
    label: 'Audio',
    purpose: 'Voices radio calls, voicemails and PA announcements.',
    kinds: ['system-tts', 'comfyui', 'mock'],
  },
]

export const KIND_LABELS: Record<ProviderKind, string> = {
  anthropic: 'Anthropic',
  'openai-compatible': 'OpenAI-compatible',
  ollama: 'Ollama',
  comfyui: 'ComfyUI',
  'system-tts': 'System voice',
  template: 'Template',
  mock: 'Mock',
}

export interface Preset {
  id: string
  label: string
  kind: ProviderKind
  baseUrl: string
  /** Show the key field at all. */
  usesKey: boolean
  keyRequired: boolean
  baseUrlEditable: boolean
  hint: string
}

export const PRESETS: Preset[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    kind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:1234/v1',
    usesKey: false,
    keyRequired: false,
    baseUrlEditable: true,
    hint: 'Local models served by LM Studio. Nothing leaves this computer.',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    usesKey: false,
    keyRequired: false,
    baseUrlEditable: true,
    hint: 'Local models served by Ollama. Nothing leaves this computer.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    usesKey: true,
    keyRequired: true,
    baseUrlEditable: false,
    hint: 'Claude models. Prompts and retrieved document excerpts are sent to Anthropic.',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    kind: 'openai-compatible',
    baseUrl: '',
    usesKey: true,
    keyRequired: false,
    baseUrlEditable: true,
    hint: 'Any server that speaks the OpenAI chat API (vLLM, llama.cpp, hosted gateways).',
  },
  {
    id: 'comfyui',
    label: 'ComfyUI',
    kind: 'comfyui',
    baseUrl: 'http://127.0.0.1:8188',
    usesKey: false,
    keyRequired: false,
    baseUrlEditable: true,
    hint: 'Local image, video and audio workflows.',
  },
]

/** Whether an existing provider of this kind shows the key field. */
export const kindUsesKey = (kind: ProviderKind): boolean =>
  kind === 'anthropic' || kind === 'openai-compatible'

export const kindRequiresKey = (kind: ProviderKind): boolean => kind === 'anthropic'

/** Prefer a chat model over an embedding model when picking a default. */
export function pickDefaultModel(models: string[]): string | undefined {
  return models.find((m) => !/embed/i.test(m)) ?? models[0]
}

/** Drop empty rows; trim models; omit model when blank. */
export function cleanRouting(draft: Partial<Record<ProviderTask, ProviderRef>>): ProviderRouting {
  const out: ProviderRouting = {}
  for (const { task } of TASKS) {
    const ref = draft[task]
    if (!ref?.providerId) continue
    const model = ref.model?.trim()
    out[task] = { providerId: ref.providerId, ...(model ? { model } : {}) }
  }
  return out
}
