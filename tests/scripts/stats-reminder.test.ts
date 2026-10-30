// The weekly stats reminder (#381): a LaunchAgent that fires on Mondays at 09:00, shows a
// notification and runs nothing in the repository.
import { describe, expect, it } from 'vitest'
import {
  LABEL,
  MESSAGE,
  notificationScript,
  plistPath,
  reminderPlist,
} from '../../scripts/stats-reminder.mjs'

describe('stats reminder', () => {
  it('fires every Monday at 09:00', () => {
    const plist = reminderPlist()
    expect(plist).toContain(`<string>${LABEL}</string>`)
    expect(plist).toMatch(/<key>Weekday<\/key>\s*<integer>1<\/integer>/)
    expect(plist).toMatch(/<key>Hour<\/key>\s*<integer>9<\/integer>/)
    expect(plist).toMatch(/<key>Minute<\/key>\s*<integer>0<\/integer>/)
  })

  it('only runs osascript with a notification: no git, gh or pnpm is executed', () => {
    const args = [...reminderPlist().matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1])
    expect(args).toEqual([LABEL, '/usr/bin/osascript', '-e', notificationScript()])
    expect(notificationScript()).toMatch(/^display notification /)
  })

  it('tells the maintainer what to do', () => {
    expect(MESSAGE).toContain('pnpm stats')
    expect(MESSAGE).toContain('chore(stats)')
  })

  it('lives in the user LaunchAgents folder', () => {
    expect(plistPath('/Users/x')).toBe(`/Users/x/Library/LaunchAgents/${LABEL}.plist`)
  })
})
