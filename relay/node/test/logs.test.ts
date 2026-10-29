import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertLoggable, openLogs, RedactionError, RotatingJsonl } from '../src/logs'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'relay-logs-'))
  dirs.push(d)
  return d
}

describe('logs', () => {
  it('refuses any record that carries a field that could hold content or a credential', () => {
    expect(() => assertLoggable({ event: 'accept', client: 'x' })).not.toThrow()
    for (const bad of [
      { payload: {} },
      { frame: '{}' },
      { token: 'x' },
      { nested: { deeper: { controllerToken: 'x' } } },
      { list: [{ joinToken: 'x' }] },
      { authorization: 'Bearer x' },
      { entries: [] },
      { bytes: 'chunk' },
    ]) {
      expect(() => assertLoggable(bad)).toThrow(RedactionError)
    }
  })

  it('rotates at the size cap and keeps five files', () => {
    const dir = tmp()
    const log = new RotatingJsonl(join(dir, 'c.log'), { maxBytes: 200, keep: 5 })
    for (let i = 0; i < 60; i++) log.write({ event: 'accept', n: i, filler: 'x'.repeat(40) })
    log.close()
    expect(existsSync(join(dir, 'c.log'))).toBe(true)
    expect(existsSync(join(dir, 'c.log.5'))).toBe(true)
    expect(existsSync(join(dir, 'c.log.6'))).toBe(false)
    const newest = readFileSync(join(dir, 'c.log'), 'utf8').trim().split('\n')
    expect(JSON.parse(newest[newest.length - 1]!).n).toBe(59)
    const older = readFileSync(join(dir, 'c.log.1'), 'utf8').trim().split('\n')
    expect(JSON.parse(older[older.length - 1]!).n).toBeLessThan(59)
  })

  it('writes connection events and server messages as JSON lines, filtered by level', () => {
    const dir = tmp()
    const echoed: string[] = []
    const logs = openLogs(
      dir,
      'warn',
      () => 1_700_000_000_000,
      (l) => echoed.push(l),
    )
    logs.connection({
      event: 'accept',
      session: 's',
      clientId: 'c',
      remote: '10.0.0.1',
    })
    logs.info('ignored at warn level')
    logs.warn('something', { port: 8485 })
    logs.close()
    const conn = JSON.parse(readFileSync(join(dir, 'connections.log'), 'utf8').trim())
    expect(conn).toEqual({
      time: '2023-11-14T22:13:20.000Z',
      event: 'accept',
      session: 's',
      clientId: 'c',
      remote: '10.0.0.1',
    })
    const server = readFileSync(join(dir, 'server.log'), 'utf8').trim().split('\n')
    expect(server).toHaveLength(1)
    expect(JSON.parse(server[0]!)).toMatchObject({
      level: 'warn',
      message: 'something',
      port: 8485,
    })
    expect(echoed).toEqual(['2023-11-14T22:13:20.000Z warn something'])
    expect(() => logs.warn('x', { payload: 1 })).toThrow(RedactionError)
  })
})
