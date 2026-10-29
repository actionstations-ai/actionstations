// The regulations and frameworks bundled in the core pack (packs/regulations, packs/frameworks),
// compiled in so pack content checks can resolve a pack's references to them without loading
// the packs (#426). The app reads the same files through the pack layers at runtime.
import { Framework, Regulation } from '../schemas/compliance'

const REGULATION_FILES = import.meta.glob<unknown>('../../../packs/regulations/*.json', {
  eager: true,
  import: 'default',
})
const FRAMEWORK_FILES = import.meta.glob<unknown>('../../../packs/frameworks/*.json', {
  eager: true,
  import: 'default',
})

let cache: { regulations: Map<string, Regulation>; frameworks: Map<string, Framework> } | undefined

function load() {
  cache ??= {
    regulations: new Map(
      Object.values(REGULATION_FILES).map((raw) => {
        const r = Regulation.parse(raw)
        return [r.id, r] as const
      }),
    ),
    frameworks: new Map(
      Object.values(FRAMEWORK_FILES).map((raw) => {
        const f = Framework.parse(raw)
        return [f.id, f] as const
      }),
    ),
  }
  return cache
}

export const bundledRegulations = (): ReadonlyMap<string, Regulation> => load().regulations
export const bundledFrameworks = (): ReadonlyMap<string, Framework> => load().frameworks
