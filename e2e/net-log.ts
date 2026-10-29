// Network logs for a launch (#443, #442): e2e/net-recorder.cjs records the main process's
// outbound traffic from its first line of code and Chromium's `--log-net-log` records every URL
// any session requests. `expectLoopbackOnly` fails when a record reached a host off 127.0.0.1.
// Same approach as e2e/packs.spec.ts.
import { expect } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const RECORDER = resolve('e2e/net-recorder.cjs')
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'])

export interface NetRecord {
  via: string
  host?: string
  origin?: string
  url?: string
}

export interface NetLog {
  /** Pass to launch(): env and Electron switches that turn both recorders on. */
  env: Record<string, string>
  args: string[]
  read: () => NetRecord[]
}

export function netLog(prefix: string): NetLog {
  const dir = mkdtempSync(join(tmpdir(), `ttx-${prefix}-net-`))
  return {
    env: { TTX_NET_LOG: join(dir, 'node.jsonl') },
    args: ['-r', RECORDER, `--log-net-log=${join(dir, 'chromium.json')}`],
    read: () => readNetLogs(dir),
  }
}

function readNetLogs(dir: string): NetRecord[] {
  const node = join(dir, 'node.jsonl')
  const records: NetRecord[] = existsSync(node)
    ? readFileSync(node, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as NetRecord)
    : []
  expect(
    records.some((r) => r.via === 'start'),
    'the recorder ran in the main process',
  ).toBe(true)
  const chromium = join(dir, 'chromium.json')
  expect(existsSync(chromium), 'Chromium wrote its network log').toBe(true)
  for (const m of readFileSync(chromium, 'utf8').matchAll(/"url":"([^"]+)"/g))
    records.push({ via: 'chromium', url: m[1]! })
  return records
}

/** The host a record reached, or undefined for local pipes and the app's own schemes. */
function hostOf(r: NetRecord): string | undefined {
  const url = r.url ?? r.origin
  if (url) {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ws:'
      ? u.hostname
      : undefined
  }
  return r.host ?? undefined
}

/** Fails with the offending records when any host is not loopback. */
export function expectLoopbackOnly(records: NetRecord[]): void {
  const remote = records
    .filter((r) => r.via !== 'start')
    .filter((r) => {
      const host = hostOf(r)
      return host !== undefined && !LOOPBACK.has(host)
    })
  expect(remote, 'requests that left 127.0.0.1').toEqual([])
}
