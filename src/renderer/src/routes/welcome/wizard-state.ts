// Pure helpers for the first-run setup wizard (#48), kept out of components for tests.
import type {
  AppSettings,
  ProviderKind,
  ProviderRef,
  ProviderRouting,
  ProviderTask,
} from '@shared/schemas'
import type { ChannelResponse } from '@shared/ipc'
import { looksLikeEmbeddingModel, pickChatModel } from '@shared/model-names'

export type ProviderViewT = ChannelResponse<'providers:list'>[number]
export type LocalService = ChannelResponse<'providers:detect-local'>[number]

export const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'runtime', label: 'Where models run' },
  { id: 'text', label: 'Text model' },
  { id: 'media', label: 'Media' },
  { id: 'search', label: 'Search quality' },
  { id: 'project', label: 'First project' },
] as const
export type StepId = (typeof STEPS)[number]['id'] | 'done'

export const TEXT_TASKS: ProviderTask[] = ['ideate', 'draft', 'critique']
export const TEXT_KINDS: ProviderKind[] = ['anthropic', 'openai-compatible', 'ollama', 'mock']
export const TTS_DEFAULT_URL = 'http://127.0.0.1:8765/v1'
export const TTS_LABEL = 'Local voice (TTS)'
export const LOCAL_EMBED_MODEL = 'Xenova/bge-small-en-v1.5'
export const LOCAL_EMBED_SIZE = '133 MB'

const STORAGE_KEY = 'ttx.onboarding'

export interface WizardProgress {
  step: StepId
  projectPath?: string
}

/** First run: setup not finished and nothing configured yet (existing users skip the wizard). */
export function shouldOnboard(settings: AppSettings): boolean {
  if (settings.onboardingComplete) return false
  const realProviders = settings.providers.filter((p) => p.kind !== 'mock')
  return settings.recentProjects.length === 0 && realProviders.length === 0
}

const isStep = (v: unknown): v is StepId => v === 'done' || STEPS.some((s) => s.id === v)

/** Where the user left the wizard. Storage may be unavailable; fall back to the start. */
export function loadProgress(): WizardProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      const { step, projectPath } = parsed as Record<string, unknown>
      if (isStep(step)) return { step, ...(typeof projectPath === 'string' ? { projectPath } : {}) }
    }
  } catch {
    // Unreadable storage: start over.
  }
  return { step: 'welcome' }
}

export function saveProgress(progress: WizardProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Resume is a convenience; ignore storage failures.
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore.
  }
}

export function nextStep(step: StepId): StepId {
  const i = STEPS.findIndex((s) => s.id === step)
  return i < 0 || i === STEPS.length - 1 ? 'done' : STEPS[i + 1]!.id
}

export function previousStep(step: StepId): StepId {
  if (step === 'done') return STEPS[STEPS.length - 1]!.id
  const i = STEPS.findIndex((s) => s.id === step)
  return i <= 0 ? 'welcome' : STEPS[i - 1]!.id
}

/** Replace the given tasks in a routing table, keeping every other task as it was. */
export function routeTasks(
  routing: ProviderRouting,
  tasks: ProviderTask[],
  ref: ProviderRef,
): ProviderRouting {
  const next: ProviderRouting = { ...routing }
  for (const t of tasks) next[t] = { ...ref }
  return next
}

export const isTtsProvider = (p: ProviderViewT): boolean =>
  p.kind === 'openai-compatible' && typeof p.options['ttsModel'] === 'string'

/** Providers that can write text (excludes a voice server added as OpenAI-compatible). */
export function textProviders(providers: ProviderViewT[]): ProviderViewT[] {
  return providers.filter((p) => TEXT_KINDS.includes(p.kind) && !isTtsProvider(p))
}

/** Chat models of a detected service, best default first; embedding models never appear. */
export function serviceChatModels(s: Pick<LocalService, 'models' | 'chatModels'>): string[] {
  const listed = s.chatModels.length ? s.chatModels : s.models
  return listed.filter((m) => !looksLikeEmbeddingModel(m))
}

/** Default for a detected service: a loaded chat model, else the best chat model. */
export const defaultServiceModel = (s: LocalService): string | undefined =>
  pickChatModel(serviceChatModels(s), s.loadedModels)

export { pickChatModel }

/** Prefer a general speech model over one that needs a voice description. */
export function pickTtsModel(models: string[]): string | undefined {
  const speech = models.filter((m) => /tts|voxcpm|kokoro|speech|voice/i.test(m))
  return speech.find((m) => !/voicedesign/i.test(m)) ?? speech[0] ?? models[0]
}

export const isTextService = (s: LocalService): boolean =>
  s.kind === 'openai-compatible' || s.kind === 'ollama'

export const findAdded = (
  providers: ProviderViewT[],
  s: Pick<LocalService, 'kind' | 'baseUrl'>,
): ProviderViewT | undefined => providers.find((p) => p.kind === s.kind && p.baseUrl === s.baseUrl)

export function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
}

export interface TextChoice {
  providerId: string
  model: string
}

/** The provider already routed to drafting (with its model), else the first candidate. */
export function defaultTextChoice(
  candidates: ProviderViewT[],
  routed: ProviderRef | undefined,
): TextChoice | null {
  const p = candidates.find((c) => c.id === routed?.providerId) ?? candidates[0]
  if (!p) return null
  const model = routed?.providerId === p.id ? (routed.model ?? p.defaultModel) : p.defaultModel
  return { providerId: p.id, model: model ?? '' }
}

export interface Assignment {
  tasks: ProviderTask[]
  ref: ProviderRef
}

/** Routing for the media step: ComfyUI → image + video, voice server → audio (with its model). */
export function mediaAssignments(
  comfy: ProviderViewT | undefined,
  voice: ProviderViewT | undefined,
  use: { comfy: boolean; voice: boolean },
): Assignment[] {
  const out: Assignment[] = []
  if (comfy && use.comfy) out.push({ tasks: ['image', 'video'], ref: { providerId: comfy.id } })
  if (voice && use.voice) {
    const model = voice.options['ttsModel']
    out.push({
      tasks: ['audio'],
      ref: { providerId: voice.id, ...(typeof model === 'string' && model ? { model } : {}) },
    })
  }
  return out
}

/**
 * data: URL → blob: URL. The renderer CSP allows media from blob: (not data:), and a blob URL
 * keeps the base64 string out of the DOM.
 */
export function dataUrlToBlobUrl(dataUrl: string): string {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error('Unexpected audio data')
  const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: match[1] }))
}
