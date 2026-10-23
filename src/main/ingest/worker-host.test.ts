// #210: the parse worker has a per-file timeout; a file that never finishes parsing fails its
// document with a clear error instead of holding an ingest slot until the user cancels.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTimeoutMs, runWorker } from './worker-host'

function script(name: string, body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'ttx-worker-')), name)
  writeFileSync(path, body)
  return path
}

const HANGS = script('hang.mjs', 'setInterval(() => {}, 1000)\n')
const REPLIES = script(
  'reply.mjs',
  `import { parentPort, workerData } from 'node:worker_threads'
parentPort.postMessage({ ok: true, result: { title: workerData.displayName, pages: 1, sections: [] } })
setInterval(() => {}, 1000)
`,
)

describe('parse worker host', () => {
  it('terminates a worker that does not answer in time and says why', async () => {
    const started = Date.now()
    const err = await runWorker(HANGS, '/x/big.pdf', 'big.pdf', undefined, 150).catch(
      (e: unknown) => e,
    )
    expect(err).toMatchObject({ code: 'INTERNAL' })
    expect((err as Error).message).toMatch(
      /Parsing big\.pdf took longer than 1 min and was stopped/,
    )
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('returns the worker result when it answers before the timeout', async () => {
    const result = await runWorker(REPLIES, '/x/a.pdf', 'a.pdf', undefined, 10_000)
    expect(result.title).toBe('a.pdf')
  })

  it('still cancels on abort before the timeout', async () => {
    const ac = new AbortController()
    const run = runWorker(HANGS, '/x/a.pdf', 'a.pdf', ac.signal, 10_000)
    ac.abort()
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('scales the timeout with file size, within bounds', () => {
    expect(parseTimeoutMs(0)).toBe(2 * 60_000)
    expect(parseTimeoutMs(25_000_000)).toBe(5 * 60_000)
    expect(parseTimeoutMs(512 * 1024 * 1024)).toBe(30 * 60_000)
  })
})
