# ADR-0061: Public hazard data: opt-in, fetched on request, kept as a dated snapshot

Date: 2026-10-29 · Status: Accepted · Issue: #439

## Context

Scenarios are more believable when they fit the place: a flood watch, a record of past
declarations, a fault nearby. Public services publish this data for free. But the app is
local-first and private, and an organization's location is sensitive. HIFLD Open, once the
obvious source for infrastructure layers, has been taken offline.

## Decision

- The feature is off by default (Settings, Hazard data). With it on, nothing is fetched until the
  user presses Fetch in a dialog that names each host and what is sent. No background or automatic
  fetch exists; opening a project or generating never fetches.
- Four fixed hosts (api.weather.gov, earthquake.usgs.gov, firms.modaps.eosdis.nasa.gov,
  www.fema.gov), https only, same-host redirects only, 30 s timeout, 5 MB cap, fixed user agent
  that names the app and website. The code follows the safe-fetch pattern of `src/main/packs/fetch.ts`
  and lives in `src/main/hazards/`, not `providers/`, because these are public data sources, not
  model or media providers.
- Coordinates are rounded (0.01 degrees by default, 0.1 optional) before they leave the computer;
  the full location stays in the project.
- The FIRMS map key is kept like provider keys, in the OS keychain through safeStorage, replaced by
  `<MAP_KEY>` in anything stored, and scrubbed from errors.
- A fetch saves a normalized, dated snapshot in the project (`hazards/`); raw responses are not
  kept. Generation reads the snapshot and never touches the network, so exercises work offline.
- Infrastructure (HIFLD) is imported from a local file only. No mirror is contacted.
- The fetch returns the finished snapshot directly rather than starting a job: sources are few,
  each is capped at 30 s, and the dialog shows progress until it returns.

## Consequences

- The privacy statement gains four hosts, each only on a user action.
- Snapshots go stale; the prompt, the screen, the handbook appendix and a lint all say so.
- Layer files are parsed in the main process with size and count limits rather than a worker
  thread; a worker is a possible later hardening.
- Adding a source later means adding a host to the allow-list and a line to the consent dialog.
