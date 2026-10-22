// activeEmbedder passes the project path through, so "Configured provider" embeddings use the
// project's own Embeddings routing override (follow-up of #146).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), on: vi.fn() } }))

const seen = vi.hoisted(() => ({ deps: [] as { projectPath?: string }[] }))
vi.mock('../providers/embedding/factory', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return {
    ...real,
    createEmbedder: vi.fn(async (_settings: unknown, deps: { projectPath?: string }) => {
      seen.deps.push(deps)
      const { HashEmbedder } = await import('../providers/embedding/hash')
      return new HashEmbedder()
    }),
  }
})

const { activeEmbedder } = await import('./index')
const { resetSettingsCache } = await import('../settings/store')

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-embedder-'))
  resetSettingsCache()
  seen.deps = []
})

describe('activeEmbedder', () => {
  it('passes the project path to the embedder factory', async () => {
    await activeEmbedder('/projects/ncia.ttxproj')
    expect(seen.deps[0]?.projectPath).toBe('/projects/ncia.ttxproj')
  })

  it('uses global routing (no project path) when called without one', async () => {
    await activeEmbedder()
    expect(seen.deps[0]).not.toHaveProperty('projectPath')
  })
})
