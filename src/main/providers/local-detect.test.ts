import { describe, expect, it } from 'vitest'
import { detectLocalServices } from './local-detect'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('detectLocalServices', () => {
  it('parses model names from LM Studio and Ollama and marks ComfyUI reachable', async () => {
    const seen: string[] = []
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push(String(url))
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      if (String(url).endsWith(':1234/api/v0/models'))
        return json({
          data: [
            { id: 'qwen3-30b-a3b-2507', state: 'loaded' },
            { id: 'gpt-oss-20b', state: 'not-loaded' },
          ],
        })
      if (String(url).includes(':1234'))
        return json({ data: [{ id: 'qwen3-30b-a3b-2507' }, { id: 'gpt-oss-20b' }] })
      if (String(url).includes(':11434')) return json({ models: [{ name: 'llama3:8b' }] })
      return json({ system: { os: 'posix' } })
    }) as typeof fetch
    const found = await detectLocalServices(fakeFetch)
    expect(seen).toEqual([
      'http://127.0.0.1:1234/v1/models',
      'http://127.0.0.1:1234/api/v0/models',
      'http://127.0.0.1:11434/api/tags',
      'http://127.0.0.1:8188/system_stats',
      // No capabilities in /api/tags: one /api/show per model.
      'http://127.0.0.1:11434/api/show',
    ])
    expect(found).toEqual([
      {
        kind: 'openai-compatible',
        label: 'LM Studio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        reachable: true,
        models: ['gpt-oss-20b', 'qwen3-30b-a3b-2507'],
        loadedModels: ['qwen3-30b-a3b-2507'],
        chatModels: ['gpt-oss-20b', 'qwen3-30b-a3b-2507'],
      },
      {
        kind: 'ollama',
        label: 'Ollama',
        baseUrl: 'http://127.0.0.1:11434',
        reachable: true,
        models: ['llama3:8b'],
        loadedModels: [],
        chatModels: ['llama3:8b'],
      },
      {
        kind: 'comfyui',
        label: 'ComfyUI',
        baseUrl: 'http://127.0.0.1:8188',
        reachable: true,
        models: [],
        loadedModels: [],
        chatModels: [],
      },
    ])
  })

  it('finds ComfyUI Desktop on port 8000 when nothing answers on 8188 (#334)', async () => {
    const seen: string[] = []
    const fakeFetch = (async (url: string | URL | Request) => {
      seen.push(String(url))
      if (String(url) === 'http://127.0.0.1:8000/system_stats') return json({ system: {} })
      throw new TypeError('fetch failed')
    }) as typeof fetch
    const comfy = (await detectLocalServices(fakeFetch)).find((s) => s.label === 'ComfyUI')
    expect(comfy).toMatchObject({ reachable: true, baseUrl: 'http://127.0.0.1:8000' })
    expect(seen.indexOf('http://127.0.0.1:8188/system_stats')).toBeLessThan(
      seen.indexOf('http://127.0.0.1:8000/system_stats'),
    )
  })

  it('prefers 8188 and does not probe 8000 when 8188 answers', async () => {
    const seen: string[] = []
    const fakeFetch = (async (url: string | URL | Request) => {
      seen.push(String(url))
      if (String(url).includes(':8188') || String(url).includes(':8000')) return json({})
      throw new TypeError('fetch failed')
    }) as typeof fetch
    const comfy = (await detectLocalServices(fakeFetch)).find((s) => s.label === 'ComfyUI')
    expect(comfy?.baseUrl).toBe('http://127.0.0.1:8188')
    expect(seen).not.toContain('http://127.0.0.1:8000/system_stats')
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

  it('keeps LM Studio reachable with no loaded models when the REST API is missing', async () => {
    const fakeFetch = (async (url: string | URL | Request) => {
      if (String(url).includes('/api/v0/')) return new Response('nope', { status: 404 })
      return json({ data: [{ id: 'qwen3-30b-a3b-2507' }], models: [] })
    }) as typeof fetch
    const [lm] = await detectLocalServices(fakeFetch)
    expect(lm).toMatchObject({ reachable: true, loadedModels: [] })
  })

  it('never lists embedding models as chat models; Ollama is largest first (#225)', async () => {
    const shown: string[] = []
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith(':1234/api/v0/models'))
        return json({
          data: [
            { id: 'qwen3-30b-a3b-2507', type: 'llm', state: 'not-loaded' },
            { id: 'granite-retriever', type: 'embeddings', state: 'loaded' },
          ],
        })
      if (u.includes(':1234'))
        return json({ data: [{ id: 'qwen3-30b-a3b-2507' }, { id: 'granite-retriever' }] })
      if (u.endsWith('/api/show')) {
        const model = (JSON.parse(String(init?.body)) as { model: string }).model
        shown.push(model)
        return json({ capabilities: model === 'all-minilm:22m' ? ['embedding'] : ['completion'] })
      }
      if (u.endsWith('/api/tags'))
        return json({
          models: [
            { name: 'all-minilm:22m', size: 45_960_996 },
            { name: 'smollm:135m', size: 91_739_413 },
            { name: 'qwen2.5:3b', size: 1_929_912_432 },
          ],
        })
      return json({})
    }) as typeof fetch
    const [lm, ollama] = await detectLocalServices(fakeFetch)
    expect(lm!.chatModels).toEqual(['qwen3-30b-a3b-2507'])
    expect(ollama!.models).toContain('all-minilm:22m')
    expect(ollama!.chatModels).toEqual(['qwen2.5:3b', 'smollm:135m'])
    expect(shown.sort()).toEqual(['all-minilm:22m', 'qwen2.5:3b', 'smollm:135m'])
  })

  it('falls back to names when Ollama cannot report capabilities', async () => {
    const fakeFetch = (async (url: string | URL | Request) => {
      const u = String(url)
      if (u.endsWith('/api/show')) return new Response('nope', { status: 404 })
      if (u.endsWith('/api/tags'))
        return json({
          models: [{ name: 'all-minilm:22m' }, { name: 'bge-m3' }, { name: 'llama3:8b' }],
        })
      return json({})
    }) as typeof fetch
    const [, ollama] = await detectLocalServices(fakeFetch)
    expect(ollama!.chatModels).toEqual(['llama3:8b'])
  })
})
