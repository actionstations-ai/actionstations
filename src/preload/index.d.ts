import type { Bridge } from './index'

declare global {
  interface Window {
    ttx: Bridge
  }
}
export {}
