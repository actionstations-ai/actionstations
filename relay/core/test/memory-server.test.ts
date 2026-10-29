/**
 * The reference implementation passes the suite it defines: `MemoryServer` from
 * `src/shared/live/transport-memory.ts` (spec 0406) under the same tests as every real server.
 */
import { describeServerConformance } from './conformance'
import { memoryServerFactory } from './harness'

describeServerConformance('MemoryServer (src/shared/live)', memoryServerFactory)
