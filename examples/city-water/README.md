# Example: City of Millbrook Water

A ready-made example project for the `water_utility` domain profile (#158): the fictional City of Millbrook Department of Water & Sewer, its five plans from `reference/city-water/`, and a tabletop exercise generated from them with the app against local models (LM Studio text, ComfyUI SDXL stills, mlx-audio voices).

The organization, people and identifiers are simulated for training use; no real utility is depicted. Each document carries a standard exercise marking and the `notice` in `example.json` repeats it; the app shows that notice when the example is opened.

## Contents

- `example.json` — the manifest (`ExampleManifest`): id, title, domain profile, summary, notice, and one entry per scenario. The scenario summaries are hand-written and matched by threat family; `scripts/make-example.mjs` keeps them when it rebuilds the pack.
- `project/` — a normal project folder as the app writes it: `project.json`, the imported documents, and `scenarios/<id>/` with the MSEL, injects, generated documents and a small media slice. The search index (`index.sqlite`), job logs, edit history, provider routing and provider ids are stripped; the app rebuilds the index when the example is opened.

## Scenarios

| Threat family    | Exercise                                                      | What it turns on                                                                                          |
| ---------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cyber_physical` | Chemical-feed setpoint tampering through vendor remote access | ScreenBridge on MBW-HMI-02, NAOH-FC-203 limits, PSH-302, CODE CLEARWATER, manual operations, Do Not Drink |

Three more exercises from the same documents (ransomware reaching toward OT, tampering at Orchard Standpipe with a boil-water advisory, a transmission-main break during a telemetry outage) are defined as acceptance runs and tracked in #171; this first release ships one tabletop per domain.

## Media

The repository copy keeps at most 6 MB of media per example: the template-rendered pictures of the most important injects of each scenario and up to two SDXL stills. Audio, video and the remaining pictures are in the release bundle (`.tmp/examples-release/city-water/`, attached to the GitHub release), together with the PDF, DOCX, Markdown, JSON and ZIP exports of each scenario. Any inject can be re-rendered from its fields inside the app.

## Rebuilding

`build.json` is the build spec for `scripts/make-example.mjs` (the shared example builder from #157): the project, its documents, the scenario briefs and the media slice. The release folder (`.tmp/examples-release/city-water/`, not in git) holds the generated project, `state.json` (scenario keys → ids), the exports and the full media.

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/city-water/build.json   # live: LM Studio + ComfyUI + mlx-audio
node scripts/make-example.mjs package  --spec examples/city-water/build.json   # examples/city-water/project + example.json
node scripts/make-example.mjs verify   --spec examples/city-water/build.json   # opens the packaged example in the app
```

The shipped scenario was generated through `e2e/domains-acceptance.spec.ts` (`DOMAINS=water-chem`, `PROJECT_DIR`, `EXPORT_DIR`), reviewed and hand-corrected, then packaged with `package` from a hand-written `state.json`; `generate` regenerates it from scratch.
