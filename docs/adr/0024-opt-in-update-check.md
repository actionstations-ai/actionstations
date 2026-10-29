# ADR-0024: Opt-in update check without auto-install

Date: 2026-10-28 · Status: Accepted · Issue: #442

## Context

Users install the app and rarely watch GitHub, so they miss fixes. The app is local-first: it makes no network call the user did not turn on (Project rules 3), and the hosting must cost nothing (ADR-0023). The installers are not code-signed yet (#380), so an in-app updater would download and run unsigned binaries on its own.

## Decision

The app checks for a newer release only when the user has turned the check on (`updates.check`: `ask`, `on`, `off`; `ask` sends nothing) or presses **Check now**. The check runs in main (`src/main/updates/`): one GET to `https://api.github.com/repos/actionstations-ai/actionstations/releases/latest` with the pack-fetch discipline of ADR-0018 (https only, no redirects, no cookies or token, 15 s idle timeout, 1 MB cap), a plain `User-Agent: ActionStations/<version>`, at most once a day at startup, one check at a time, and Check now no more than once a minute. The answer is validated with zod; the release page must be a `github.com/actionstations-ai/actionstations/releases/` URL and is re-checked before it is opened. Release notes are shown with the pack description renderer (text-only Markdown). A small table of upgrade notes (`upgrade-notes.ts`) adds caveats such as the 0.5.0 Windows uninstall step.

The app never downloads or installs an update: it opens the release page in the browser and points to the guide on checking the `.sha256` file and on unsigned-build warnings.

## Consequences

- No new dependency and nothing to host; GitHub's API is the source of truth `docs/RELEASING.md` already publishes to.
- GitHub sees the IP address, the time and the app version of users who turn the check on; the setting says so.
- Upgrading stays manual until the installers are signed (#380); revisit an in-app updater then.
- Unauthenticated API calls are limited to 60 an hour per network; the daily schedule and the one-minute Check now cooldown keep well under it, and a rate-limit answer is shown with its reset time.
