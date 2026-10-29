/**
 * What a connection looks like to the client library. Implemented by the app's `ws`-based
 * clients (#408, #409), the LAN loopback (#407), the player page's WebSocket (#411) and the
 * in-memory pair in `transport-memory.ts` for tests.
 */
export interface Transport {
  send(frame: string): void
  close(code?: number, reason?: string): void
  onFrame(cb: (frame: string) => void): () => void
  onClose(cb: (code: number, reason: string) => void): () => void
}

/** `sessionStorage`-like persistence for the client's `seq` and last catch-up index. */
export interface KeyValue {
  get(key: string): string | null | undefined
  set(key: string, value: string): void
}

export class MemoryKeyValue implements KeyValue {
  private readonly map = new Map<string, string>()
  get(key: string) {
    return this.map.get(key)
  }
  set(key: string, value: string) {
    this.map.set(key, value)
  }
}
