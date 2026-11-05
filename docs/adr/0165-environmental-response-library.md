# ADR-0165: Environmental response reference library and reuse

Date: 2026-11-05 · Status: Accepted · Issues: #786 · Spec: [0455](../specs/0455-environmental-response.md) · Related: ADR-0020 (reference documents)

## Context

Spec 0455 FR-12 asks for a library of public spill-response documents and FR-14 asks that other domains be offered the spill and plume toolkit. Domains that already suggested it were `environmental_response`, `port_maritime`, `chemical` and `industrial`.

## Decision

- The documents are a catalog-only library, `ai.actionstations.environmental-response-library`, built from `packs/documents/manifest.json` like the other domain libraries. Nine files are pinned by sha256 after the PDF was fetched and its title checked: the PREP Guidelines (version 2016.1), the Coast Guard Deepwater Horizon preparedness review, the NTSB Marshall report and six NOAA response documents. All are US federal works; none carries a copyright notice.
- Linked, not bundled: the Coast Guard and EPA versions of ICS 232, 233 and 234 (only third-party copies were reachable, so terms and hashes could not be checked at the issuing agency), the Coast Guard FOSC guide (the server refused a scripted download) and the ESI training data and GIS downloads (large, licence text not stated).
- `spill_plume` is added to `suggestedToolkits` of `gas_pipeline`, `energy_utility`, `water_utility`, `water_dam`, `freight_rail`, `transit`, `food_agriculture`, `municipal` and `emergency_communications`, completing the FR-14 list. The toolkit's `appliesTo.domains` already named all twelve.
- The toolkit lists the library's documents. Examples (FR-13) stay deferred because they need local generation.

## Consequences

Users install the library on its own. A new PREP edition changes the pinned hash; the fetch script reports it and `--repin` accepts it after a check.
