# Example: North Coast International Airport

A ready-made example project for the `airport` domain profile (#186): North Coast International Airport (NCIA), the simulated airport of the CSAAP course material the app started from, with its plans from `reference/ncia/` and the ICS 201 / 203 forms from `reference/ics-forms/`.

The scenario is the hand-authored gold standard, Scenario 3 "Flight to Nowhere" (`reference/scenario-3/`, fixture `tests/fixtures/scenarios/scenario-3.json`): its MSEL, Controller Handbook and Player Briefing are loaded as written, not generated. The app generated only the inject text, the template-rendered inject cards, a few SDXL scene stills and TTS voice clips against local models (LM Studio, ComfyUI, mlx-audio).

The airport, its people and identifiers are simulated for training use; the app shows the `notice` from `example.json` when the example is opened.

## Rebuilding

`build.json` uses a `seed` entry instead of a scenario brief, so `generate` loads the authored scenario and documents and generates injects and media only.

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/airport-ncia/build.json   # live: LM Studio + ComfyUI + mlx-audio
node scripts/make-example.mjs package  --spec examples/airport-ncia/build.json
node scripts/make-example.mjs verify   --spec examples/airport-ncia/build.json
```
