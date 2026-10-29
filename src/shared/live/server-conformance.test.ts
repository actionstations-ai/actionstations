import { MemoryServer } from './transport-memory'
import { describeServerContract } from './server-conformance'

describeServerContract('MemoryServer (in process)', async (opts) => {
  const server = new MemoryServer(opts)
  return {
    connect: (o) => server.connect(o),
    kick: (id) => server.kick(id),
    end: () => server.end(),
    setJoinTokenHash: (hex) => server.setJoinTokenHash(hex),
    get lastIndex() {
      return server.lastIndex
    },
    get connected() {
      return server.connected
    },
    stop: async () => server.end(),
  }
})
