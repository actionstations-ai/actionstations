// Model references and metadata for the benchmark (#434, FR-1, FR-3, FR-15). A model ref is
// `lmstudio:<model id>` or `ollama:<model name>` (`mock:<name>` only with TTX_MOCK_PROVIDERS=1,
// for the smoke run). Endpoints must be on this machine: the benchmark never sends the corpora
// to a remote service and has no flag to allow it. Metadata (size, quantization, digest,
// context) comes from the tool's own local API.

export const DEFAULT_BASE_URLS = {
  lmstudio: 'http://127.0.0.1:1234/v1',
  ollama: 'http://127.0.0.1:11434',
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Throws unless `url` is an http(s) URL on this machine. */
export function assertLocalEndpoint(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    throw new Error(`not a URL: ${url}`)
  }
  if (!/^https?:$/.test(u.protocol) || !LOOPBACK.has(u.hostname))
    throw new Error(
      `${u.host || url} is not on this machine. The benchmark runs local models only ` +
        '(LM Studio or Ollama on 127.0.0.1); it never sends the example corpora to a remote endpoint.',
    )
  return u
}

/** Parse `tool:name` and settle its endpoint (`baseUrl` overrides the tool's default). */
export function parseModelRef(ref, baseUrl, env = process.env) {
  const at = ref.indexOf(':')
  const tool = at > 0 ? ref.slice(0, at) : ref
  const name = at > 0 ? ref.slice(at + 1) : ''
  if (tool === 'mock') {
    if (env.TTX_MOCK_PROVIDERS !== '1')
      throw new Error('mock models are for the smoke test: set TTX_MOCK_PROVIDERS=1')
    return { ref: `mock:${name || 'mock-large'}`, tool, name: name || 'mock-large' }
  }
  if (!(tool in DEFAULT_BASE_URLS) || !name)
    throw new Error(`model "${ref}": use lmstudio:<model id> or ollama:<model name>`)
  const url = baseUrl ?? DEFAULT_BASE_URLS[tool]
  assertLocalEndpoint(url)
  return { ref: `${tool}:${name}`, tool, name, baseUrl: url.replace(/\/+$/, '') }
}

/** The provider the app gets for the model under test (src/shared/schemas/provider.ts). */
export function providerConfig(model, seed, contextLength) {
  const options = { seed }
  if (model.tool === 'ollama') options.numCtx = contextLength
  return {
    kind: model.tool === 'ollama' ? 'ollama' : 'openai-compatible',
    label: `Benchmark: ${model.ref}`,
    baseUrl: model.baseUrl,
    defaultModel: model.name,
    options,
    enabled: true,
  }
}

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

const short = (s, n) => (typeof s === 'string' && s ? s.slice(0, n) : undefined)

async function ollamaInfo(model, contextLength, get) {
  const base = model.baseUrl.replace(/\/v1$/, '')
  const [version, tags, show] = await Promise.all([
    get(`${base}/api/version`).catch(() => ({})),
    get(`${base}/api/tags`),
    get(`${base}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: model.name }),
    }).catch(() => ({})),
  ])
  const tag = (tags.models ?? []).find((m) => m.name === model.name || m.model === model.name)
  if (!tag) throw new Error(`Ollama has no model "${model.name}": run ollama pull ${model.name}`)
  return {
    toolVersion: short(version.version, 60),
    digest: short(tag.digest, 100),
    quantization: short(show.details?.quantization_level ?? tag.details?.quantization_level, 60),
    sizeBytes: Number.isInteger(tag.size) ? tag.size : undefined,
    contextLength,
  }
}

async function lmStudioInfo(model, get) {
  const root = model.baseUrl.replace(/\/v1$/, '')
  const list = await get(`${root}/api/v0/models`)
  const m = (list.data ?? []).find((d) => d.id === model.name)
  if (!m) throw new Error(`LM Studio has no model "${model.name}": download it in LM Studio`)
  const ctx = m.loaded_context_length ?? m.max_context_length
  return {
    quantization: short(m.quantization, 60),
    contextLength: Number.isInteger(ctx) && ctx > 0 ? ctx : undefined,
  }
}

const dropUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))

/** BenchModel for the run file. `get` is injectable for tests. */
export async function modelInfo(model, contextLength, get = getJson) {
  const base = { ref: model.ref, tool: model.tool, name: model.name }
  if (model.tool === 'mock') return { ...base, contextLength }
  const extra =
    model.tool === 'ollama'
      ? await ollamaInfo(model, contextLength, get)
      : await lmStudioInfo(model, get)
  return dropUndefined({ ...base, ...extra })
}
