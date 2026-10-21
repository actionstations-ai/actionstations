import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

const { onQuit } = vi.hoisted(() => ({ onQuit: vi.fn() }))
vi.mock('electron', () => ({ app: { on: onQuit } }))

const db = await import('.')

const tmpFile = (): string => join(mkdtempSync(join(tmpdir(), 'ttx-db-')), 'index.sqlite')

describe('index database', () => {
  afterEach(() => db.closeAllConnections())

  it('rewrites app.asar extension paths to app.asar.unpacked', () => {
    const packed = ['', 'App', 'resources', 'app.asar', 'node_modules', 'vec0.dylib'].join(sep)
    expect(db.unpackedPath(packed)).toBe(packed.replace('app.asar', 'app.asar.unpacked'))
    const dev = ['', 'repo', 'node_modules', 'vec0.dylib'].join(sep)
    expect(db.unpackedPath(dev)).toBe(dev)
    // Already unpacked paths are left alone.
    const unpacked = packed.replace('app.asar', 'app.asar.unpacked')
    expect(db.unpackedPath(unpacked)).toBe(unpacked)
  })

  it('migrates a new file to the current schema version', () => {
    const conn = db.openSqlite(tmpFile())
    expect(conn.pragma('user_version', { simple: true })).toBe(db.SCHEMA_VERSION)
    const tables = (
      conn.prepare("SELECT name FROM sqlite_master WHERE type IN ('table')").all() as {
        name: string
      }[]
    ).map((t) => t.name)
    expect(tables).toEqual(expect.arrayContaining(['documents', 'chunks', 'chunks_fts', 'meta']))
    conn.close()
  })

  it('refuses a database from a newer app version', () => {
    const file = tmpFile()
    const conn = db.openSqlite(file)
    conn.pragma(`user_version = ${db.SCHEMA_VERSION + 1}`)
    conn.close()
    expect(() => db.openSqlite(file)).toThrow(/newer than this app/)
  })

  it('caches one connection per file and closes them all on quit', () => {
    const file = tmpFile()
    const a = db.connectionFor(file)
    expect(db.connectionFor(file)).toBe(a)
    expect(onQuit).toHaveBeenCalledWith('will-quit', db.closeAllConnections)
    db.closeAllConnections()
    expect(a.open).toBe(false)
    const b = db.connectionFor(file)
    expect(b).not.toBe(a)
    expect(b.open).toBe(true)
  })

  it('creates the vector table for the embedder and recreates it on a dims change', () => {
    const conn = db.connectionFor(tmpFile())
    expect(db.ensureVectorTable(conn, { key: 'hash:v1', dims: 384 })).toBe(false)
    expect(db.ensureVectorTable(conn, { key: 'hash:v1', dims: 384 })).toBe(false)
    conn
      .prepare(
        "INSERT INTO documents(id, title, kind, path, ingested_at) VALUES ('d', 't', 'plan', 'p', 'now')",
      )
      .run()
    conn.prepare("INSERT INTO chunks(doc_id, ord, text) VALUES ('d', 0, 'x')").run()
    expect(db.ensureVectorTable(conn, { key: 'ollama:nomic', dims: 768 })).toBe(true)
    expect(db.getMeta(conn, 'embedder_dims')).toBe('768')
    expect(db.getMeta(conn, 'vectors_stale')).toBe('1')
    const sql = (
      conn.prepare("SELECT sql FROM sqlite_master WHERE name = 'chunk_vec'").get() as {
        sql: string
      }
    ).sql
    expect(sql).toContain('float[768]')
  })

  it('dropAll leaves a fresh, migrated schema', () => {
    const conn = db.connectionFor(tmpFile())
    db.ensureVectorTable(conn, { key: 'hash:v1', dims: 384 })
    db.dropAll(conn)
    expect(conn.pragma('user_version', { simple: true })).toBe(db.SCHEMA_VERSION)
    expect(db.getMeta(conn, 'embedder_key')).toBeUndefined()
    expect(db.chunkCount(conn)).toBe(0)
  })
})
