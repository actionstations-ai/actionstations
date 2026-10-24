# Example: Teague Valley Chemical, Corbin Falls Works

A ready-made example project for the `chemical` domain profile (#332): the fictional Teague Valley Chemical Company and its Corbin Falls Works, a chlor-alkali plant under the EPA Risk Management Program (40 CFR Part 68, Program 3, responding facility), its three plans from `reference/chemical-rmp/`, and a tabletop exercise generated from them with the app against local models (LM Studio text, ComfyUI SDXL stills, mlx-audio voices).

The exercise is shaped as the RMP tabletop that 40 CFR 68.96(b)(2) requires of responding facilities (the first one before 21 December 2026, then at least every three years): a simulated accidental release of a regulated substance (chlorine) that walks through notifying the public and the federal, state and local agencies, sheltering and evacuation, medical treatment, the facility's responders and their equipment. An evaluation report is due within 90 days of the exercise (68.96(b)(3)); the generated hot wash and exercise plan are a starting point for it.

The organization, people, neighbors and identifiers are simulated for training use; no real plant is depicted. Real products (Emerson DeltaV, Schneider Electric Triconex, AVEVA PI) and real agencies keep their names. Each document carries a standard exercise marking and the `notice` in `example.json` repeats it; the app shows that notice when the example is opened. `reference/chemical-rmp/SOURCES.md` lists the public guidance the plans paraphrase.

## Contents

- `build.json` — the build spec for `scripts/make-example.mjs`: the project, its documents, the scenario brief and the media slice.
- `example.json` — the manifest (`ExampleManifest`), written by `make-example.mjs package`.
- `project/` — a normal project folder as the app writes it: `project.json`, the imported documents, and `scenarios/<id>/` with the MSEL, injects, generated documents and a small media slice. The search index, job logs, edit history, provider routing and provider ids are stripped; the app rebuilds the index when the example is opened.

## Scenario

| Threat family    | Exercise                                       | What it turns on                                                                                                                                                            |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyber_physical` | Chlorine release at Rail Spot 2 during loading | ESD-310 shown closed while the cloud grows, hand valve HV-312, sirens and shelter-in-place request, NRC / SERC / LEPC calls, Triconex key switch in PROGRAM, cell-room trip |

## Media

The repository copy keeps at most 6 MB of media: one voice clip (as a 48 kbps MP3), the template-rendered pictures of the most important injects and up to two SDXL stills. The rest is in the release folder (`.tmp/examples-release/chemical-rmp/`) with the PDF, DOCX and ZIP exports. Any inject can be re-rendered from its fields inside the app.

## Rebuilding

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/chemical-rmp/build.json   # live: LM Studio + ComfyUI + mlx-audio
node scripts/make-example.mjs repair   --spec examples/chemical-rmp/build.json   # fix flagged rows in place
node scripts/make-example.mjs package  --spec examples/chemical-rmp/build.json   # examples/chemical-rmp/project + example.json
node scripts/make-example.mjs verify   --spec examples/chemical-rmp/build.json   # opens the packaged example in the app
```

Fixes after review are made in place in the release folder and taken over with `refresh` (no model needed), never by regenerating.
