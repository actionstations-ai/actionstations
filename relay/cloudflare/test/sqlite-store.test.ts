import { describe, expect, it } from 'vitest'
import { describeHubStoreContract } from '@shared/live/hub-store-conformance'
import { SqliteHubStore } from '../src/sqlite-store'
import { SqlStorageShim } from './shim'

describeHubStoreContract('SqliteHubStore on Durable Object SQL (shim)', () => {
  const sql = new SqlStorageShim()
  return { store: new SqliteHubStore(sql as unknown as SqlStorage), close: () => sql.db.close() }
})

describe('SqliteHubStore: the adapter record', () => {
  it('keeps the session record next to the hub state and survives clear()', () => {
    const store = new SqliteHubStore(new SqlStorageShim() as unknown as SqlStorage)
    expect(store.record()).toBeUndefined()
    const record = {
      sessionId: 'session-00000000000000',
      createdAt: 1,
      expiresAt: 2,
      controllerTokenHashes: ['a'.repeat(64)],
    }
    store.setRecord(record)
    store.setState({ joinTokenHash: 'b'.repeat(64), ended: false })
    store.clear()
    expect(store.record()).toEqual(record)
    expect(store.state()).toEqual({ joinTokenHash: 'b'.repeat(64), ended: false })
  })
})
