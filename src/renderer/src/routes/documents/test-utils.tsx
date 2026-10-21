// Test-only helpers: a fake preload bridge (window.ttx) and a routed render with the app's
// QueryClient. Imported only from *.test.tsx files.
import { render, type RenderResult } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense, type ComponentType } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { vi } from 'vitest'
import type { Channel, ChannelResponse, EventName, EventPayload } from '@shared/ipc'
import type { DocumentMeta } from '@shared/schemas/project'
import { queryClient } from '../../lib/query'
import { projectKey } from '../../state/project'

export const PROJECT = '/Users/test/Projects/Rivergate Airport'

type Handler<C extends Channel> = (req: never) => ChannelResponse<C> | Promise<ChannelResponse<C>>
export type Handlers = { [C in Channel]?: Handler<C> }

export class FakeIpcError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Install a fake window.ttx. Unhandled channels answer NOT_IMPLEMENTED, as main does. */
export function mockTtx(handlers: Handlers) {
  const listeners = new Map<string, Set<(p: unknown) => void>>()
  const invoke = vi.fn(async (channel: string, payload: unknown) => {
    const h = (handlers as Record<string, ((r: unknown) => unknown) | undefined>)[channel]
    if (!h) return { ok: false, error: { code: 'NOT_IMPLEMENTED', message: `${channel} n/a` } }
    try {
      return { ok: true, data: await h(payload) }
    } catch (e) {
      const code = e instanceof FakeIpcError ? e.code : 'INTERNAL'
      return { ok: false, error: { code, message: (e as Error).message } }
    }
  })
  const on = (event: string, l: (p: unknown) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(l)
    return () => listeners.get(event)!.delete(l)
  }
  const ttx = { invoke, on, pathForFile: (f: File) => `/dropped/${f.name}`, platform: 'darwin' }
  ;(window as unknown as { ttx: typeof ttx }).ttx = ttx
  const emit = <E extends EventName>(event: E, payload: EventPayload<E>) =>
    listeners.get(event)?.forEach((l) => l(payload))
  const calls = (channel: Channel) =>
    invoke.mock.calls.filter(([c]) => c === channel).map(([, p]) => p)
  return { invoke, emit, calls }
}

export function renderAt(path: string, routePath: string, Page: ComponentType): RenderResult {
  queryClient.clear()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={null}>
          <Routes>
            <Route path={routePath} element={<Page />} />
            <Route path="/settings" element={<p>Settings page</p>} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export const projectUrl = (suffix: string) => `/p/${projectKey(PROJECT)}/${suffix}`

export function makeDoc(over: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: 'doc1',
    title: 'Terminal Incident Response Plan',
    shortName: 'TIRP',
    filename: 'terminal-incident-response-plan-TIRP.md',
    kind: 'plan',
    pages: 12,
    ingestedAt: '2026-10-01T12:00:00.000Z',
    status: 'ok',
    tags: ['terminal'],
    headingsPreview: [
      'TIRP › Section 13',
      'TIRP › Section 13 › 13.6 FIDS/BHS System Failure',
      'TIRP › Section 14',
    ],
    chunkCount: 3,
    ...over,
  }
}
