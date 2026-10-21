// Sandboxed preload: exposes a minimal, generic bridge. Typing lives in
// src/renderer/src/lib/api.ts, built from the shared contract, so this file never
// needs to change when channels are added.
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

const bridge = {
  invoke: (channel: string, payload: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channel, payload),
  on: (event: string, listener: (payload: unknown) => void): (() => void) => {
    const wrapped = (_e: IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(`event:${event}`, wrapped)
    return () => ipcRenderer.removeListener(`event:${event}`, wrapped)
  },
  /** Absolute path of a File dropped onto the window (drag-and-drop import). */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  platform: process.platform,
}

contextBridge.exposeInMainWorld('ttx', bridge)

export type Bridge = typeof bridge
