# Example: Harwick UAS Operations Group

> **Exercise material — for training use.** The organization, people, procedures, numbers, frequencies, addresses and identifiers in this example are simulated. The public sources consulted for realism are listed in [`reference/uas-ops/SOURCES.md`](../../reference/uas-ops/SOURCES.md).

A bundled project for the `unmanned_systems` domain profile (#157): a regional unmanned-aircraft operator flying infrastructure inspection, agricultural and environmental survey and public-safety support missions under Part 107, with a base field under a Class C airport's LAANC grid and a leased range in Class G airspace. It shows what the generator produces for an organization that **flies** aircraft (ground control stations, C2 and telemetry links, GNSS/RTK, payloads, mission data, LAANC and ATC coordination) rather than one that is overflown.

## What is inside

- `example.json` — the manifest the app lists in its examples gallery (title, profile, notice, scenarios).
- `project/` — a normal project folder as the app writes it:
  - the four exercise plans from `reference/uas-ops/` imported as documents (UAS Flight Operations & Safety Manual, Emergency Response Plan for flight operations, Information Security Plan for the GCS fleet and data pipeline, Site & Airspace Sheet) and the facility facts extracted from them;
  - one generated scenario with its MSEL, phases, roles, injects, controller handbook, player briefing, hot wash and rendered inject media within the 6 MB git budget (1× PNGs of the template-rendered injects and up to two AI-composited scene photos; audio, PDFs and the remaining renders are in the release bundle, not in git).

| Key         | Threat family    | Scenario                                                                                               |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `c2-hijack` | `cyber_physical` | C2-link hijack and GNSS spoofing during a multispectral / hyperspectral campaign at Birch Hollow Range |

The title, row count and inject count are in `example.json` and in the scenario's `scenario.json`. Three further briefs for this organization (ransomware on the GCS fleet before a client deadline, a rogue drone over a public event beside the base field, a flyaway toward the Class C boundary) are tracked as a follow-up issue.

## How it was built

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/uas-operations/build.json --out .tmp/examples-release/uas-operations
node scripts/make-example.mjs package  --spec examples/uas-operations/build.json --out .tmp/examples-release/uas-operations
node scripts/make-example.mjs verify   --spec examples/uas-operations/build.json
```

`generate` drives the built app headless against the local stack (LM Studio `qwen3-30b-a3b-2507`, ComfyUI SDXL, mlx-audio TTS) and writes the full media set, the PDF exports and a ZIP per scenario to the `--out` folder; `package` strips the project (no `index.sqlite*`, `.cache`, job files, provider ids or absolute paths) and trims media to the budget; `verify` copies the packaged project to a temp folder, opens it in the app, rebuilds the index and checks every scenario, inject and asset. The scenario brief is in `build.json`; the same script builds the other bundled examples.

## Opening it

In the app, open **Projects → Examples** and choose this example: the project folder is copied to a location you pick and opened; the search index is rebuilt on first open. The copy is yours to edit, regenerate and export.
