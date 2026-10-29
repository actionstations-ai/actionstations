// Tips of the day (#443): bundled with the app, so showing one makes no request.
import { compareSemver } from '../schemas/pack'
import { TipList, type Tip } from './schema'
import raw from './tips.json'

export { Tip, TipGuide, TipList } from './schema'

/** Every tip in file order. Parsed at import, so a malformed file fails tests and startup. */
export const TIPS: readonly Tip[] = TipList.parse(raw)

/** The tips this app version can show: those without a `since` newer than `appVersion`. */
export function tipsFor(appVersion: string, tips: readonly Tip[] = TIPS): Tip[] {
  return tips.filter((t) => !t.since || newerOrEqual(appVersion, t.since))
}

function newerOrEqual(appVersion: string, since: string): boolean {
  try {
    return compareSemver(appVersion, since) >= 0
  } catch {
    // An app version that is not semver (a local build): show everything.
    return true
  }
}

/** Split a tip's guide into its repository path and heading anchor. */
export function guideParts(tip: Pick<Tip, 'guide'>): { path: string; anchor: string } {
  const [path, anchor] = tip.guide.split('#', 2) as [string, string]
  return { path, anchor }
}

/** The guide section on GitHub at this app's version (`main` for unpackaged builds). */
export function guideUrl(tip: Pick<Tip, 'guide'>, version: string, isPackaged: boolean): string {
  const { path, anchor } = guideParts(tip)
  const ref = isPackaged ? `v${version}` : 'main'
  return `https://github.com/actionstations-ai/actionstations/blob/${ref}/${path}#${anchor}`
}
