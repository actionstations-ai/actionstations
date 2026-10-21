import { describe, expect, it } from 'vitest'
import { detectLocalServices } from './local-detect'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('detectLocalServices', () => {
  it('parses model names from LM Studio and Ollama and marks ComfyUI reachable', async () => {
    const seen: string[] = []
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push(String(url))
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      if (String(url).includes(':1234'))
        return json({ data: [{ id: 'qwen3-30b-a3b-2507' }, { id: 'gpt-oss-20b' }] })
      if (String(url).includes(':11434')) return json({ models: [{ name: 'llama3:8b' }] })
      return json({ system: { os: 'posix' } })
    }) as typeof fetch
    const found = await detectLocalServices(fakeFetch)
    expect(seen).toEqual([
      'http://127.0.0.1:1234/v1/models',
      'http://127.0.0.1:11434/api/tags',
      'http://127.0.0.1:8188/system_stats',
    ])
    expect(found).toEqual([
      {
        kind: 'openai-compatible',
        label: 'LM Studio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        reachable: true,
        models: ['gpt-oss-20b', 'qwen3-30b-a3b-2507'],
      },
      {
        kind: 'ollama',
        label: 'Ollama',
        baseUrl: 'http://127.0.0.1:11434',
        reachable: true,
        models: ['llama3:8b'],
      },
      {
        kind: 'comfyui',
        label: 'ComfyUI',
        baseUrl: 'http://127.0.0.1:8188',
        reachable: true,
        models: [],
      },
    ])
  })

  it('marks refused connections and HTTP errors unreachable', async () => {
    const fakeFetch = (async (url: string | URL | Request) => {
      if (String(url).includes(':1234')) throw new TypeError('fetch failed')
      return new Response('nope', { status: 500 })
    }) as typeof fetch
    const found = await detectLocalServices(fakeFetch)
    expect(found.map((f) => f.reachable)).toEqual([false, false, false])
    expect(found.every((f) => f.models.length === 0)).toBe(true)
  })
})
