# Example: Marston County Health Department

A ready-made example project for the `public_health` domain profile (#332): the fictional Marston County Health Department (Ellery, Kansas; four health districts, three clinics, six POD sites), its three plans from `reference/county-public-health/`, and a tabletop exercise generated from them with the app against local models (LM Studio text, ComfyUI SDXL stills, mlx-audio voices).

The organization, people and identifiers are simulated for training use; no real health department is depicted. Real agencies (KDHE, CDC, CISA, the FBI) and real products keep their names; the department's clinic, booking and registry-interface systems are simulated. Each document carries a standard exercise marking and the `notice` in `example.json` repeats it. `reference/county-public-health/SOURCES.md` lists the public guidance the plans paraphrase (CDC PHEP capabilities, CERC, the HHS CTEP).

## Contents

- `build.json` — the build spec for `scripts/make-example.mjs`.
- `example.json` — the manifest, written by `make-example.mjs package`.
- `project/` — the project folder: `project.json`, the imported documents and `scenarios/<id>/` with the MSEL, injects, generated documents and a small media slice. Index, job logs, history and provider ids are stripped.

## Scenario

| Threat family | Exercise                                                                  | What it turns on                                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyber`       | Measles outbreak OB-2026-0147 while vaccination and case data are altered | A script on MCHD-INT01 sends KDHE 412 MMR doses nobody gave, false cases arrive through MCHD-FAX01, POD 2 bookings are cancelled from a phished account; isolation versus losing lab results, paper mode, a restore that brings the script back, POD 2 on Saturday, rumor control in English and Spanish |

The generated scenario was corrected by hand against the plans (dates, case counts, recipients, a restore that is not an all-clear) and taken over with `refresh`; see the commit history.

## Rebuilding

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/county-public-health/build.json
node scripts/make-example.mjs repair   --spec examples/county-public-health/build.json
node scripts/make-example.mjs package  --spec examples/county-public-health/build.json
node scripts/make-example.mjs verify   --spec examples/county-public-health/build.json
```

Fixes after review are made in place in the release folder (`.tmp/examples-release/county-public-health/`) and taken over with `refresh` (no model needed), never by regenerating.
