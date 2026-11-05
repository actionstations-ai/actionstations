# ADR-0169: Justice replay data from city open data, Vera jail files and the FBI Crime Data Explorer

Date: 2026-11-05 · Status: Accepted · Issues: #734 · Spec: [0465](../specs/0465-justice.md) · Related: ADR-0076 (case data), ADR-0131 (justice simulations)

## Context

Spec 0465 FR-9 asks for calls for service from city open data, BJS jail statistics, FBI active shooter reports and AMBER Alert statistics, aggregate only, fetched once with consent and a size estimate, with no incident-level detail about real people stored. The owner has said terms readings do not block a source; only technical blockers do.

## Decision

- **`open-cad-calls`**: one connector with an adapter table of cities, each with a fixed Socrata host and dataset (Seattle `data.seattle.gov/33kz-ixgy`, San Francisco `data.sf.gov/2zdj-bwza`). The request selects six columns (call number, priority, received time, dispatch and arrival times or seconds, officer-initiated flag) with `distinct`, never addresses, coordinates or call text; at most seven days, two pages of 50,000 rows. The portals use floating local time, so the period is converted to and from the city's zone. Only an hourly series (counts by priority, officer-initiated count, median dispatch, median and 90th percentile arrival for dispatched calls) is stored. A city is added by adding a row.
- **`vera-jail-trends`**: the Vera Institute Incarceration Trends state file (1.8 MB) or county file (62 MB, read whole because its rows are ordered by year, not place) from the fixed GitHub raw host, columns found by header name, one place's yearly series kept. Vera's files are built on the BJS Census of Jails and Annual Survey of Jails; the BJS microdata itself is distributed through a login-gated archive, so Vera's public file is the fixed source.
- **`fbi-cde-crime`**: violent and property offenses, clearances and rates by month for a state or an ORI from the Crime Data Explorer API on `api.usa.gov`. The API requires an api.data.gov key, so the key is saved in the OS keychain (`fbi-cde`) from Settings, Case data, sent only in the query string to that host, scrubbed from messages and never in the fetch log. Without a key the fetch is refused; the estimate needs no key.
- **Not built:** FBI active shooter reports and AMBER Alert program statistics are published as PDF reports with no data file, so there is nothing for a connector to read.

## Consequences

- Call surge baselines can match a real city's volume and response times without any call-level record entering a project.
- A county jail baseline costs a 62 MB download for a small result; the estimate says so before the user agrees.
- The FBI source is the first case data connector with a key; the same Settings pattern serves the next one.
