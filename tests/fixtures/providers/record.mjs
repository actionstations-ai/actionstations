#!/usr/bin/env node
// Records real HTTP responses from local servers (LM Studio, Ollama) into fixture files that
// the provider contract tests replay through a stubbed fetch. Local servers only — this
// script never calls a paid API. Usage:
//   node tests/fixtures/providers/record.mjs [lmstudio|ollama|all] && pnpm exec prettier --write tests/fixtures/providers
// Env: LMSTUDIO_URL (http://127.0.0.1:1234/v1), LMSTUDIO_MODEL (qwen3-30b-a3b-2507),
//      LMSTUDIO_REASONING_MODEL (gpt-oss-20b), LMSTUDIO_EMBED_MODEL
//      (text-embedding-nomic-embed-text-v1.5), OLLAMA_URL (http://127.0.0.1:11434),
//      OLLAMA_MODEL (qwen2.5:3b), OLLAMA_EMBED_MODEL (nomic-embed-text), OLLAMA_PULL_MODEL (smollm:135m)
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LM = process.env.LMSTUDIO_URL ?? 'http://127.0.0.1:1234/v1'
const LM_MODEL = process.env.LMSTUDIO_MODEL ?? 'qwen3-30b-a3b-2507'
const LM_REASONING = process.env.LMSTUDIO_REASONING_MODEL ?? 'gpt-oss-20b'
const LM_EMBED = process.env.LMSTUDIO_EMBED_MODEL ?? 'text-embedding-nomic-embed-text-v1.5'
const OL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const OL_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b'
const OL_EMBED = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'
const OL_PULL = process.env.OLLAMA_PULL_MODEL ?? 'smollm:135m'

/** A small schema with an optional field, an enum and a nested array. */
const MINI_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          time: { type: 'string' },
          wallClock: { type: 'string' },
          purposeTag: { type: 'string', enum: ['STARTEX', 'CORE_NARRATIVE', 'PRESSURE', 'ENDEX'] },
          event: { type: 'string' },
        },
        required: ['id', 'time', 'purposeTag', 'event'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
}

function strictMini() {
  const s = structuredClone(MINI_SCHEMA)
  const item = s.properties.rows.items
  item.properties.wallClock = { anyOf: [{ type: 'string' }, { type: 'null' }] }
  item.required = Object.keys(item.properties)
  return s
}

const PROMPT =
  'Write exactly two MSEL rows for an airport ransomware tabletop: STARTEX at T+0:00 and one PRESSURE inject at T+0:15. Keep each event under 15 words.'

async function record(name, url, init = {}) {
  const started = Date.now()
  const res = await fetch(url, {
    method: init.body ? 'POST' : 'GET',
    headers: init.body ? { 'content-type': 'application/json' } : {},
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const body = await res.text()
  const fixture = {
    name,
    recordedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    request: { method: init.body ? 'POST' : 'GET', path: new URL(url).pathname, body: init.body },
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    body,
  }
  writeFileSync(join(here, `${name}.json`), JSON.stringify(fixture, null, 2) + '\n')
  console.log(`${name}: HTTP ${res.status}, ${body.length} bytes, ${fixture.durationMs} ms`)
}

async function lmstudio() {
  await record('lmstudio-models', `${LM}/models`)
  await record('lmstudio-chat-stream', `${LM}/chat/completions`, {
    body: {
      model: LM_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 60,
      messages: [{ role: 'user', content: 'In one sentence, what is a tabletop exercise?' }],
    },
  })
  await record('lmstudio-json-schema-stream', `${LM}/chat/completions`, {
    body: {
      model: LM_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 400,
      messages: [{ role: 'user', content: PROMPT }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'MiniMsel', strict: true, schema: strictMini() },
      },
    },
  })
  await record('lmstudio-json-object-400', `${LM}/chat/completions`, {
    body: {
      model: LM_MODEL,
      stream: true,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Reply in JSON.' }],
      response_format: { type: 'json_object' },
    },
  })
  await record('lmstudio-reasoning-stream', `${LM}/chat/completions`, {
    body: {
      model: LM_REASONING,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: `${PROMPT} Respond with JSON only: {"rows":[{"id","time","purposeTag","event"}]}`,
        },
      ],
    },
  })
  await record('lmstudio-embeddings', `${LM}/embeddings`, {
    body: { model: LM_EMBED, input: ['airport emergency plan', 'baggage handling system outage'] },
  })
}

async function ollama() {
  await record('ollama-version', `${OL}/api/version`)
  await record('ollama-tags', `${OL}/api/tags`)
  await record('ollama-chat-format-stream', `${OL}/api/chat`, {
    body: {
      model: OL_MODEL,
      stream: true,
      messages: [{ role: 'user', content: PROMPT }],
      format: MINI_SCHEMA,
      options: { temperature: 0, num_predict: 400 },
    },
  })
  await record('ollama-embed', `${OL}/api/embed`, {
    body: { model: OL_EMBED, input: ['airport emergency plan', 'baggage handling system outage'] },
  })
  await record('ollama-pull-stream', `${OL}/api/pull`, { body: { model: OL_PULL, stream: true } })
  await record('ollama-chat-missing-model', `${OL}/api/chat`, {
    body: { model: 'no-such-model:1b', stream: true, messages: [{ role: 'user', content: 'hi' }] },
  })
}

const which = process.argv[2] ?? 'all'
if (which === 'lmstudio' || which === 'all') await lmstudio()
if (which === 'ollama' || which === 'all') await ollama()
