import { describeStoreContract } from '../../core/test/store-contract'
import { SqliteStore } from '../src/sqlite-store'
import { SqlStorageShim } from './shim'

describeStoreContract('SqliteStore on Durable Object SQL (shim)', () => {
  const sql = new SqlStorageShim()
  return {
    store: new SqliteStore(sql as unknown as SqlStorage),
    close: () => sql.db.close(),
  }
})
