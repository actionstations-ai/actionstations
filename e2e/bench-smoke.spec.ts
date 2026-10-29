// The local model benchmark end to end (#434): `pnpm bench` runs the quick suite against the
// in-process mock provider (TTX_MOCK_PROVIDERS=1, the test-only escape from the local-only
// rule) through the built app, and the run file it writes validates as a BenchRun. About a
// minute; part of `pnpm e2e`, not of `pnpm ci:local`.
import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BenchRun } from '../src/shared/schemas/bench'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('the quick suite runs against the mock provider and writes a valid run file', () => {
  test.setTimeout(5 * 60_000)
  const out = mkdtempSync(join(tmpdir(), 'ttx-bench-smoke-'))
  try {
    const res = spawnSync(
      process.execPath,
      [
        'scripts/bench/run.mjs',
        '--models',
        'mock',
        '--suite',
        'quick',
        '--embedder',
        'hash',
        '--out',
        out,
        '--clean',
      ],
      {
        cwd: ROOT,
        env: { ...process.env, TTX_MOCK_PROVIDERS: '1' },
        encoding: 'utf8',
        timeout: 4 * 60_000,
      },
    )
    expect(res.status, res.stderr + res.stdout).toBe(0)
    const files = readdirSync(out).filter((f) => f.endsWith('.json') && f !== 'state.json')
    expect(files).toHaveLength(1)
    const run = BenchRun.parse(JSON.parse(readFileSync(join(out, files[0]!), 'utf8')))
    expect(run.model.tool).toBe('mock')
    expect(run.repeats).toHaveLength(1)
    expect(run.repeats[0]!.tasks.map((t) => t.task)).toEqual(['ideation', 'drafting', 'critique'])
    expect(run.embedder).toBe('hash')
    expect(Object.keys(run.promptHashes)).toContain('critique')
    expect(readdirSync(out)).not.toContain('work')
    expect(res.stdout).toContain('| **overall** |')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('a remote endpoint is refused before the app starts', () => {
  const res = spawnSync(
    process.execPath,
    ['scripts/bench/run.mjs', '--models', 'ollama:m', '--base-url', 'https://ollama.example.com'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60_000 },
  )
  expect(res.status).toBe(1)
  expect(res.stderr).toMatch(/not on this machine/)
})
