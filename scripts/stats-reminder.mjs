#!/usr/bin/env node
// A weekly reminder on the maintainer's Mac to record repository stats (#381). `pnpm stats`
// adds a snapshot to docs/stats/history.json, but GitHub keeps no history, so the chart only
// gains a point when someone runs it. The reminder is a user LaunchAgent that shows a macOS
// notification every Monday at 09:00. It runs nothing in the repository and commits nothing: the
// snapshot still goes through a small `chore(stats)` pull request, so main stays protected.
//
//   node scripts/stats-reminder.mjs install | uninstall | status    (pnpm stats:reminder <command>)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LABEL = 'ai.actionstations.stats-reminder'
export const MESSAGE =
  'Run pnpm stats on an up-to-date main and open a chore(stats) pull request (#381).'

const escapeXml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** The AppleScript the agent runs: one notification, no sound, nothing else. */
export function notificationScript(message = MESSAGE) {
  return `display notification "${message.replaceAll('"', '\\"')}" with title "Action Stations" subtitle "Weekly repository stats"`
}

/** The LaunchAgent property list: every Monday (Weekday 1) at 09:00 local time. */
export function reminderPlist({ weekday = 1, hour = 9, minute = 0 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/osascript</string>
    <string>-e</string>
    <string>${escapeXml(notificationScript())}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>${weekday}</integer>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
</dict>
</plist>
`
}

export const plistPath = (home = homedir()) =>
  join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`)

const domain = () => `gui/${process.getuid()}`

function launchctl(...args) {
  return execFileSync('launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function loaded() {
  try {
    launchctl('print', `${domain()}/${LABEL}`)
    return true
  } catch {
    return false
  }
}

export function install() {
  const path = plistPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, reminderPlist())
  if (loaded()) launchctl('bootout', `${domain()}/${LABEL}`)
  launchctl('bootstrap', domain(), path)
  console.log(`Installed ${path}: a notification every Monday at 09:00.`)
}

export function uninstall() {
  if (loaded()) launchctl('bootout', `${domain()}/${LABEL}`)
  if (existsSync(plistPath())) unlinkSync(plistPath())
  console.log('Removed the weekly stats reminder.')
}

export function status() {
  console.log(
    `${LABEL}: ${loaded() ? 'loaded' : 'not loaded'}; ${plistPath()} ${existsSync(plistPath()) ? 'exists' : 'is missing'}`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  if (process.platform !== 'darwin') {
    console.error('The stats reminder is a macOS LaunchAgent.')
    process.exit(1)
  }
  const run = { install, uninstall, status }[command]
  if (!run) {
    console.error('Usage: node scripts/stats-reminder.mjs install | uninstall | status')
    process.exit(2)
  }
  run()
}
