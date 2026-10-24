// Archive download (#267) against a real http server on 127.0.0.1: hash while streaming,
// refuse a mismatch or an oversize body, time out, cancel, and leave nothing behind.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bytes, redirect, sha256, stall, startServer, type TestServer } from './test-server'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { downloadArchive, stagingDir } = await import('./download')

let server: TestServer
const archive = randomBytes(256 * 1024)
beforeAll(async () => {
  server = await startServer()
  server.route('/p.aspack', bytes(archive))
  server.route('/chunked.aspack', bytes(archive, false))
  server.route('/stall.aspack', stall(archive.subarray(0, 1024)))
  server.route('/to-http.aspack', redirect('http://packs.example.org/p.aspack'))
  server.route('/moved.aspack', redirect('/p.aspack'))
})
afterAll(() => server.close())
beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
})

const staged = (): string[] => {
  try {
    return readdirSync(stagingDir())
  } catch {
    return []
  }
}

describe('downloadArchive', () => {
  it('streams into userData/packs/.staging and verifies the sha256', async () => {
    const progress: number[] = []
    const got = await downloadArchive(
      { url: server.url('/p.aspack'), expectedSha256: sha256(archive), maxBytes: archive.length },
      { onProgress: (p) => progress.push(p.receivedBytes) },
    )
    expect(got.sha256).toBe(sha256(archive))
    expect(got.size).toBe(archive.length)
    expect(got.path.startsWith(stagingDir())).toBe(true)
    expect(got.path.endsWith('.aspack')).toBe(true)
    expect(readFileSync(got.path).equals(archive)).toBe(true)
    expect(progress.at(-1)).toBe(archive.length)
    expect(staged()).toHaveLength(1)
  })

  it('returns the hash for review when no sha256 is expected (Install from URL)', async () => {
    const got = await downloadArchive({
      url: server.url('/moved.aspack'),
      maxBytes: 200 * 1024 * 1024,
    })
    expect(got.sha256).toBe(sha256(archive))
  })

  it('refuses a sha256 mismatch and removes the file', async () => {
    await expect(
      downloadArchive({
        url: server.url('/p.aspack'),
        expectedSha256: 'b'.repeat(64),
        maxBytes: archive.length,
      }),
    ).rejects.toThrow(/does not match the expected sha256/)
    expect(staged()).toEqual([])
  })

  it("caps at the entry's size, counted on the bytes when there is no Content-Length", async () => {
    for (const path of ['/p.aspack', '/chunked.aspack']) {
      await expect(
        downloadArchive({ url: server.url(path), maxBytes: archive.length - 1 }),
      ).rejects.toThrow(/larger than/)
    }
    expect(staged()).toEqual([])
  })

  it('refuses a redirect to plain http', async () => {
    await expect(
      downloadArchive({ url: server.url('/to-http.aspack'), maxBytes: archive.length }),
    ).rejects.toThrow(/must use https/)
    expect(staged()).toEqual([])
  })

  it('times out when the body stops arriving', async () => {
    await expect(
      downloadArchive(
        { url: server.url('/stall.aspack'), maxBytes: archive.length },
        { timeoutMs: 150 },
      ),
    ).rejects.toThrow(/did not respond in time/)
    expect(staged()).toEqual([])
  })

  it('is cancellable mid-transfer and leaves nothing behind', async () => {
    const ac = new AbortController()
    const p = downloadArchive(
      { url: server.url('/stall.aspack'), maxBytes: archive.length },
      { signal: ac.signal, onProgress: (x) => x.receivedBytes > 0 && ac.abort() },
    )
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(staged()).toEqual([])
  })
})
