// What the Providers page shows about tasks and provider kinds. Display data only: which
// providers can serve a task comes from main (`providers:task-support`, derived from each
// adapter's capabilities), never from a list kept here.
import type { ProviderKind, ProviderRef, ProviderRouting, ProviderTask } from '@shared/schemas'
import type { ChannelResponse } from '@shared/ipc'
import { pickChatModel } from '@shared/model-names'

export type RoutingView = ChannelResponse<'routing:get'>
export type ProviderViewT = ChannelResponse<'providers:list'>[number]

export interface TaskInfo {
  task: ProviderTask
  label: string
  purpose: string
}

export const TASKS: TaskInfo[] = [
  {
    task: 'ideate',
    label: 'Ideation',
    purpose: 'Brainstorms scenario concepts and threat storylines from your documents.',
  },
  {
    task: 'draft',
    label: 'Drafting',
    purpose: 'Writes the MSEL, injects, controller handbook and player briefing.',
  },
  {
    task: 'critique',
    label: 'Critique',
    purpose: 'Reviews drafts against your plans and the exercise objectives.',
  },
  {
    task: 'translate',
    label: 'Translation',
    purpose:
      'Translates player material into Spanish for a person to review. Uses the model that writes drafts when not set.',
  },
  {
    task: 'roleplay',
    label: 'SimCell replies',
    purpose:
      'Drafts replies from outside parties during play. A person approves every draft. Uses the same model as drafting when not set.',
  },
  {
    task: 'embed',
    label: 'Embeddings',
    purpose: 'Indexes documents for search and generation context.',
  },
  {
    task: 'image',
    label: 'Image',
    purpose: 'Generates photographic scene images (text-bearing media use templates).',
  },
  {
    task: 'video',
    label: 'Video',
    purpose: 'Generates short video clips for injects.',
  },
  {
    task: 'audio',
    label: 'Audio',
    purpose: 'Voices radio calls, voicemails and PA announcements (local TTS servers included).',
  },
  {
    task: 'transcribe',
    label: 'Transcription',
    purpose:
      'Turns hot wash recordings into text on this computer. Only local providers are accepted; without one, the built-in Whisper model is used.',
  },
]

export const KIND_LABELS: Record<ProviderKind, string> = {
  anthropic: 'Anthropic',
  'openai-compatible': 'OpenAI-compatible',
  ollama: 'Ollama',
  comfyui: 'ComfyUI',
  'system-tts': 'System voice',
  template: 'Template',
  'local-whisper': 'Built-in Whisper',
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
    hint: 'Local image and video workflows (and audio, if you import a TTS workflow).',
  },
  {
    id: 'system-tts',
    label: 'System voice',
    kind: 'system-tts',
    baseUrl: '',
    usesKey: false,
    keyRequired: false,
    baseUrlEditable: false,
    hint: 'Offline speech from this computer (macOS say, Windows speech, or espeak-ng on Linux).',
  },
]

/** Kinds that run on this computer without a server address. */
export const kindUsesBaseUrl = (kind: ProviderKind): boolean =>
  kind !== 'anthropic' && kind !== 'mock' && kind !== 'system-tts'

/** Whether an existing provider of this kind shows the key field. */
export const kindUsesKey = (kind: ProviderKind): boolean =>
  kind === 'anthropic' || kind === 'openai-compatible'

export const kindRequiresKey = (kind: ProviderKind): boolean => kind === 'anthropic'

/** Default model for a detected service: never an embedding model while a chat model exists. */
export function pickDefaultModel(s: {
  models: string[]
  chatModels?: string[]
  loadedModels?: string[]
}): string | undefined {
  return pickChatModel(s.chatModels?.length ? s.chatModels : s.models, s.loadedModels)
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
