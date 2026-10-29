// OpenAI-compatible provider kind: chat (LM Studio, Ollama /v1, vLLM, OpenRouter, OpenAI),
// embeddings, text-to-speech via /v1/audio/speech (mlx-audio), and speech to text via
// /v1/audio/transcriptions for servers on this computer only (#425).
import type { AdapterModule } from '../../types'
import { OpenAiCompatibleTextProvider } from './chat'
import { OpenAiCompatibleEmbedder } from './embeddings'
import { OpenAiCompatibleSpeechProvider } from './speech'
import { OpenAiCompatibleTranscriber } from './transcribe'

export const adapter: AdapterModule = {
  kind: 'openai-compatible',
  createText: (config, secret) => new OpenAiCompatibleTextProvider(config, secret),
  createEmbedding: (config, secret, model) => new OpenAiCompatibleEmbedder(config, secret, model),
  createMedia: (config, secret) => new OpenAiCompatibleSpeechProvider(config, secret),
  createSpeechToText: (config, secret) => new OpenAiCompatibleTranscriber(config, secret),
  localDefaults: [
    { label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' },
    { label: 'vLLM', baseUrl: 'http://127.0.0.1:8000/v1' },
    { label: 'mlx-audio (TTS)', baseUrl: 'http://127.0.0.1:8765/v1' },
  ],
}
