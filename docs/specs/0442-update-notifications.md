# Spec 0442: Update notifications (opt-in)

Issue: #442 · Milestone: 0.6.0 · Status: Implemented · Depends on: none · Related: #380 (code signing), #443 (tip of the day), ADR-0018 (pack fetching)

## Summary

The app can tell the user that a newer release of Action Stations exists, show its release notes and open the download page. The check is off until the user turns it on: the setup wizard asks once (existing users get the same question once on the Projects screen), and **Settings → Updates → Check now** works at any time. The check is one unauthenticated GET to the public GitHub releases API; it sends nothing about the user or their projects, and nothing is downloaded or installed by the app.

## Requirements

### User stories

- As a planner who installed the app months ago, I want to hear that a newer version exists, so that I get fixes and new features without watching GitHub.
- As a security officer at an agency, I want the app to make no network call I did not turn on, and to see exactly what the check sends and where, so that I can approve its use.
- As a user on an air-gapped or restricted network, I want to leave the check off and never see an error about it.
- As a Windows user of 0.5.0, I want to be told that I must uninstall before installing the newer version, so that I don't end up with two copies.

### Functional requirements

- **FR-1** A setting `updates.check` with three values: `ask` (default for every install, new and existing), `on`, `off`. `ask` behaves exactly like `off` for network purposes.
- **FR-2** The setup wizard's last step (`DoneStep`) shows an unticked checkbox "Check for new versions of Action Stations when the app starts" with one line saying what is sent and where. Finishing the wizard stores `on` or `off`, never leaves `ask`.
- **FR-3** A user who never ran the wizard (existing install, or skipped it) and whose setting is `ask` sees a one-time card on the Projects screen asking the same question, with **Turn on** and **No thanks**. Either answer stores `on` / `off` and removes the card for good. Closing the card without answering keeps `ask` and shows it again on the next launch, at most three launches, after which the app stores `off`.
- **FR-4** With `on`, the app checks once at startup, at most once per 24 hours (by `updates.lastCheckedAt`), 10 seconds after the main window is ready, in the main process, never blocking startup.
- **FR-5** **Settings → Updates** shows the current setting (a switch), the installed version, the time of the last check and its result, and a **Check now** button. **Check now** runs a check regardless of the setting (pressing it is the user starting the request) and is disabled while a check runs and for 60 seconds after one finishes.
- **FR-6** The check requests `GET https://api.github.com/repos/actionstations-ai/actionstations/releases/latest`. That endpoint returns the newest published, non-draft, non-prerelease release. The app compares its `tag_name` (without a leading `v`) with its own version using `compareSemver` from `src/shared/schemas/pack.ts`.
- **FR-7** When the release is newer and its version is not `updates.dismissedVersion`, the Projects screen shows a banner: "Action Stations X.Y.Z is available (you have A.B.C)" with **Release notes**, **Download page** and **Not now**. **Not now** stores the version in `dismissedVersion`; a later release shows the banner again. Settings → Updates always shows the latest result, dismissed or not.
- **FR-8** **Release notes** opens a dialog with the release name, date and body, rendered with the existing text-only Markdown component (`src/renderer/src/routes/packs/PackDescription.tsx`, no raw HTML or images; links are shown as their text and address, not clickable, exactly as in pack descriptions).
- **FR-9** **Download page** opens the release's `html_url` in the OS browser. The dialog also names the installer file for this platform when the release lists it (`-mac-arm64.dmg`, `-win-x64-setup.exe`, `-linux-x86_64.AppImage`, matching the names in `docs/RELEASING.md`) and its `.sha256` companion, and links to the new "Updates" section of the Getting started guide (task 5), which explains the checksum and the operating systems' warnings for unsigned builds (taken from "Until then: installing unsigned builds" in `docs/RELEASING.md`). The guide's "1. Install and launch" still says installers are not published; task 5 corrects it. The app never downloads or runs an installer.
- **FR-10** Upgrade notes: a small table of known upgrade caveats, keyed by installed version range, target range and platform, adds a highlighted line to the banner and dialog. The first entry: installed `0.5.0`, platform `win32`, target `>=0.5.1`: "The app id changed in 0.5.1. Uninstall Action Stations 0.5.0 before installing this version; your settings and projects stay." (CHANGELOG 0.5.1, #396).
- **FR-11** When the installed version is newer than or equal to the latest release (a dev build, a prerelease), the result reads "You have the latest release" (or "You are ahead of the latest release (X.Y.Z)").
- **FR-12** Failures are shown only in Settings → Updates (never as a toast or banner for an automatic check): offline, timed out, rate limited ("GitHub allows 60 checks an hour from one network; try again after HH:MM", from `x-ratelimit-reset`), unexpected answer. An automatic check that fails records the error and does not retry until the next launch after 24 hours.
- **FR-13** Turning the setting off stops future automatic checks immediately; a check already in flight is aborted.

### Non-functional requirements

- **NFR-1** Cost: the public GitHub REST API needs no token or account; nothing to host (Project rules 1).
- **NFR-2** Privacy: no request until the user turns the check on or presses Check now (Project rules 3). The request carries no cookies, no token, no query string and a plain `User-Agent: ActionStations/<version>` naming the app and its version (owner decision; no platform). GitHub sees the IP address, the time and the app version; the setting's description says so. The OS, projects and settings never leave the computer.
- **NFR-3** Accessibility: WCAG 2.2 AA. The banner is a `region` with a heading, not a modal; it does not take focus; result changes in Settings are announced with `aria-live="polite"`; all controls work by keyboard; light and dark themes.
- **NFR-4** Offline and performance: the check runs in main, times out after 15 s without bytes, reads at most 1 MB, and never delays startup or blocks the UI. With the setting off the app works fully offline, as today.
- **NFR-5** Platforms: macOS, Windows and Linux; asset matching by file name suffix only.

### Out of scope

- Downloading or installing updates (`electron-updater`, Squirrel, delta updates). The installers are unsigned (#380, `docs/RELEASING.md`), so an in-app installer would teach users to run unsigned binaries the app fetched by itself. Revisit after #380.
- Prerelease or beta channels.
- Update checks for packs (the pack catalog already offers updates on Browse/Refresh).
- Any mirror or proxy of the releases API.

## Design

### Data model (`src/shared/schemas/settings.ts`)

```ts
export const UpdateCheckMode = z.enum(['ask', 'on', 'off'])

export const LatestRelease = z.object({
  version: z.string().max(64), // tag without "v", validated by SemVer
  name: z.string().max(200),
  publishedAt: IsoDateTime,
  url: z.string().max(2048), // html_url, checked by isReleasePageUrl
  notes: z.string().max(50_000), // body, Markdown
  assets: z
    .array(z.object({ name: z.string().max(200), size: z.number().int().nonnegative() }))
    .max(50),
})

export const UpdateSettings = z.object({
  check: UpdateCheckMode.default('ask'),
  askedCount: z.number().int().min(0).max(3).default(0),
  lastCheckedAt: IsoDateTime.optional(),
  lastResult: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('ok'), latest: LatestRelease }),
      z.object({
        kind: z.literal('error'),
        message: z.string().max(500),
        retryAfter: IsoDateTime.optional(),
      }),
    ])
    .optional(),
  dismissedVersion: z.string().max(64).optional(),
})
```

`AppSettings` gains `updates: UpdateSettings.default({ check: 'ask', askedCount: 0 })`. Older settings files parse unchanged (ADR-0016). The release notes are cached in `settings.json` so the dialog works offline after a check.

### Main process: `src/main/updates/`

- `release.ts`: the zod schema for the part of the GitHub response the app reads (`tag_name`, `name`, `html_url`, `published_at`, `body`, `draft`, `prerelease`, `assets[].name`, `assets[].size`), as a `z.looseObject` so extra fields are ignored. `toLatestRelease()` validates `tag_name` as `SemVer` after stripping one leading `v`, refuses `draft` or `prerelease` true, and checks `html_url` with `isReleasePageUrl` (https, host `github.com`, path starting `/actionstations-ai/actionstations/releases/`).
- `fetch-release.ts`: one GET with `redirect: 'error'`, `credentials: 'omit'`, headers `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: ActionStations/<version>`. It reuses `idleAbort`, `readCapped` and `redact` from `src/main/packs/fetch.ts` (15 s idle, 1 MB cap counted on received bytes). HTTP 403/429 with `x-ratelimit-remaining: 0` becomes a rate-limit error carrying `x-ratelimit-reset`; other non-2xx become `PROVIDER` errors with the status. `fetchImpl` is injectable for tests. The URL is a constant; in unpackaged runs `TTX_UPDATE_URL` may point it at a loopback test server (refused when packaged, like `TTX_APP_VERSION` in `src/main/packs/app-version.ts`).
- `check.ts`: `checkForUpdate({ reason: 'startup' | 'manual' })` runs one check at a time (a second call joins the first), stores the result through `updateSettings`, and emits `updates:changed`. `scheduleStartupCheck()` reads the settings and does nothing unless `check === 'on'` and 24 hours have passed.
- `upgrade-notes.ts`: `UPGRADE_NOTES: { from: string; to: string; platform?: NodeJS.Platform; text: string }[]` with semver ranges written as `>=a <b`, and `notesFor(installed, latest, platform)`. A small range matcher built on `compareSemver`; no new dependency.
- `src/main/index.ts`: after `ready-to-show`, `setTimeout(scheduleStartupCheck, 10_000)`.

The current version comes from `app.getVersion()` (through `packAppVersion()` so e2e can pose as an older release).

### IPC (`src/shared/ipc/updates.ts`, registered in `src/shared/ipc/index.ts`; handler `src/main/ipc/handlers/updates.ts`)

| Channel          | Request                                                              | Response                                                                                                                        |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `updates:status` | void                                                                 | `{ installed, mode, lastCheckedAt?, lastResult?, newer: boolean, dismissed: boolean, notes: string[], platformAsset?: string }` |
| `updates:check`  | void                                                                 | same as `updates:status`                                                                                                        |
| `updates:set`    | `{ check?: 'on' \| 'off', dismissedVersion?: string, asked?: true }` | same as `updates:status`                                                                                                        |
| `updates:open`   | `{ target: 'release' \| 'guide' }`                                   | void; opens the stored `html_url` (re-checked with `isReleasePageUrl`) or the guide URL with `shell.openExternal`               |

Event `updates:changed` tells the renderer to refetch `updates:status`. The renderer never receives a URL it is asked to open: `updates:open` takes a target name, and main opens only the stored, re-validated URL.

### Renderer

- `src/renderer/src/routes/settings/UpdatesSection.tsx`, added to `SettingsPage.tsx`: switch, explanation ("Sends one request to api.github.com. GitHub sees your IP address. Nothing about you or your projects is sent."), installed version, last check, result, **Check now**, **Release notes** when a result exists.
- `src/renderer/src/components/updates/UpdateBanner.tsx` and `ReleaseNotesDialog.tsx`, shown at the top of `src/renderer/src/routes/projects/ProjectsPage.tsx`.
- `src/renderer/src/components/updates/UpdateQuestionCard.tsx` on the Projects screen for FR-3 (not shown while `shouldOnboard()` is true).
- `src/renderer/src/routes/welcome/steps/DoneStep.tsx`: the checkbox; `use-setup.ts` sends `updates:set` when finishing.
- Pure helpers in `src/renderer/src/components/updates/update-view.ts` (banner text, relative times) with unit tests.

### Docs

- `docs/guides/getting-started.md`: a section "Updates" (what the check sends, how to turn it on or off, why there is no automatic install, the 0.5.0 Windows note).
- `README.md` privacy paragraph and `docs/02-ARCHITECTURE.md` Security: list the update check next to pack catalogs as the second user-enabled network call.
- ADR (next free number) "Opt-in update check without auto-install".
- `CHANGELOG.md`.

## Security and privacy

| Threat                                                                | Mitigation                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A network call the user did not ask for                               | `ask` and `off` make no request; startup check only with `on`; e2e asserts no non-loopback request with default settings.                                    |
| Fingerprinting through the request                                    | Fixed URL, no query, a User-Agent with only the app name and version (no OS), no cookies or token.                                                           |
| A spoofed or tampered response sends the user to a malicious download | https only, no redirects, host and path check on `html_url`; the app opens only the stored, re-validated release page, never an asset URL from the response. |
| Malicious release notes (HTML, script, huge body)                     | 1 MB read cap, 50 000-character notes cap, text-only Markdown renderer, links only `https:` and opened in the OS browser.                                    |
| Users trained to run unsigned binaries                                | No in-app download; the dialog points to the guide on verifying the `.sha256` file and on unsigned-build warnings.                                           |
| GitHub outage or rate limit                                           | Errors stay in Settings; no retry loop; at most one automatic request per 24 hours.                                                                          |

What leaves the computer: one HTTPS GET to `api.github.com`, only with the user's consent (setting `on`) or on **Check now**. Contents: the fixed path and headers above. GitHub receives the IP address and request time under GitHub's privacy statement.

## Testing

- Unit (`src/main/updates/*.test.ts`): response parsing (valid, draft, prerelease, bad tag, wrong `html_url` host, missing fields, oversized body); version comparison (older, equal, newer, prerelease installed); upgrade notes (0.5.0 on win32 gets the note, on darwin does not, 0.5.1 does not); fetch with a fake `fetchImpl` (redirect refused, 1 MB cap, idle timeout, 403 rate limit with reset time, 500); `scheduleStartupCheck` makes no call for `ask`/`off` or within 24 hours; concurrent checks share one request; turning off aborts.
- Settings schema: old `settings.json` without `updates` parses to `ask`.
- Renderer (happy-dom): `UpdatesSection`, `UpdateBanner` (dismiss stores the version), `UpdateQuestionCard` (third launch stores `off`), `DoneStep` checkbox unticked by default.
- e2e (`e2e/updates.spec.ts`, with `e2e/net-recorder.cjs`): default launch sends no request to any non-loopback host; with `TTX_UPDATE_URL` pointing at a 127.0.0.1 server and `TTX_APP_VERSION=0.5.0`, **Check now** shows the banner, the notes dialog and the platform asset name; the wizard checkbox stores the choice.
- Live (`LIVE=1 pnpm test -- src/main/updates/live.test.ts`): one real request to the GitHub API, parses the current latest release.
- Packaged smoke: `TTX_UPDATE_URL` is ignored in a packaged build.

## Tasks

1. **Schema and IPC.** `UpdateSettings` in `src/shared/schemas/settings.ts`; `src/shared/ipc/updates.ts`; register in `src/shared/ipc/index.ts`; schema tests in `src/shared/schemas/schemas.test.ts`.
2. **Main check.** `src/main/updates/{release,fetch-release,check,upgrade-notes}.ts` with unit tests; `src/main/ipc/handlers/updates.ts`; startup hook in `src/main/index.ts`; live test.
3. **Settings section.** `src/renderer/src/routes/settings/UpdatesSection.tsx`, `SettingsPage.tsx`, `settings.css`; `ReleaseNotesDialog.tsx`; tests.
4. **Ask once and the banner.** `DoneStep.tsx`, `use-setup.ts`, `UpdateQuestionCard.tsx`, `UpdateBanner.tsx`, `ProjectsPage.tsx`; tests.
5. **End to end and docs.** `e2e/updates.spec.ts`; Getting started "Updates" section; README privacy; `docs/02-ARCHITECTURE.md`; ADR; CHANGELOG; guide screenshots of Settings → Updates.

## Implementation notes

- User-Agent: `ActionStations/<version>` instead of a fixed string without the version, as the owner asked when the work was assigned (NFR-2 updated).
- Release-notes links are not clickable (FR-8 updated): the pack description renderer shows a link as its text plus address, so release notes cannot open URLs. `PackDescription` gained an optional `topHeading` so notes that start at `##` become h3 under the dialog's h2 (heading order, WCAG 1.3.1).
- The wizard's Done step has no Finish button, so the checkbox saves as it changes, and reaching the step stores `off` when the setting is still `ask` (FR-2: the wizard never leaves `ask`).
- Check now is also limited in main: a manual check within 60 seconds of the last one returns the stored result without a request.
- e2e: `TTX_UPDATE_DELAY_MS` (unpackaged only) shortens the 10-second startup delay; the network-recorder helpers are in `e2e/net-log.ts`. `launch()` in `e2e/helpers.ts` writes `updates.check = 'off'` so other specs and the guide screenshots never show the question card; `e2e/updates.spec.ts` writes its own settings.
- Out of this PR: guide screenshots of Settings → Updates (task 5); `e2e/guide-screenshots.spec.ts` was not re-run.

## Open questions

1. **Check frequency with `on`: once per launch, or at most daily?** Recommendation: at most once per 24 hours, at startup only. Users who keep the app open for days can press Check now.
2. **Should the wizard checkbox be ticked by default?** No. The issue and Project rules 3 call for off by default; a ticked box is a default-on choice in practice.
3. **Link the release page or the platform installer directly?** Recommendation: the release page. It shows all assets and the checksums, and the app never hands the OS a binary URL taken from a network response.
4. **Point the check at `actionstations.ai` instead of GitHub?** Recommendation: no. The site is a static Pages site with no release feed, and adding one means another file to keep in step at every release. GitHub's API is the source of truth and is what `docs/RELEASING.md` publishes to.
