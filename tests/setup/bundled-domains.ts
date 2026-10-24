// Vitest setup (every test file): register the bundled domain profiles (ADR-0020) as main does
// at startup, so code and tests that resolve "transit" or "airport" without loading the packs
// see the same profiles the app does. Profiles come from packs/domains/*.json via the map.
import { registerBundledProfiles } from '../../src/shared/domains'
import { sourceBundledProfileEntries } from '../../src/main/packs/bundled-map'
import pkg from '../../package.json' with { type: 'json' }

registerBundledProfiles(sourceBundledProfileEntries(pkg.version))
