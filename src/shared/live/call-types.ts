/** Inject types that can play as a voice call on devices (spec 0429). */
export const CALL_INJECT_TYPES: ReadonlySet<string> = new Set([
  'phone_call',
  'radio_call',
  'voicemail',
])

export const isCallInject = (inject: { type: string } | undefined): boolean =>
  !!inject && CALL_INJECT_TYPES.has(inject.type)
