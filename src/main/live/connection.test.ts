// Connection choice rules (spec 0410): the scenario's choice beats the settings default, remote
// kinds need consent, addresses are checked, and importing the live play modules makes no network
// call and opens no listener (Project rules 3).
import { tmpdir } from 'node:os'
import net from 'node:net'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getVersion: () => 'test' },
  BrowserWindow: { getAllWindows: () => [] },
  powerSaveBlocker: { start: () => 1, stop: () => undefined, isStarted: () => false },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}))

const { resolveConnection, requireConsent, validateConnection, remoteStatusOf } =
  await import('./connection')

describe('resolveConnection', () => {
  it('prefers the scenario over the settings default', () => {
    const chosen = { kind: 'relay' as const }
    expect(resolveConnection({ live: { connection: chosen, consented: [] } }, 'lan')).toEqual(
      chosen,
    )
  })

  it('pre-selects the settings default for a scenario with no choice', () => {
    expect(resolveConnection(undefined, 'lan')).toEqual({ kind: 'lan', tls: 'self-signed' })
    expect(resolveConnection({}, 'relay')).toEqual({ kind: 'relay' })
  })

  it('has nothing to pre-select for a server that has no address yet', () => {
    expect(resolveConnection({}, 'self-hosted')).toBeUndefined()
  })
})

describe('consent', () => {
  it('lets This computer start without asking', () => {
    expect(() => requireConsent({}, { kind: 'lan', tls: 'none' })).not.toThrow()
  })

  it('asks once per remote kind', () => {
    const state = { live: { consented: ['relay' as const] } }
    expect(() => requireConsent(state, { kind: 'relay' })).not.toThrow()
    expect(() =>
      requireConsent(state, { kind: 'self-hosted', url: 'https://a.example', insecureHttp: false }),
    ).toThrow(/Confirm what this connection sends/)
  })
})

describe('validateConnection and the status line', () => {
  it('normalizes a server address and refuses plain http without the tick', () => {
    const ok = validateConnection({
      kind: 'self-hosted',
      url: 'https://a.example/',
      insecureHttp: false,
    })
    expect(ok).toMatchObject({ url: 'https://a.example' })
    expect(() =>
      validateConnection({ kind: 'self-hosted', url: 'http://10.0.0.5', insecureHttp: false }),
    ).toThrow()
  })

  it('names the host and how the connection is secured', () => {
    const c = { kind: 'self-hosted' as const, url: 'https://a.example', insecureHttp: false }
    expect(remoteStatusOf(c, 'https://a.example:8443', true)).toEqual({
      kind: 'self-hosted',
      host: 'a.example:8443',
      security: 'self-signed',
    })
    expect(remoteStatusOf(c, 'http://10.0.0.5', false).security).toBe('http')
    expect(remoteStatusOf({ kind: 'relay' }, 'https://relay.actionstations.ai', false).host).toBe(
      'relay.actionstations.ai',
    )
  })
})

describe('import-time behavior', () => {
  it('opens no socket and makes no request when the live play modules load', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const connect = vi.spyOn(net, 'connect')
    const listen = vi.spyOn(net.Server.prototype, 'listen')
    vi.resetModules()
    await import('./connection')
    await import('./test')
    await import('./servers')
    await import('./remote-session')
    await import('./transport/relay-client')
    await import('./transport/self-hosted-client')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
    expect(listen).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
