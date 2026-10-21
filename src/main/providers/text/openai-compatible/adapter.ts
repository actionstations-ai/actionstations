// OpenAI-compatible provider kind: chat (LM Studio, Ollama /v1, vLLM, OpenRouter, OpenAI),
// embeddings, and text-to-speech via /v1/audio/speech (mlx-audio).
import type { AdapterModule } from '../../types'
import { OpenAiCompatibleTextProvider } from './chat'
import { OpenAiCompatibleEmbedder } from './embeddings'
import { OpenAiCompatibleSpeechProvider } from './speech'

export const adapter: AdapterModule = {
  kind: 'openai-compatible',
  createText: (config, secret) => new OpenAiCompatibleTextProvider(config, secret),
  createEmbedding: (config, secret, model) => new OpenAiCompatibleEmbedder(config, secret, model),
  createMedia: (config, secret) => new OpenAiCompatibleSpeechProvider(config, secret),
  localDefaults: [
    { label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' },
    { label: 'vLLM', baseUrl: 'http://127.0.0.1:8000/v1' },
    { label: 'mlx-audio (TTS)', baseUrl: 'http://127.0.0.1:8765/v1' },
  ],
}
