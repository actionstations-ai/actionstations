// Types for scripts/stats-reminder.mjs (imported by tests/scripts/stats-reminder.test.ts).
export const LABEL: string
export const MESSAGE: string
export function notificationScript(message?: string): string
export function reminderPlist(when?: { weekday?: number; hour?: number; minute?: number }): string
export function plistPath(home?: string): string
