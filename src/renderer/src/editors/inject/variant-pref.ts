// The preview variant chosen for an inject is a per-viewer preference (the Inject record has
// no variant field), remembered in localStorage. Storage may be unavailable; never throw.
const KEY = (injectId: string) => `ttx.inject-variant.${injectId}`

export function readVariant(injectId: string): string | null {
  try {
    return localStorage.getItem(KEY(injectId))
  } catch {
    return null
  }
}

export function writeVariant(injectId: string, variant: string): void {
  try {
    localStorage.setItem(KEY(injectId), variant)
  } catch {
    // Preference only; ignore storage errors.
  }
}

/** The variant to use: the remembered one when the template still has it, else the first. */
export function pickVariant(variants: string[], remembered: string | null): string {
  if (remembered && variants.includes(remembered)) return remembered
  return variants[0] ?? 'default'
}
