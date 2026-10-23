# Example: North Coast International Airport

A ready-made example project for the `airport` domain profile (#186): North Coast International Airport (NCIA), the simulated airport of the CSAAP course material the app started from, with its plans from `reference/ncia/` and the ICS 201 / 203 forms from `reference/ics-forms/`.

The first scenario is the hand-authored gold standard, Scenario 3 "Flight to Nowhere" (`reference/scenario-3/`, fixture `tests/fixtures/scenarios/scenario-3.json`); scenarios 1, 2 and 4–8 follow it. Their MSELs, Controller Handbooks and Player Briefings are loaded as written, not generated, and so are the MSEL document (`msel.md`), the hot wash guide (the handbook's Hot Wash section; Countdown's debrief questions) and the handouts: the network reference, evidence packets and reference cards of scenarios 1, 2, 4, 5, 6 and 7, and Countdown's action menu and player clue cards as **Player handouts**, its clue-card deck with controller notes as **Controller materials**. The app generated only the inject text, the template-rendered inject cards, a few SDXL scene stills and TTS voice clips against local models (LM Studio, ComfyUI, mlx-audio). Inject fields were then corrected by hand where the checks or the gold deck called for it (organization names, template example values, the I-15 recovery board, Countdown's Tuesday start).

## Media

The repository copy keeps at most 6 MB of media: one voice clip (the I-01 phone call of Flight to Nowhere, as a 48 kbps MP3, about 160 KB), the template-rendered pictures of the most important injects of each scenario and the SDXL stills that fit. The other voice clips (WAV), the remaining pictures and the PDF, DOCX and ZIP exports are not in git: they are in the release bundle (`.tmp/examples-release/airport-ncia/` when you build it, attached to the GitHub release when one is published). Any inject can be re-rendered from its fields inside the app, and voice clips can be generated with a configured TTS provider.

The airport, its people and identifiers are simulated for training use; the app shows the `notice` from `example.json` when the example is opened.

## Rebuilding

`build.json` uses a `seed` entry instead of a scenario brief, so `generate` loads the authored scenario and documents and generates injects and media only.

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/airport-ncia/build.json   # live: LM Studio + ComfyUI + mlx-audio
node scripts/make-example.mjs refresh  --spec examples/airport-ncia/build.json   # after hand fixes: no model
node scripts/make-example.mjs package  --spec examples/airport-ncia/build.json
node scripts/make-example.mjs verify   --spec examples/airport-ncia/build.json
```

`refresh` records hand corrections to the scenario and inject JSON in the release folder, seeds the documents `build.json` names, and re-renders the cards of the corrected injects, with no model reachable. `verify` fails when a scenario still carries a lint warning other than a CRITIQUE note.
