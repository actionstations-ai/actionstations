// scripts/bench/run.mjs, model-info.mjs, corpus.mjs, cases.mjs: the benchmark runner's
// testable parts (#434): arguments, refusing remote endpoints, the provider it configures, model
// metadata, the fixed inputs and the run file it builds.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BenchRun } from '@shared/schemas/bench'
import { assertNoPromptOverrides, ideateTokens } from '../../scripts/bench/cases.mjs'
import {
  caseBrief,
  corpusHash,
  loadExample,
  loadSuite,
  runFileName,
} from '../../scripts/bench/corpus.mjs'
import {
  assertLocalEndpoint,
  modelInfo,
  parseModelRef,
  providerConfig,
} from '../../scripts/bench/model-info.mjs'
import { buildRun, parseArgs, summaryMarkdown, type CaseResult } from '../../scripts/bench/run.mjs'

describe('arguments', () => {
  it('reads models, suite, repeats and switches, ignoring the pnpm separator', () => {
    const a = parseArgs([
      '--',
      '--models',
      'ollama:a, lmstudio:b',
      '--suite',
      'standard',
      '--repeats',
      '2',
      '--resume',
    ])
    expect(a).toMatchObject({
      models: ['ollama:a', 'lmstudio:b'],
      suite: 'standard',
      repeats: 2,
      resume: true,
      embedder: 'local',
    })
  })

  it('needs models and refuses unknown switches and repeats beyond the seeds', () => {
    expect(() => parseArgs([])).toThrow(/--models/)
    expect(() => parseArgs(['--models', 'ollama:a', '--allow-remote'])).toThrow(/Unknown argument/)
    expect(() => parseArgs(['--models', 'ollama:a', '--repeats', '4'])).toThrow(/1, 2 or 3/)
  })
})

describe('local endpoints only', () => {
  it('accepts loopback addresses', () => {
    for (const url of ['http://127.0.0.1:1234/v1', 'http://localhost:11434', 'http://[::1]:11434'])
      expect(() => assertLocalEndpoint(url)).not.toThrow()
  })

  it('refuses any other host, scheme or a malformed URL', () => {
    for (const url of [
      'https://api.openai.com/v1',
      'http://192.168.1.20:11434',
      'http://127.0.0.1.example.com:1234',
      'file:///tmp/x',
      'not a url',
    ])
      expect(() => assertLocalEndpoint(url)).toThrow()
  })

  it('parses model refs with the default endpoints and refuses a remote --base-url', () => {
    expect(parseModelRef('ollama:qwen3.5:9b')).toEqual({
      ref: 'ollama:qwen3.5:9b',
      tool: 'ollama',
      name: 'qwen3.5:9b',
      baseUrl: 'http://127.0.0.1:11434',
    })
    expect(parseModelRef('lmstudio:qwen/qwen3.5-9b').baseUrl).toBe('http://127.0.0.1:1234/v1')
    expect(() => parseModelRef('ollama:x', 'https://ollama.example.com')).toThrow(
      /not on this machine/,
    )
    expect(() => parseModelRef('anthropic:claude')).toThrow(/lmstudio:/)
    expect(() => parseModelRef('ollama:')).toThrow()
  })

  it('allows the in-process mock only with TTX_MOCK_PROVIDERS=1', () => {
    expect(() => parseModelRef('mock', undefined, {})).toThrow(/TTX_MOCK_PROVIDERS/)
    expect(parseModelRef('mock', undefined, { TTX_MOCK_PROVIDERS: '1' }).ref).toBe(
      'mock:mock-large',
    )
  })
})

describe('the provider under test', () => {
  it('sets the seed, and the 32k context through num_ctx for Ollama', () => {
    expect(providerConfig(parseModelRef('ollama:m'), 23, 32768)).toMatchObject({
      kind: 'ollama',
      defaultModel: 'm',
      options: { seed: 23, numCtx: 32768 },
    })
    expect(providerConfig(parseModelRef('lmstudio:m'), 11, 32768)).toMatchObject({
      kind: 'openai-compatible',
      options: { seed: 11 },
    })
  })

  it('reads size, quantization, digest and version from Ollama', async () => {
    const answers: Record<string, unknown> = {
      'http://127.0.0.1:11434/api/version': { version: '0.40.7' },
      'http://127.0.0.1:11434/api/tags': {
        models: [{ name: 'qwen2.5:3b', size: 1929912432, digest: 'abc' }],
      },
      'http://127.0.0.1:11434/api/show': { details: { quantization_level: 'Q4_K_M' } },
    }
    const info = await modelInfo(
      parseModelRef('ollama:qwen2.5:3b'),
      32768,
      async (url) => answers[url],
    )
    expect(info).toEqual({
      ref: 'ollama:qwen2.5:3b',
      tool: 'ollama',
      name: 'qwen2.5:3b',
      toolVersion: '0.40.7',
      digest: 'abc',
      quantization: 'Q4_K_M',
      sizeBytes: 1929912432,
      contextLength: 32768,
    })
    await expect(
      modelInfo(parseModelRef('ollama:missing'), 32768, async (url) => answers[url]),
    ).rejects.toThrow(/ollama pull missing/)
  })

  it('reads quantization and the loaded context from LM Studio', async () => {
    const get = async () => ({
      data: [{ id: 'qwen/qwen3.5-9b', quantization: '4bit', loaded_context_length: 32768 }],
    })
    expect(await modelInfo(parseModelRef('lmstudio:qwen/qwen3.5-9b'), 32768, get)).toEqual({
      ref: 'lmstudio:qwen/qwen3.5-9b',
      tool: 'lmstudio',
      name: 'qwen/qwen3.5-9b',
      quantization: '4bit',
      contextLength: 32768,
    })
  })
})

describe('fixed inputs', () => {
  it('takes a brief from the build spec, or from the hand-authored scenario', () => {
    const water = caseBrief(loadExample('city-water'), 'chem')
    expect(water.userPrompt).toMatch(/DosaTech ScreenBridge/)
    expect(water.threatFamily).toBe('cyber_physical')
    const airport = caseBrief(loadExample('airport-ncia'), 'scenario-5')
    expect(airport.userPrompt).toMatch(/cloned vendor badge/)
    expect(airport.audience.length).toBeGreaterThan(0)
    expect(airport.threatFamily).toBe('cyber_physical')
  })

  it('names every suite case after an existing example scenario', () => {
    for (const name of ['quick', 'standard']) {
      const suite = loadSuite(name)
      for (const c of suite.drafting)
        expect(() => caseBrief(loadExample(c.example), c.scenario!)).not.toThrow()
      expect(suite.seeds.length).toBeGreaterThanOrEqual(suite.repeats)
    }
  })

  it('hashes the corpus the same way every time', () => {
    const ex = loadExample('county-911')
    expect(corpusHash(ex)).toMatch(/^[0-9a-f]{16}$/)
    expect(corpusHash(ex)).toBe(corpusHash(ex))
  })

  it('refuses prompt overrides', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-prompts-'))
    expect(() => assertNoPromptOverrides(join(dir, 'prompts'), 'x')).not.toThrow()
    mkdirSync(join(dir, 'prompts'))
    writeFileSync(join(dir, 'prompts', 'critique.md'), '---\n---\n')
    expect(() => assertNoPromptOverrides(join(dir, 'prompts'), 'x')).toThrow(/prompt overrides/)
  })

  it('reads the ideate token counts from its job log', () => {
    expect(ideateTokens([{ message: 'ideate: 6 ideas, 1200 in / 900 out tokens' }])).toEqual({
      input: 1200,
      output: 900,
    })
  })
})

describe('the run file', () => {
  const suite = loadSuite('quick')
  const result = (caseId: string, score: number, extra: Partial<CaseResult> = {}): CaseResult => ({
    caseId,
    score,
    parts: { a: score },
    details: {},
    wallSeconds: 10,
    tokens: { output: 500, ms: 10_000 },
    ...extra,
  })
  const cases: Record<string, CaseResult> = {
    '0:ideation:city-water': result('city-water', 80),
    '0:drafting:city-water-chem': result('city-water-chem', 60, {
      reliability: 0.9,
      promptHashes: { critique: 'abc' },
      failures: [{ caseId: 'city-water-chem', stage: 'sitman', error: 'no JSON' }],
    }),
    '0:critique:city-water-chem': result('city-water-chem', 40),
    '0:critique:county-911-storm-tdos': result('county-911-storm-tdos', 20),
  }
  const hardware = {
    platform: 'darwin',
    arch: 'arm64',
    appleSilicon: true,
    ramGb: 32,
    budgetGb: 24,
  }
  const model = { ref: 'ollama:m', tool: 'ollama' as const, name: 'm', contextLength: 32768 }

  it('validates against BenchRun with medians, failures and no paths', () => {
    const run = buildRun({
      suite,
      model,
      embedder: 'hash',
      mstate: { startedAt: '2026-11-01T10:00:00.000Z', cases },
      repeats: 1,
      hardware,
      appVersion: '0.7.0',
    })
    const parsed = BenchRun.parse(run)
    // drafting 60 × 0.5 + critique 30 × 0.25 + ideation 80 × 0.25
    expect(parsed.median.overall).toBe(57.5)
    expect(parsed.median.tasks).toEqual({ ideation: 80, drafting: 60, critique: 30 })
    expect(parsed.median.draftingReliability).toBe(0.9)
    expect(parsed.repeats[0]!.failures).toHaveLength(1)
    expect(parsed.repeats[0]!.tasks[0]!.outputTokensPerSecond).toBe(50)
    expect(parsed.promptHashes).toEqual({ critique: 'abc' })
    expect(Object.keys(parsed.corpusHashes)).toEqual(['city-water', 'county-911'])
    expect(JSON.stringify(parsed)).not.toMatch(/"\/(Users|home)\//)
    expect(summaryMarkdown(parsed)).toContain('| **overall** | **57.5** | |')
  })

  it('is named by date, model and coarse machine', () => {
    expect(runFileName('2026-11-01T10:00:00.000Z', 'lmstudio:qwen/qwen3.5-9b', hardware)).toBe(
      '2026-11-01-lmstudio-qwen-qwen3-5-9b-darwin-arm64-32gb.json',
    )
  })
})
