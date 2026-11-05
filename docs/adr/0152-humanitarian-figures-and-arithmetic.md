# ADR-0152: Humanitarian figures share one arithmetic module with the lint rules and the simulator

Date: 2026-11-05 · Status: Accepted · Issues: #821, #826, #831 · Spec: [0469](../specs/0469-humanitarian.md) · Related: ADR-0075 (figures), ADR-0151

## Context

Pipeline dashboards, coverage tables and camp health reports state numbers (days of stock, a break day, coverage, attack rate) that a drawn figure also shows. If the text, the figure, the simulator and the metrics each compute them, they drift, and an exercise can show a break date that the stock figures do not support.

## Decision

- **Seven figure kinds** in `src/main/render/figures/humanitarian/`, ids prefixed `humanitarian_`: 3W matrix, 3W map, needs against coverage, pipeline, funding bar, staff incident timeline and access constraints map. The epidemic curve and attack rates for camp health stay with the epidemiology toolkit.
- **Pipeline arithmetic is one pure module** (`src/shared/humanitarian/pipeline.ts`): days of stock, the break day given shipments, the stock curve and the latest day to order. The figure, the lint rule that checks a dashboard's stated numbers, and the later simulator and metrics import it.
- **A gap is drawn as a gap.** A 3W cell or area with no report is hatched and labeled "no report", and every summary says that a blank is a gap or a reporting failure, not proof of no work.
- **Percentages are computed, never typed,** in the coverage and funding figures; the needs coverage schema refuses people reached above people targeted.
- **One figure template, `humanitarian_figure`,** with a preview variant per kind, so the shared `figure` template (edited by every field) is untouched. Status and route state use line style, fill pattern and a word, not color alone.
- **Eleven more paper templates** (pipeline dashboard, shipments, customs hold, procurement, warehouse, access note, rapid assessment, distribution, camp health, community feedback, misinformation tracker) and four more lint rules (pipeline arithmetic, stock balance, coverage arithmetic, camp rates).

## Consequences

- A change to how days of stock or the break day are computed changes the figure, the lint and the simulator together, and the tests that pin them.
- Maps are schematic (no tiles, no network) and carry general places only; incident points are named in general terms.
