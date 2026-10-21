import { ipcMain } from 'electron'
import { CHANNEL_NAMES } from '@shared/ipc'
import { dispatch, mergeHandlers, type HandlerMap } from './registry'

// Each domain owns one file in ./handlers; they are discovered at build time so
// parallel workstreams never edit a shared registry.
const modules = import.meta.glob<{ default: HandlerMap }>('./handlers/*.ts', { eager: true })

export const handlers = mergeHandlers(
  Object.fromEntries(Object.entries(modules).map(([file, mod]) => [file, mod.default])),
)

/**
 * Register every channel. Only frames showing the app's own renderer may call in;
 * hidden render/present windows load LLM-filled HTML and must never reach the API.
 */
export function registerIpc(isTrustedUrl: (url: string) => boolean): void {
  for (const name of CHANNEL_NAMES) {
    ipcMain.handle(name, (event, raw) => {
      const url = event.senderFrame?.url ?? ''
      if (!isTrustedUrl(url)) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'IPC not allowed from this frame' },
        }
      }
      return dispatch(handlers, name, raw, { event })
    })
  }
}
