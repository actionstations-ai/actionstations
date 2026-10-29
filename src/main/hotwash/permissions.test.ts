// Microphone permission decision table (#425, spec 0425 §5): audio only, main window only,
// the app's own page only, and only in the seconds after the user pressed Record.
import { afterEach, describe, expect, it } from 'vitest'
import {
  ARM_WINDOW_MS,
  allowPermissionCheck,
  allowPermissionRequest,
  armMicrophone,
  disarmMicrophone,
  isArmed,
  type PermissionAsk,
} from './permissions'

const APP = 'app://bundle/index.html#/p/x/scenarios/S1/facilitate'
const isAppUrl = (url: string) => url.startsWith('app://bundle/index.html')
const ask = (over: Partial<PermissionAsk> = {}): PermissionAsk => ({
  permission: 'media',
  mediaTypes: ['audio'],
  requestingUrl: APP,
  fromMainWindow: true,
  isAppUrl,
  armed: true,
  ...over,
})

afterEach(() => disarmMicrophone())

describe('allowPermissionRequest', () => {
  it('allows audio for the main window app page while armed', () => {
    expect(allowPermissionRequest(ask())).toBe(true)
  })

  it.each<[string, Partial<PermissionAsk>]>([
    ['not armed', { armed: false }],
    ['video', { mediaTypes: ['video'] }],
    ['audio and video', { mediaTypes: ['audio', 'video'] }],
    ['no media types (screen capture)', { mediaTypes: [] }],
    ['the presentation or a render window', { fromMainWindow: false }],
    ['another origin', { requestingUrl: 'https://example.com/' }],
    ['a file:// render page', { requestingUrl: 'file:///tmp/render/inject.html' }],
    ['geolocation', { permission: 'geolocation' }],
    ['notifications', { permission: 'notifications' }],
    ['clipboard', { permission: 'clipboard-read' }],
  ])('denies %s', (_name, over) => {
    expect(allowPermissionRequest(ask(over))).toBe(false)
  })
})

describe('allowPermissionCheck', () => {
  const check = (over: Partial<Parameters<typeof allowPermissionCheck>[0]> = {}) =>
    allowPermissionCheck({
      permission: 'media',
      mediaType: 'audio',
      requestingOrigin: 'app://bundle',
      fromMainWindow: true,
      isAppOrigin: (o) => o.startsWith('app://bundle'),
      armed: true,
      ...over,
    })

  it('answers like the request handler', () => {
    expect(check()).toBe(true)
    expect(check({ armed: false })).toBe(false)
    expect(check({ mediaType: 'video' })).toBe(false)
    expect(check({ fromMainWindow: false })).toBe(false)
    expect(check({ requestingOrigin: 'https://example.com' })).toBe(false)
    expect(check({ permission: 'hid' })).toBe(false)
  })
})

describe('arming', () => {
  it('lasts ten seconds from the Record press and ends on disarm', () => {
    const t0 = 1_000_000
    expect(isArmed(t0)).toBe(false)
    armMicrophone(t0)
    expect(isArmed(t0 + 1)).toBe(true)
    expect(isArmed(t0 + ARM_WINDOW_MS)).toBe(true)
    expect(isArmed(t0 + ARM_WINDOW_MS + 1)).toBe(false)
    armMicrophone(t0)
    disarmMicrophone()
    expect(isArmed(t0 + 1)).toBe(false)
  })
})
