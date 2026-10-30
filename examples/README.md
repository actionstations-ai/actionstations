# Example projects

Ready-made, fictional projects that ship with the app. People can open one from **Projects → Examples** or from the setup wizard's first-project step. Opening an example copies its `project/` folder to a new folder the user picks (default: the projects folder from Settings, else `~/Documents/Action Stations/`) and opens the copy. The files here are never modified.

## Layout

```
examples/<slug>/
  example.json   manifest (schema: ExampleManifest in src/shared/ipc/examples.ts)
  project/       a normal project folder, as the app writes it
```

`<slug>` is a plain folder name (letters, digits, `-`, `_`). Folders whose manifest does not validate are skipped and logged, not shown.

## example.json

```json
{
  "id": "riverbend-transit",
  "title": "Riverbend Regional Transit",
  "domainProfile": "transit",
  "summary": "One to three sentences for the gallery card.",
  "fictional": true,
  "notice": "Banner text shown inside every project opened from this example.",
  "scenarios": [
    {
      "id": "scenario-id",
      "title": "Ghost buses",
      "threatFamily": "cyber_physical",
      "summary": "One sentence."
    }
  ]
}
```

- `domainProfile` is a built-in profile id (`src/shared/domains`).
- `threatFamily` is one of the threat family ids (`cyber`, `physical_security`, `cyber_physical`, `uas_drone`, `insider`, `natural_hazard`, `infrastructure_failure`, `mass_gathering`).
- `fictional` must be `true`.

## Names

Examples simulate the organization being exercised and its people, airlines, private businesses (media outlets, sports teams and stadiums, regional utilities, national consumer brands in the facility, cargo carriers, banks) and the street addresses of real properties. Real-world names stay where the exercise needs them: cities, counties, regions, geography and coordinates; city and county government agencies as outside parties and responders (Akron Fire Department, Summit County EMS); airports run by local government as outside parties (a diversion to Cleveland Hopkins), as long as nothing places the exercised organization at one of them; products and vendors (players practice on real equipment such as Cisco or Lenel); sector organizations (WaterISAC, Aviation ISAC, mutual-aid networks, the Red Cross); federal and state agencies (including named offices such as the FBI Cleveland Field Office); and real threat groups. When the exercised organization is itself a city or county government, it and its people are still simulated. A fictional town (Millbrook in `city-water`, Harwick in `uas-operations`) is fine too. Users can use any names in their own projects.

`simulated-names.json` is an ordered list of replacements (JavaScript regular expressions). `make-example` applies it to every imported document, seed scenario and seed document, so `reference/` keeps the source material and every rebuild comes out simulated. `node scripts/simulate-names.mjs <file-or-dir>…` applies the same list to files in place. `tests/content/real-org-names.test.ts` fails on a deny-list of the business names and real street addresses that must be simulated in `examples/`, `templates/`, `prompts/`, the domain profiles and the generation fixtures.

## What `project/` must not contain

- `index.sqlite*` or `.cache/` (the app rebuilds the index when the copy is opened),
- job or log files, absolute paths, provider ids or keys, or any other secret.

Strip these with a script, not by hand. Keep binary media to at most 6 MB per example (one short voice clip as MP3 included); full media and PDF/ZIP exports belong to the GitHub release, not to git. A shipped example carries no lint warning but CRITIQUE notes: `make-example.mjs verify` and `tests/scripts/example-content.test.ts` both check it. Fix content in place in the release folder, then `refresh` and `package` (no model needed).

To add a stage the packaged example predates (for example the evaluation guides and the Situation Manual, #499), run `node scripts/make-example.mjs stages --spec examples/<id>/build.json [--stages eeg,sitman]` with a model reachable, then `package`. It adopts the packaged project when there is no release folder, re-runs only those stages, keeps the scenario status, and retries a stage whose output leaves out a phase or an objective.

## How the app uses it

- Each example ships in its domain's bundled pack (ADR-0020, `packs/bundled.json`: `airport-ncia` → Airports, `city-water` → Water utilities, `uas-operations` → Unmanned systems, `chemical-rmp` → Chemical facilities, `county-public-health` → Public health, `county-911` → Emergency communications, `county-elections` → Elections, `k12-district` → K-12 schools, `gas-distribution` → Gas utilities and pipelines). `examples:list` lists the examples of the enabled packs, bundled and installed (packaged: `<resources>/app-resources/packs/<pack>/examples/`; unpackaged: this folder, read in place; `TTX_EXAMPLES_DIR` lists a plain folder instead, for tests). A new example needs an entry in `packs/bundled.json`, or the build fails.
- `examples:open { slug, parentDir? }` copies `project/` into a folder no one is using (`<title>.asproj`, then `-2`, `-3`…), writes `.example.json` (the banner text) into the copy, gives the copy a new project id and opens it. Symlinks and derived data are not copied.
- `examples:marker { projectPath }` returns the banner text for a project opened from an example.

The test fixture in `tests/fixtures/examples/` follows the same layout.
