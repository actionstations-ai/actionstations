export {
  closeAllConnections,
  closeConnection,
  connectionFor,
  openSqlite,
  unpackedPath,
  vecExtensionPath,
  type Db,
} from './connection'
export { dropAll, migrate, SCHEMA_VERSION } from './migrations'
export {
  chunkCount,
  ensureVectorTable,
  getMeta,
  setMeta,
  vectorCount,
  type EmbedderIdentity,
} from './vector-table'
