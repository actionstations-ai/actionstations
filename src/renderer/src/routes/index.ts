import type { RouteDef } from './types'

// Each feature folder exports `routes` from routes/<feature>/index.ts(x). Discovered at
// build time so parallel workstreams never edit a shared router file.
const modules = import.meta.glob<{ routes: RouteDef[] }>('./*/index.{ts,tsx}', { eager: true })

export const allRoutes: RouteDef[] = Object.values(modules)
  .flatMap((m) => m.routes ?? [])
  .sort((a, b) => (a.nav?.order ?? 999) - (b.nav?.order ?? 999))
