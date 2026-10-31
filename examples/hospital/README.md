# Example: Ottawa River Regional Medical Center

A ready-made example project for the `healthcare` domain profile (#556): the fictional Ottawa River Regional Medical Center, a 412-bed community hospital and Level II trauma center in Toledo, Ohio run under HICS, its five documents from `reference/hospital/`, and four tabletop exercises.

The hospital, its people, vendors and identifiers are simulated for training use; no real hospital is depicted, and no street address is published. Toledo, Lucas County, Ohio and the public agencies that appear as outside parties (Toledo Fire and Rescue, Lucas County EMS and EMA, the Toledo-Lucas County Health Department, the City of Toledo Department of Public Utilities, the Ohio Department of Health, the FBI, CISA, H-ISAC) are real; the EHR, pump and other vendors are simulated. Each document carries a standard exercise marking and the `notice` in `example.json` repeats it. `reference/hospital/SOURCES.md` lists the public guidance the plans paraphrase (42 CFR 482.15, HICS, ASPR TRACIE, HHS cybersecurity performance goals, HIPAA).

## Contents

- `build.json` — the build spec for `scripts/make-example.mjs`.
- `example.json` — the manifest, written by `make-example.mjs package`.
- `project/` — the project folder: `project.json`, the imported documents and `scenarios/<id>/` with the MSEL, injects, SitMan, EEGs, handbook, briefing, hot wash and a small media slice. Index, job logs, history and provider ids are stripped.

## Documents

| File in `reference/hospital/`           | What it is                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `emergency-operations-plan.md`          | All-hazards EOP under 42 CFR 482.15, with a table that maps each required element to a section |
| `ehr-downtime-procedures-annex.md`      | Downtime levels, the downtime viewer, clinical procedures and reconciliation                   |
| `cyber-incident-response-plan.md`       | Severity levels, containment decisions, medical devices, HIPAA breach questions                |
| `patient-surge-and-evacuation-annex.md` | Surge levels, mass casualty response, shelter in place and evacuation, diversion               |
| `facilities-and-information-systems.md` | Campus, utilities, information systems, outside parties and contacts                           |

## Scenarios

| Threat family            | Exercise                                                                    | What it turns on                                                                                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyber`                  | Paper Charts: ransomware encrypts the EHR database before the morning shift | Declaring downtime and Level 1, override mode for the dispensing cabinets, diversion, a duplicate heparin dose from a four-hour-old paper packet, a leak-site claim, a restore from the 02:00 cloud copy that is not an all-clear, and a draft press release that says no data was accessed |
| `cyber_physical`         | Ghost Pumps: a vendor support account alters the infusion pump drug library | A near-miss with no hard-limit alarm, the joint decision to isolate the device network and lose central telemetry, a false asystole alarm, a hypoglycemia event of unknown cause, the manufacturer, FDA and HIPAA clocks                                                                    |
| `infrastructure_failure` | Core Collapse: a core switch fails, then a 36-patient crash arrives         | Code Triage on downtime, T- and DT- patient numbers, blood and ventilators, transfers, crisis standards of care, a partly restored EHR that would split the record                                                                                                                          |
| `infrastructure_failure` | Water Line, No Drink: a city advisory fails the dialysis loop               | Closing the tank fill valve, conservation numbers, sterile processing, 33 dialysis patients to place, ready-to-feed formula, a bulk-water supplier, criteria to resume                                                                                                                      |

The four MSELs were written by hand against the plans (`tests/fixtures/scenarios/hospital-*.json`, the `seed` entries of `build.json`) after the model-generated drafts proved too inconsistent to ship: they restored systems within the exercise window, called a restore safe in the hour it began, and invented plan section numbers and addresses. The app then generated what follows from them: injects, template media, a bounded number of stills and voice clips, the handbook, briefing, rubric, EEGs, hot wash and SitMan. The generated injects were corrected by hand where they contradicted the MSEL (people's names, a draft press release, addresses and domains) and taken over with `refresh`; see the commit history.

## Rebuilding

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/hospital/build.json
node scripts/make-example.mjs stages   --spec examples/hospital/build.json --stages controller_handbook,rubric,eeg,player_briefing,hotwash,sitman
node scripts/make-example.mjs package  --spec examples/hospital/build.json
node scripts/make-example.mjs verify   --spec examples/hospital/build.json
```

Fixes after review are made in place in the release folder (`.tmp/examples-release/hospital/`) and taken over with `refresh` (no model needed), never by regenerating.
