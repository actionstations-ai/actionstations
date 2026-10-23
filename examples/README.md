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

## What `project/` must not contain

- `index.sqlite*` or `.cache/` (the app rebuilds the index when the copy is opened),
- job or log files, absolute paths, provider ids or keys, or any other secret.

Strip these with a script, not by hand. Keep binary media to at most 6 MB per example (one short voice clip as MP3 included); full media and PDF/ZIP exports belong to the GitHub release, not to git. A shipped example carries no lint warning but CRITIQUE notes: `make-example.mjs verify` and `tests/scripts/example-content.test.ts` both check it. Fix content in place in the release folder, then `refresh` and `package` (no model needed).

## How the app uses it

- `examples:list` reads every `example.json` (packaged: `<resources>/app-resources/examples`; unpackaged: this folder; `TTX_EXAMPLES_DIR` overrides both for tests).
- `examples:open { slug, parentDir? }` copies `project/` into a folder no one is using (`<title>.asproj`, then `-2`, `-3`…), writes `.example.json` (the banner text) into the copy, gives the copy a new project id and opens it. Symlinks and derived data are not copied.
- `examples:marker { projectPath }` returns the banner text for a project opened from an example.

The test fixture in `tests/fixtures/examples/` follows the same layout.
