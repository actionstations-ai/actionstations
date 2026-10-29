import { MemoryHubStore } from './hub'
import { describeHubStoreContract } from './hub-store-conformance'

describeHubStoreContract('MemoryHubStore', () => ({ store: new MemoryHubStore() }))
