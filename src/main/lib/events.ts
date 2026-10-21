import { BrowserWindow } from 'electron'
import { events, type EventName, type EventPayload } from '@shared/ipc'

type Listener = (name: EventName, payload: unknown) => void
const listeners = new Set<Listener>()

/** Broadcast a typed event to every renderer window (and in-process listeners, for tests). */
export function emit<E extends EventName>(name: E, payload: EventPayload<E>): void {
  const parsed = events[name].parse(payload)
  for (const l of listeners) l(name, parsed)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(`event:${name}`, parsed)
  }
}

export function onEmit(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
