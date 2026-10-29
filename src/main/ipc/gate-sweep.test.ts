// Sweep over every IPC handler (#454 review, findings 5 and 7). A cloud request a handler makes
// must go through the outbound gate with the right project: every handler whose request names a
// project runs in that project's request scope, and only the two connection-test handlers may use
// the ungated providers (which send fixed sample text).
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { channels, type Channel } from '@shared/ipc'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', on: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('./registry')
const { currentJob } = await import('../jobs/scope')

const HANDLERS = resolve('src/main/ipc/handlers')
const handlerSources = readdirSync(HANDLERS)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ file: f, source: readFileSync(join(HANDLERS, f), 'utf8') }))

const takesProject = (Object.keys(channels) as Channel[]).filter((name) => {
  const shape = (channels[name].req as unknown as { shape?: Record<string, unknown> }).shape
  return !!shape && 'projectPath' in shape
})

const saved = new Map<Channel, (typeof channels)[Channel]>()
afterEach(() => {
  for (const [name, def] of saved) (channels as Record<string, unknown>)[name] = def
  saved.clear()
})

describe('IPC handlers and the outbound gate', () => {
  it('finds the channels that name a project', () => {
    expect(takesProject).toEqual(expect.arrayContaining(['retrieve:search', 'comfy:test-render']))
    expect(takesProject.length).toBeGreaterThan(20)
  })

  it.each(takesProject)('%s runs in its project request scope', async (name) => {
    saved.set(name, channels[name])
    // Any request shape: this checks the dispatcher, not the channel's validation.
    ;(channels as Record<string, unknown>)[name] = { req: z.any(), res: z.any() }
    let seen: string | undefined
    const handlers = { [name]: () => void (seen = currentJob()?.projectPath) }
    const r = await dispatch(handlers, name, { projectPath: '/tmp/project-a' })
    expect(r.ok).toBe(true)
    expect(seen).toBe('/tmp/project-a')
  })

  it('only the Providers and Workflows handlers use the ungated connection-test providers', () => {
    const users = handlerSources
      .filter(({ source }) => /connectionTest(Text|Media)Provider/.test(source))
      .map(({ file }) => file)
    expect(users.sort()).toEqual(['comfy.ts', 'providers.ts'])
  })

  it('no handler builds a provider from the registry or an adapter module', () => {
    for (const { file, source } of handlerSources) {
      expect(source, file).not.toMatch(/create(Text|Embedding|Media)Provider/)
      expect(source, file).not.toMatch(/providers\/(text|media)\/[^']*\/adapter'/)
    }
  })

  it('the ungated test paths send only fixed text, or go through the gate when remote', () => {
    const providers = handlerSources.find((h) => h.file === 'providers.ts')!.source
    expect(providers).toMatch(/isRemoteProvider\(config\)\s*\?\s*await mediaProviderFor\(config\)/)
    expect(providers).toMatch(/logConnectionTest\(config/)
    const comfy = handlerSources.find((h) => h.file === 'comfy.ts')!.source
    expect(comfy).toMatch(/isRemoteProvider\(provider\.config\)/)
  })
})
