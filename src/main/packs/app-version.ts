// The app version pack checks compare against (minAppVersion, catalog entries). Read only at
// the boundary (IPC handlers, startup) and passed down, so the logic takes it as a parameter.
// An unpackaged run (dev, e2e) may set TTX_APP_VERSION to stand in for a later release, so
// tests can install packs that need 0.3.0 while package.json still says 0.1.0.
import { app } from 'electron'

export function packAppVersion(): string {
  const override = process.env.TTX_APP_VERSION
  if (override && !app.isPackaged) return override
  return app.getVersion()
}
