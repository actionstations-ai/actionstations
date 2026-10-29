/**
 * The slice of `node:sqlite` the test shim uses. This package compiles against the Workers types
 * (no `@types/node`), and the shim is the one place Node shows up: it stands in for a Durable
 * Object's `SqlStorage` so the adapter runs under the root Vitest without workerd.
 */
declare module 'node:sqlite' {
  export type SqlValue = string | number | bigint | null | Uint8Array
  export class StatementSync {
    all(...params: SqlValue[]): Array<Record<string, unknown>>
    get(...params: SqlValue[]): Record<string, unknown> | undefined
    run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
