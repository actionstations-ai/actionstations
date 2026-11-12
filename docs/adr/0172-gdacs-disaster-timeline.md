# ADR-0172: GDACS gives every user a past-disaster timeline; ReliefWeb stays optional

Date: 2026-11-12 · Status: Accepted · Issues: #911 · Spec: [0469](../specs/0469-humanitarian.md) · Related: ADR-0153 (humanitarian replay)

## Context

ADR-0153 left the past-event timeline to ReliefWeb, which answers only application names it has approved. Users without an approved name had no real timeline, only the bundled sample data. The Global Disaster Alert and Coordination System (GDACS, run by the European Commission's Joint Research Centre and UN OCHA) publishes the disasters it alerted on through an event API that needs no key or registration, and answered the app's User-Agent on 2026-11-12.

## Decision

- **A `gdacs-events` connector** (`www.gdacs.org`, `/gdacsapi/api/events/geteventlist/SEARCH`) gives the disasters affecting one country (ISO code) in the scenario's period: type, name, alert level, severity, affected countries, GLIDE number and the GDACS report link, as a text timeline (`gdacs-timeline`). An event that lasts (a cyclone, a flood, a drought) has an entry at its onset and one at its last update.
- **Orange and red alerts by default.** These are the events at a humanitarian scale; a whole year of them fits in one page of 100. Green alerts (mostly small earthquakes and forest fires, hundreds a week) are added with the option `includeGreen` and read for at most ten pages, and the result says when the search was stopped.
- **The country is matched by the app, not by GDACS.** The service's country filter is unreliable (`TUR` returned Turkmenistan and `Congo` missed the Democratic Republic of the Congo), so the request carries only dates and alert levels and the connector keeps events whose affected countries include the ISO code.
- **ReliefWeb stays, as an option** for users with an approved name: it adds report titles that GDACS does not have. Key figures and operational presence remain on HDX HAPI (ADR-0153), which needs no approval.

## Consequences

- Every user can replay a real disaster timeline without setup; the examples no longer depend on ReliefWeb.
- GDACS alert levels and severities are automatic estimates from the first hours of an event; the terms text says so, and they are not damage assessments.
- The recorded fixture is a real response (orange and red alerts, February and March 2023), trimmed to the fields the connector reads; the live test checks the February 2023 earthquakes in Türkiye.
