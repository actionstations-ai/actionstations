import { create } from 'zustand'

export interface Toast {
  id: number
  tone: 'info' | 'success' | 'error'
  title: string
  body?: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}

let seq = 0
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    if (t.tone !== 'error')
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 5000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = {
  info: (title: string, body?: string) =>
    useToasts.getState().push({ tone: 'info', title, ...(body ? { body } : {}) }),
  success: (title: string, body?: string) =>
    useToasts.getState().push({ tone: 'success', title, ...(body ? { body } : {}) }),
  error: (title: string, err?: unknown) =>
    useToasts.getState().push({
      tone: 'error',
      title,
      ...(err ? { body: err instanceof Error ? err.message : String(err) } : {}),
    }),
}
