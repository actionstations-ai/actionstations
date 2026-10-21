// SQLite connections for project indexes (index.sqlite). One connection per file, cached for
// the life of the app and closed on quit. sqlite-vec is loaded into every connection.
import Database from 'better-sqlite3'
import { app } from 'electron'
import { resolve, sep } from 'node:path'
import { getLoadablePath } from 'sqlite-vec'
import { migrate } from './migrations'

export type Db = Database.Database

const ASAR = `${sep}app.asar${sep}`
const ASAR_UNPACKED = `${sep}app.asar.unpacked${sep}`

/**
 * Native extensions can't be loaded from inside app.asar; electron-builder unpacks
 * sqlite-vec (asarUnpack) next to it, so point at the unpacked copy in packaged builds.
 */
export function unpackedPath(path: string): string {
  return path.includes(ASAR) ? path.replace(ASAR, ASAR_UNPACKED) : path
}

export function vecExtensionPath(): string {
  return unpackedPath(getLoadablePath())
}

/** Open (or create) a database file with WAL, foreign keys, sqlite-vec, and the current schema. */
export function openSqlite(file: string): Db {
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    db.loadExtension(vecExtensionPath())
    migrate(db)
    return db
  } catch (err) {
    db.close()
    throw err
  }
}

const connections = new Map<string, Db>()
let quitHookInstalled = false

function installQuitHook(): void {
  if (quitHookInstalled) return
  quitHookInstalled = true
  // `app` is undefined when this module runs outside Electron's main process (scripts, tests).
  app?.on?.('will-quit', closeAllConnections)
}

/** The cached connection for a database file, opening it on first use. */
export function connectionFor(file: string): Db {
  const key = resolve(file)
  const existing = connections.get(key)
  if (existing?.open) return existing
  const db = openSqlite(key)
  connections.set(key, db)
  installQuitHook()
  return db
}

export function closeConnection(file: string): void {
  const key = resolve(file)
  const db = connections.get(key)
  connections.delete(key)
  if (db?.open) db.close()
}

export function closeAllConnections(): void {
  for (const key of [...connections.keys()]) closeConnection(key)
}
