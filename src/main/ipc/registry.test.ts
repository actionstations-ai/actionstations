import { describe, expect, it } from 'vitest'
import { dispatch, mergeHandlers, defineHandlers } from './registry'
import { CHANNEL_NAMES, channels } from '@shared/ipc'

describe('IPC registry', () => {
  const handlers = defineHandlers({
    'project:list-recent': () => [],
    'documents:list': ({ projectPath }) => {
      if (projectPath === '/boom') throw new Error('disk on fire')
      return []
    },
  })

  it('returns ok results from a handler', async () => {
    expect(await dispatch(handlers, 'project:list-recent', undefined)).toEqual({
      ok: true,
      data: [],
    })
  })

  it('rejects requests that fail the zod schema before the handler runs', async () => {
    const r = await dispatch(handlers, 'documents:list', { projectPath: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('VALIDATION')
  })

  it('reports channels without a handler as NOT_IMPLEMENTED', async () => {
    const r = await dispatch(handlers, 'scenarios:list', { projectPath: '/x' })
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_IMPLEMENTED' } })
  })

  it('wraps thrown errors without leaking a stack', async () => {
    const r = await dispatch(handlers, 'documents:list', { projectPath: '/boom' })
    expect(r).toMatchObject({ ok: false, error: { code: 'INTERNAL', message: 'disk on fire' } })
  })

  it('validates handler output in non-production builds', async () => {
    const bad = defineHandlers({ 'project:list-recent': () => [{ nope: true }] as never })
    const r = await dispatch(bad, 'project:list-recent', undefined)
    expect(r).toMatchObject({ ok: false, error: { code: 'INTERNAL' } })
  })

  it('refuses two modules handling the same channel', () => {
    expect(() => mergeHandlers({ a: handlers, b: handlers })).toThrow(/handled by both/)
  })

  it('declares a request and response schema for every channel', () => {
    expect(CHANNEL_NAMES.length).toBeGreaterThan(60)
    for (const name of CHANNEL_NAMES) {
      expect(channels[name].req, name).toBeDefined()
      expect(channels[name].res, name).toBeDefined()
    }
  })
})
