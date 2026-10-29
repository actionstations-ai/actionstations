/**
 * Accessibility helpers: the polite live region new items are announced in, focus moves on
 * screen changes, the reduced-motion flag, and the optional vibration and sound cues (sound off
 * by default; iOS needs a gesture before audio, which the Settings switch provides).
 */
export interface Announcer {
  announce(text: string): void
}

/** One `aria-live="polite"` region appended to the body; repeated text still announces. */
export function createAnnouncer(doc: Document | undefined = globalDocument()): Announcer {
  if (!doc) return { announce: () => {} }
  const region = doc.createElement('div')
  region.setAttribute('aria-live', 'polite')
  region.setAttribute('aria-atomic', 'true')
  region.className = 'sr-only'
  region.id = 'live-region'
  doc.body.appendChild(region)
  let flip = false
  return {
    announce(text) {
      // A trailing space toggles so two identical announcements both read.
      flip = !flip
      region.textContent = flip ? text : text + String.fromCharCode(160)
    },
  }
}

/** Move focus to the screen heading after a screen change so screen readers follow. */
export function focusHeading(root: ParentNode | undefined = globalDocument()): void {
  const h = root?.querySelector<HTMLElement>('main h1, [data-screen] h1')
  if (!h) return
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1')
  h.focus({ preventScroll: false })
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function canVibrate(nav: Navigator | undefined = globalNavigator()): boolean {
  return typeof nav?.vibrate === 'function'
}

export function vibrate(ms = 40, nav: Navigator | undefined = globalNavigator()): boolean {
  try {
    return canVibrate(nav) ? nav!.vibrate(ms) : false
  } catch {
    return false
  }
}

let audio: AudioContext | undefined

/** Create (or resume) the audio context from a user gesture so later cues can play. */
export function unlockSound(): void {
  try {
    const Ctx = globalThis.AudioContext
    if (!Ctx) return
    audio ??= new Ctx()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = undefined
  }
}

/** A short two-tone cue, synthesized: no audio file, no request. */
export function playCue(): void {
  if (!audio) return
  try {
    const t = audio.currentTime
    const gain = audio.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    gain.connect(audio.destination)
    const osc = audio.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(660, t)
    osc.frequency.setValueAtTime(880, t + 0.15)
    osc.connect(gain)
    osc.start(t)
    osc.stop(t + 0.36)
  } catch {
    // audio unavailable: the live region and the badge still say it
  }
}

function globalDocument(): Document | undefined {
  return typeof document === 'undefined' ? undefined : document
}

function globalNavigator(): Navigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator
}
