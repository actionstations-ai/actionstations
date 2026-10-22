import { create } from 'zustand'
import { describeError, type ErrorAction } from '../lib/errors'

export interface Toast {
  id: number
  tone: 'info' | 'success' | 'error'
  title: string
  body?: string
  action?: ErrorAction
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
  /** Hover / focus inside the toast stack holds auto-dismiss (WCAG 2.2.1). */
  hold: (on: boolean) => void
}

/** Info and success toasts close after this long; errors stay until dismissed. */
export const TOAST_MS = 8000

let seq = 0
let held = false
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function schedule(id: number, remove: (id: number) => void) {
  timers.set(
    id,
    setTimeout(() => {
      if (held) return schedule(id, remove)
      timers.delete(id)
      remove(id)
    }, TOAST_MS),
  )
}

export const useToasts = create<ToastState>((set) => {
  const remove = (id: number) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  return {
    toasts: [],
    push: (t) => {
      const id = ++seq
      set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
      if (t.tone !== 'error') schedule(id, remove)
    },
    dismiss: (id) => {
      clearTimeout(timers.get(id))
      timers.delete(id)
      remove(id)
    },
    hold: (on) => {
      held = on
    },
  }
})

/** An error toast's body: the user-facing message (lib/errors), never a raw stack. */
function errorBody(err: unknown): Pick<Toast, 'body' | 'action'> {
  if (err === undefined || err === null || err === '') return {}
  const { message, action } = describeError(err)
  return { body: message, ...(action ? { action } : {}) }
}

export const toast = {
  info: (title: string, body?: string) =>
    useToasts.getState().push({ tone: 'info', title, ...(body ? { body } : {}) }),
  success: (title: string, body?: string) =>
    useToasts.getState().push({ tone: 'success', title, ...(body ? { body } : {}) }),
  error: (title: string, err?: unknown) =>
    useToasts.getState().push({ tone: 'error', title, ...errorBody(err) }),
}
