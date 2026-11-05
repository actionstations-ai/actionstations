// Hosted text services reached through the OpenAI-compatible adapter (spec 0447, FR-1). Each
// preset fills the base URL, marks the provider as cloud and suggests a model the user can
// change. Base URLs and suggested models come from each service's own documentation.
import type { ProviderConfig } from './schemas/provider'

export interface HostedPreset {
  /** Saved in `options.preset`. */
  id: string
  label: string
  baseUrl: string
  /** Suggested chat model; the user can change it or load the account's list. Empty = none. */
  defaultModel: string
  /** Suggested model for the Embed task, when the service has an embeddings endpoint. */
  embeddingModel?: string
  hint: string
  /** Options every provider made from this preset starts with. */
  options: Record<string, unknown>
  /** Placeholder shown for the model field. */
  modelPlaceholder?: string
}

/** Options common to every hosted preset: requests leave the computer, no local-model extras. */
const HOSTED_BASE = { network: 'remote', modelProfile: 'off' } as const

const preset = (p: Omit<HostedPreset, 'options'> & { options?: Record<string, unknown> }) => ({
  ...p,
  options: { ...HOSTED_BASE, preset: p.id, ...(p.options ?? {}) },
})

export const HOSTED_PRESETS: readonly HostedPreset[] = [
  preset({
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6.1-terra',
    embeddingModel: 'text-embedding-3-small',
    hint: 'GPT models from OpenAI. Prompts and retrieved document excerpts are sent to OpenAI and billed to your account.',
    options: { maxTokensParam: 'max_completion_tokens' },
  }),
  preset({
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-3.5-flash-lite',
    embeddingModel: 'gemini-embedding-001',
    hint: 'Gemini models through Google’s OpenAI-compatible endpoint. Prompts and excerpts are sent to Google.',
  }),
  preset({
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '~anthropic/claude-sonnet-latest',
    hint: 'One key for many models from many makers. Prompts and excerpts are sent to OpenRouter and the maker you pick.',
    options: {
      headers: {
        'HTTP-Referer': 'https://actionstations.ai',
        'X-OpenRouter-Title': 'Action Stations',
      },
    },
  }),
  preset({
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    hint: 'Mistral models from Mistral AI. Prompts and excerpts are sent to Mistral.',
  }),
  preset({
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    hint: 'Fast hosted open models on Groq. Prompts and excerpts are sent to Groq.',
  }),
  preset({
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash',
    hint: 'DeepSeek models. Prompts and excerpts are sent to DeepSeek.',
  }),
  preset({
    id: 'xai',
    label: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.7',
    hint: 'Grok models from xAI. Prompts and excerpts are sent to xAI.',
  }),
  preset({
    id: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.ai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    hint: 'Hosted open models on Together AI. Prompts and excerpts are sent to Together.',
  }),
  preset({
    id: 'azure-openai',
    label: 'Azure OpenAI',
    baseUrl: 'https://YOUR-RESOURCE.openai.azure.com/openai/v1/',
    defaultModel: '',
    modelPlaceholder: 'Your deployment name',
    hint: 'Models deployed in your own Azure resource. Replace YOUR-RESOURCE with the resource name and use the deployment name as the model.',
    options: { auth: 'api-key' },
  }),
]

export const HOSTED_PRESET_IDS: readonly string[] = HOSTED_PRESETS.map((p) => p.id)

export function hostedPresetById(id: string | undefined): HostedPreset | undefined {
  return HOSTED_PRESETS.find((p) => p.id === id)
}

/** The hosted preset a saved provider was made from, if any. */
export function hostedPresetOf(
  config: Pick<ProviderConfig, 'kind' | 'options'>,
): HostedPreset | undefined {
  if (config.kind !== 'openai-compatible') return undefined
  const id = config.options?.preset
  return typeof id === 'string' ? hostedPresetById(id) : undefined
}
