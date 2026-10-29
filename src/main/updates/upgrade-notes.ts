// Known upgrade caveats (#442), shown on the update banner and in the release notes dialog when
// the installed version, the platform and the new release match. Ranges are written ">=a <b"
// (either bound optional) and compared with compareSemver; no new dependency.
import { compareSemver } from '@shared/schemas/pack'

export interface UpgradeNote {
  /** Installed versions this applies to. */
  from: string
  /** Release versions this applies to. */
  to: string
  platform?: NodeJS.Platform
  text: string
}

export const UPGRADE_NOTES: readonly UpgradeNote[] = [
  {
    from: '>=0.5.0 <0.5.1',
    to: '>=0.5.1',
    platform: 'win32',
    text: 'The app id changed in 0.5.1. Uninstall Action Stations 0.5.0 before installing this version; your settings and projects stay.',
  },
]

/** Whether `version` satisfies a range such as ">=0.5.0 <0.5.1", ">=1.0.0" or "0.5.0". */
export function inRange(version: string, range: string): boolean {
  try {
    return range
      .trim()
      .split(/\s+/)
      .every((part) => {
        const m = /^(>=|<=|>|<|=)?(.+)$/.exec(part)
        if (!m) return false
        const d = compareSemver(version, m[2]!)
        switch (m[1] ?? '=') {
          case '>=':
            return d >= 0
          case '>':
            return d > 0
          case '<=':
            return d <= 0
          case '<':
            return d < 0
          default:
            return d === 0
        }
      })
  } catch {
    return false
  }
}

/** The caveats for upgrading from `installed` to `latest` on `platform`. */
export function notesFor(
  installed: string,
  latest: string,
  platform: NodeJS.Platform,
  notes: readonly UpgradeNote[] = UPGRADE_NOTES,
): string[] {
  return notes
    .filter((n) => (!n.platform || n.platform === platform) && inRange(installed, n.from))
    .filter((n) => inRange(latest, n.to))
    .map((n) => n.text)
}
