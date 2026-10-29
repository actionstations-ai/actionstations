import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatRecord, LanLog, redactPath } from './log'

describe('LAN connection log (spec 0407 NFR-2)', () => {
  it('writes fixed fields only and strips query and fragment from paths', () => {
    const line = formatRecord(new Date('2026-10-28T10:00:00Z'), {
      event: 'upgrade-rejected',
      remote: '192.168.4.31',
      path: '/v1/sessions/abc/ws?j=SECRETTOKEN&c=x#frag',
      status: 400,
      reason: 'Bad Request\n{"payload":"not here"}',
    })
    expect(line).toBe(
      '2026-10-28T10:00:00.000Z upgrade-rejected remote=192.168.4.31 path=/v1/sessions/abc/ws status=400 reason="Bad Request?{"payload":"not here"}"\n',
    )
    expect(line).not.toContain('SECRETTOKEN')
    expect(redactPath('/s/abc#AAAAkey')).toBe('/s/abc')
    expect(redactPath(undefined)).toBeUndefined()
  })

  it('never records anything but the record fields: a frame passed as reason is truncated and quoted', () => {
    const frame = JSON.stringify({ payload: { c: 'x'.repeat(500) } })
    const line = formatRecord(new Date(0), { event: 'close', reason: frame })
    expect(line.length).toBeLessThan(200)
  })

  it('rotates at the size cap and keeps three files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-lanlog-'))
    const log = new LanLog(join(dir, 'lan.log'), { maxBytes: 300, keep: 3 })
    for (let i = 0; i < 40; i++) {
      void log.write({ event: 'connect', remote: '10.0.0.1', clientId: 'c'.repeat(22) })
    }
    await log.flush()
    const files = readdirSync(dir).sort()
    expect(files).toEqual(['lan.log', 'lan.log.1', 'lan.log.2', 'lan.log.3'])
    for (const f of files) expect(readFileSync(join(dir, f)).length).toBeLessThanOrEqual(300)
  })
})
