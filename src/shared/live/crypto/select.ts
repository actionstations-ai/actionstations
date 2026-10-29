import type { CryptoProvider } from './provider'
import { createWebCryptoProvider } from './webcrypto'

let selected: Promise<CryptoProvider> | undefined

/** True when `crypto.subtle` exists (a secure context, or Node). */
export function hasSubtle(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === 'function'
}

/**
 * WebCrypto where it exists, else the noble fallback (loaded lazily). The choice is made once
 * per page or process.
 */
export function selectCryptoProvider(): Promise<CryptoProvider> {
  selected ??= hasSubtle()
    ? Promise.resolve(createWebCryptoProvider())
    : import('./noble').then((m) => m.createNobleProvider())
  return selected
}

/** Tests only: forget the cached choice. */
export function resetCryptoProviderSelection(): void {
  selected = undefined
}
