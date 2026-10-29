import { MemoryStore } from '../src/store'
import { describeStoreContract } from './store-contract'

describeStoreContract('MemoryStore', () => ({ store: new MemoryStore() }))
