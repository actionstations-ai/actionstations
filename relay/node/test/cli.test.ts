import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { main, type Io } from '../src/cli'
import { readServerKeyHash } from '../src/server-key'
import { http } from './helpers'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'asr-'))
  dirs.push(d)
  return d
}

function io(over: Partial<Io> = {}): Io & { out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return {
    out,
    err,
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    env: {},
    platform: 'linux',
    ...over,
  }
}

const SERVE = [
  '--port',
  '0',
  '--bind',
  '127.0.0.1',
  '--host',
  '127.0.0.1',
  '--insecure-http',
  '--log-level',
  'warn',
]

describe('cli', () => {
  it('prints the version and the usage, and refuses unknown commands and options', async () => {
    const v = io()
    expect(await main(['--version'], v)).toBe(0)
    expect(v.out[0]).toMatch(/^actionstations-relay \d+\.\d+\.\d+$/)
    const h = io()
    expect(await main(['--help'], h)).toBe(0)
    expect(h.out[0]).toContain('Usage:')
    const u = io()
    expect(await main(['dance'], u)).toBe(2)
    expect(u.err[0]).toContain('Unknown command')
    const o = io()
    expect(await main(['--colour', 'blue'], o)).toBe(2)
  })

  it('print-config merges the file, the environment and the flags and never shows the key', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'config.toml'), 'port = 9000\ntls = "self-signed"\nmax-sessions = 5\n')
    const i = io({ env: { AS_RELAY_DATA_DIR: dir, AS_RELAY_MAX_SESSIONS: '7' } })
    expect(await main(['print-config', '--max-clients', '9'], i)).toBe(0)
    const shown = JSON.parse(i.out.join('\n')) as Record<string, unknown>
    expect(shown).toMatchObject({ port: 9000, maxSessions: 7, maxClients: 9, dataDir: dir })
    expect(JSON.stringify(shown)).not.toMatch(/hash|serverKey/i)
    const bad = io({ env: { AS_RELAY_DATA_DIR: dir } })
    expect(await main(['print-config', '--retention-hours', '100'], bad)).toBe(1)
    expect(bad.err[0]).toContain('retentionHours')
    const missing = io()
    expect(await main(['print-config', '--config', join(dir, 'nope.toml')], missing)).toBe(1)
    expect(missing.err[0]).toContain('not found')
  })

  it('rotate-key prints a new key once and replaces the stored hash', async () => {
    const dir = tmp()
    const first = io()
    expect(await main(['rotate-key', '--data-dir', dir], first)).toBe(0)
    const key1 = /: ([A-Za-z0-9_-]{43})$/.exec(first.out[0]!)![1]!
    const hash1 = readServerKeyHash(dir)
    const second = io()
    await main(['rotate-key', '--data-dir', dir], second)
    expect(readServerKeyHash(dir)).not.toBe(hash1)
    expect(second.out[0]).not.toContain(key1)
  })

  it('serve prints the URL and the key once, answers status over the admin socket, and stops', async () => {
    const dir = tmp()
    let stop: (() => Promise<void>) | undefined
    const first = io({ waitForStop: async (s) => void (stop = s) })
    expect(await main(['serve', '--data-dir', dir, ...SERVE], first)).toBe(0)
    const url = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(first.out.join('\n'))![1]!
    expect(first.out.some((l) => l.startsWith('Server key (shown once'))).toBe(true)
    expect((await http(`${url}/v1/health`)).status).toBe(200)
    const status = io()
    expect(await main(['status', '--data-dir', dir], status)).toBe(0)
    expect(status.out[0]).toMatch(/^actionstations-relay .* up \d+ s$/)
    expect(status.out).toContain(`  ${url}`)
    expect(status.out.some((l) => l.startsWith('Sessions: 0 live, 0 ended (limit 20)'))).toBe(true)
    await stop!()
    expect(existsSync(join(dir, 'logs', 'server.log'))).toBe(true)
    expect(readFileSync(join(dir, 'logs', 'server.log'), 'utf8')).not.toContain('Server key')

    const second = io({ waitForStop: async (s) => void (stop = s) })
    await main(['serve', '--data-dir', dir, ...SERVE], second)
    expect(second.out.some((l) => l.startsWith('Server key'))).toBe(false)
    await stop!()
    const down = io()
    expect(await main(['status', '--data-dir', dir], down)).toBe(1)
  })

  it('service install --dry-run prints the platform’s commands without running them', async () => {
    const dir = tmp()
    const win = io({
      platform: 'win32',
      env: { ProgramData: dir },
      exec: () => {
        throw new Error('must not run')
      },
    })
    expect(await main(['service', 'install', '--dry-run'], win)).toBe(0)
    expect(win.out[0]).toContain('schtasks /Create /F /TN ActionStationsRelay')
    expect(win.out.some((l) => l.startsWith('netsh advfirewall'))).toBe(true)
    expect(existsSync(join(dir, 'ActionStationsRelay', 'config.toml'))).toBe(false)
    const linux = io({
      platform: 'linux',
      env: { XDG_STATE_HOME: dir },
      exec: () => {
        throw new Error('must not run')
      },
    })
    expect(await main(['service', 'uninstall', '--dry-run'], linux)).toBe(0)
    expect(linux.out[0]).toBe('systemctl disable --now actionstations-relay')
    const bad = io()
    expect(await main(['service', 'restart'], bad)).toBe(2)
  })

  it('service install creates a missing data directory before writing config.toml', async () => {
    const dir = join(tmp(), 'not', 'yet', 'there')
    const ran: string[] = []
    const win = io({ platform: 'win32', exec: (command) => ran.push(command) })
    expect(await main(['service', 'install', '--data-dir', dir], win)).toBe(0)
    expect(existsSync(join(dir, 'config.toml'))).toBe(true)
    expect(ran).toEqual(['schtasks', 'icacls', 'netsh', 'schtasks'])
  })
})
