import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findDeniedField, LogWriter, readEntries } from './log'

const dir = () => mkdtempSync(join(tmpdir(), 'ttx-livelog-'))

async function all(path: string) {
  const out = []
  for await (const e of readEntries(path)) out.push(e)
  return out
}

describe('session log writer (spec 0417 FR-2..FR-4)', () => {
  it('assigns i and at in call order and appends one JSON line per entry', async () => {
    const path = join(dir(), 'log.jsonl')
    let tick = 0
    const log = await LogWriter.open(
      path,
      'role',
      () => new Date(1_700_000_000_000 + tick++ * 1000),
    )
    const a = log.append({
      kind: 'session.start',
      actor: { kind: 'controller' },
      data: { connection: 'lan' },
    })
    const b = log.append({
      kind: 'client.join',
      actor: { kind: 'client', clientRef: 'ab12cd34' },
      data: {},
    })
    expect((await a).i).toBe(1)
    expect((await b).i).toBe(2)
    expect((await b).at).toBe('2023-11-14T22:13:21.000Z')
    const lines = readFileSync(path, 'utf8').split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('')
    expect(await all(path)).toHaveLength(2)
  })

  it('strips display names at level role and keeps them at level named', async () => {
    const d = dir()
    const role = await LogWriter.open(join(d, 'role.jsonl'), 'role')
    const named = await LogWriter.open(join(d, 'named.jsonl'), 'named')
    const actor = { kind: 'client' as const, clientRef: 'ab12cd34', displayName: 'Dana' }
    expect(
      (await role.append({ kind: 'client.join', actor, data: {} })).actor.displayName,
    ).toBeUndefined()
    expect((await named.append({ kind: 'client.join', actor, data: {} })).actor.displayName).toBe(
      'Dana',
    )
  })

  it('refuses entries that carry client ids, tokens, keys or addresses anywhere', async () => {
    const log = await LogWriter.open(join(dir(), 'log.jsonl'), 'named')
    for (const data of [
      { clientId: 'x' },
      { nested: { deep: { joinToken: 'x' } } },
      { list: [{ key: 'x' }] },
      { remoteAddress: '10.0.0.1' },
      { inviteUrl: 'https://…#key' },
    ]) {
      await expect(
        log.append({ kind: 'anomaly', actor: { kind: 'system' }, data }),
      ).rejects.toThrow(/forbidden field/)
    }
    expect(findDeniedField({ ok: { fine: 1 } })).toBeUndefined()
    expect(log.lastIndex).toBe(0)
  })

  it('refuses a line over 64 KiB', async () => {
    const log = await LogWriter.open(join(dir(), 'log.jsonl'), 'role')
    await expect(
      log.append({
        kind: 'message',
        actor: { kind: 'client' },
        data: { text: 'x'.repeat(70_000) },
      }),
    ).rejects.toThrow(/64 KiB/)
  })

  it('drops a torn last line on read and continues numbering after the last complete one', async () => {
    const path = join(dir(), 'log.jsonl')
    const first = await LogWriter.open(path, 'role')
    await first.append({ kind: 'session.start', actor: { kind: 'controller' }, data: {} })
    await first.append({
      kind: 'clock.state',
      actor: { kind: 'controller' },
      data: { elapsedMin: 5 },
    })
    appendFileSync(path, '{"i":3,"at":"2026-10-28T10:00:00Z","kind":"message","act')
    expect((await all(path)).map((e) => e.i)).toEqual([1, 2])
    const resumed = await LogWriter.open(path, 'role')
    expect(resumed.lastIndex).toBe(2)
    const next = await resumed.append({
      kind: 'session.resume',
      actor: { kind: 'controller' },
      data: {},
    })
    expect(next.i).toBe(3)
  })

  it('reads nothing from a missing file', async () => {
    expect(await all(join(dir(), 'missing.jsonl'))).toEqual([])
  })
})
