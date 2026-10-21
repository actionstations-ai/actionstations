// Versioned schema for index.sqlite (docs/05-DATA-MODEL.md). PRAGMA user_version records the
// applied version. The vector table is not here: its dimension depends on the active embedder
// and is managed by vector-table.ts.
import type Database from 'better-sqlite3'

type Migration = (db: Database.Database) => void

const MIGRATIONS: Migration[] = [
  // 1: documents, chunks, external-content FTS5 over (text, heading_path, heading) kept in
  // sync by triggers, meta key/value.
  (db) => {
    db.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        short_name TEXT,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        pages INTEGER NOT NULL DEFAULT 0,
        ingested_at TEXT NOT NULL
      );
      CREATE TABLE chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        heading_path TEXT NOT NULL DEFAULT '',
        -- Last segment of heading_path (the section's own title), indexed with extra weight.
        heading TEXT NOT NULL DEFAULT '',
        page INTEGER,
        ord INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX chunks_doc_ord ON chunks(doc_id, ord);
      CREATE VIRTUAL TABLE chunks_fts USING fts5(
        text, heading_path, heading,
        content='chunks', content_rowid='id',
        tokenize='porter unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, text, heading_path, heading)
          VALUES (new.id, new.text, new.heading_path, new.heading);
      END;
      CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text, heading_path, heading)
          VALUES ('delete', old.id, old.text, old.heading_path, old.heading);
      END;
      CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text, heading_path, heading)
          VALUES ('delete', old.id, old.text, old.heading_path, old.heading);
        INSERT INTO chunks_fts(rowid, text, heading_path, heading)
          VALUES (new.id, new.text, new.heading_path, new.heading);
      END;
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
  },
]

export const SCHEMA_VERSION = MIGRATIONS.length

/** Apply every migration newer than the database's user_version, each in its own transaction. */
export function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `index.sqlite schema v${current} is newer than this app (v${SCHEMA_VERSION}); rebuild the index`,
    )
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    db.transaction(() => {
      MIGRATIONS[v]!(db)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

/** Drop every index table and re-run migrations from scratch (Rebuild index). */
export function dropAll(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS chunk_vec;
      DROP TRIGGER IF EXISTS chunks_ai;
      DROP TRIGGER IF EXISTS chunks_ad;
      DROP TRIGGER IF EXISTS chunks_au;
      DROP TABLE IF EXISTS chunks_fts;
      DROP TABLE IF EXISTS chunks;
      DROP TABLE IF EXISTS documents;
      DROP TABLE IF EXISTS meta;
    `)
    db.pragma('user_version = 0')
  })()
  migrate(db)
}
