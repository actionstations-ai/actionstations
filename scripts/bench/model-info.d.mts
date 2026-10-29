// Types for scripts/bench/model-info.mjs (tests/scripts/bench-run.test.ts).
export const DEFAULT_BASE_URLS: { lmstudio: string; ollama: string }
export interface ModelRef {
  ref: string
  tool: 'lmstudio' | 'ollama' | 'mock'
  name: string
  baseUrl?: string
}
export function assertLocalEndpoint(url: string): URL
export function parseModelRef(
  ref: string,
  baseUrl?: string,
  env?: Record<string, string | undefined>,
): ModelRef
export function providerConfig(
  model: ModelRef,
  seed: number,
  contextLength: number,
): {
  kind: string
  label: string
  baseUrl?: string
  defaultModel: string
  options: Record<string, unknown>
  enabled: boolean
}
export type GetJson = (url: string, init?: RequestInit) => Promise<unknown>
export function modelInfo(
  model: ModelRef,
  contextLength: number,
  get?: GetJson,
): Promise<{ ref: string; tool: string; name: string; [key: string]: unknown }>
