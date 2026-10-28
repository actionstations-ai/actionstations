# ADR-0019: Rename to Action Stations and migrate the old folders

Date: 2026-10-23 · Status: Accepted · Issue: #277

## Context

The app shipped as "Tabletop Generator" (package `tabletop-gen`, app id `com.mdcrowley.tabletopgen`) and has shown itself as "Action Stations" in the window and menu bar since #191, while keeping the old settings folder, projects folder and `.ttxproj` extension. The owner chose one name everywhere: display name **Action Stations**, machine name **`actionstations`**. Existing users have settings (providers, routing, recent projects), encrypted API keys and projects under the old names.

API keys are encrypted with Electron `safeStorage`. On macOS its key lives in a Keychain item named after the app (`<name> Safe Storage`, account `<name>`), read when the main message loop is created, after the main script ran (Electron `ElectronBrowserMainParts::PostCreateMainMessageLoop`). Because `app.setName('Action Stations')` has run at the top of the main script since #191, keys saved since then already use "Action Stations Safe Storage"; keys saved earlier used "Tabletop Generator Safe Storage" and have not decrypted since #191. On Windows the key is in `Local State` inside the settings folder (DPAPI), and on Linux the keyring entry is per app name, so moving the whole folder keeps them.

## Decision

- **Identity.** Package `actionstations`, productName "Action Stations", app id `com.mdcrowley.actionstations` (dev bundle `.dev`), installers `actionstations-<version>-<os>-<arch>.<ext>`, Linux executable `actionstations`. Internal identifiers stay (`TTX_*` env vars, `ttx-media://`, localStorage keys, schema and export format names): TTX is the domain term and renaming them breaks saved state.
- **Settings folder.** userData is `<appData>/Action Stations`. Before app ready, when it has no `settings.json` and `<appData>/Tabletop Generator` exists, the old folder is renamed to the new one; on failure it is copied into a staging folder that is then renamed into place. A failed copy keeps the old folder and the app uses it for that run. A marker `migration-from-tabletop-generator.json` records what happened. `TTX_USER_DATA` (isolated runs) never migrates. `TTX_TEST_HOME` stands in for the OS folders in tests.
- **Projects folder.** After ready, once per migrated install: `Documents/Tabletop Generator` moves to `Documents/Action Stations` with the same fallback, and recent-project paths and the default projects folder setting are rewritten. Job records in `jobs.json` that point into the old folder are rewritten on every start after a successful move (idempotent; this also catches up installs migrated before #309). If the move fails, the default projects folder stays the old one.
- **Keys.** After a migration, every stored key is test-decrypted. Keys that fail are removed from `secrets.json` after the whole file is copied to `secrets.unreadable-<time>.json`; the providers show "Key needs re-entry" and the Providers page shows a one-time notice. The real Keychain is never read by tests.
- **Extension.** New projects are `<name>.asproj`. `.ttxproj` folders open, list, duplicate and copy as before (the app only checks for `project.json`). The installers register both extensions. On macOS such folders become document packages, so double-clicking one opens it in the app (Finder: Show Package Contents to browse it); Windows Explorer always opens folders itself, so there the registration only matters for paths passed on the command line. No in-app "convert" action: renaming a folder that may be open or have running jobs is not a small safe change, and a user can rename the folder in Finder or Explorer and open it again.

## Consequences

- One launch after updating moves settings and projects; users see their providers, recent projects and (for keys saved since #191) their keys unchanged.
- Keys saved before #191 must be entered again once; the notice says which.
- The GitHub repo becomes `mdcrowley/actionstations` (GitHub redirects the old URL).

## Update (#394, #396)

The repositories moved to the `actionstations-ai` organization (`actionstations-ai/actionstations`), and before any public install the app id became `ai.actionstations.app` (dev bundle `ai.actionstations.app.dev`), matching the `ai.actionstations.*` pack ids. The settings folder and stored keys follow the product name, not the app id, so neither changed.
