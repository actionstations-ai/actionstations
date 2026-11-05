# ADR-0128: Human services replay data comes from two public services; the rest is deferred

Date: 2026-11-05 · Status: Accepted · Issues: #711, #715 · Spec: [0464](../specs/0464-human-services.md) · Related: ADR-0076 (case data), ADR-0020 (documents)

## Context

The spec lists four replay sources: FEMA open shelters, HHS emPOWER counts, published 988 statistics and the CDC/ATSDR Social Vulnerability Index (terms to be confirmed). Each must have a fixed host, need no key, be fetched once with consent and a size estimate, and be used offline.

## Decision

- **Two connectors now.** `fema-open-shelters` (gis.fema.gov, the ESF #6 layer, queried through the existing ArcGIS helper) and `hhs-empower` (the public emPOWER REST service on services2.arcgis.com, county layer). Both were checked against the live service responses, and the tests replay trimmed recordings of them; live tests run only with `LIVE=1`.
- **The shelter service keeps no history**, so the connector is a snapshot of now, labeled so in the dataset and in `modified`; a past event needs a capture made at the time. Street addresses are not kept, which also follows the naming rule for real addresses.
- **emPOWER is read at county level only**, as de-identified aggregates, asking for centroids and not boundaries; the person-level file is not touched.
- **Deferred:** published 988 statistics (SAMHSA pages, a network administrator report and a GAO dataset have no stable machine-readable endpoint that was verified) and the Social Vulnerability Index (release and terms unconfirmed). Neither is guessed at. The crisis line toolkit states the published figures it uses in its knowledge text, with their source and date, and the surge generator takes its own baselines.
- **Library.** Only a document whose public-domain status could be read from the file is bundled (the crisis counseling program application instructions). The functional needs support guidance was written for FEMA by a contractor and states no terms, the shelter field guide was produced with the American Red Cross, and the school reunification brief could not be downloaded, so those are linked with the reason.

## Consequences

- A replay of a past shelter event is possible only from the user's own capture; the example and tests use fictional shelter data.
- Adding the two deferred sources later needs a verified endpoint and terms, not a change to the framework.
