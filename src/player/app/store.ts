/**
 * A small observable store for the player page. One state object, immutable updates, React
 * reads through `useSyncExternalStore`. No Zustand: the bundle stays small and the store has
 * no dependencies, so the session logic is testable in Node.
 */
import { useSyncExternalStore } from 'react'

export type Listener = () => void

export class Store<S> {
  private state: S
  private readonly listeners = new Set<Listener>()

  constructor(initial: S) {
    this.state = initial
  }

  get(): S {
    return this.state
  }

  set(update: Partial<S> | ((state: S) => Partial<S>)): void {
    const patch = typeof update === 'function' ? update(this.state) : update
    let changed = false
    for (const key of Object.keys(patch) as (keyof S)[]) {
      if (!Object.is(patch[key], this.state[key])) changed = true
    }
    if (!changed) return
    this.state = { ...this.state, ...patch }
    for (const cb of [...this.listeners]) cb()
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
}

/** Read a slice of a store from a component; re-renders when the selected value changes. */
export function useStore<S, T>(store: Store<S>, select: (state: S) => T): T {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => select(store.get()),
    () => select(store.get()),
  )
}
