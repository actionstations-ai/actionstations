# ADR-0148: Space weather replay reads three fixed services, validates every response, and never fills a gap

Date: 2026-11-05 · Status: Accepted · Issues: #822 · Spec: [0468](../specs/0468-space-weather.md) · Related: ADR-0076 (case data), ADR-0081

## Context

A replay needs real Kp, flux, magnetometer data and the messages SWPC issued. The SWPC data service keeps about a week and a Kp feed has already changed shape. The long-term record is at NCEI, as plain daily files.

## Decision

- **Three connectors, one host each:** `swpc-realtime` (services.swpc.noaa.gov), `ncei-swpc-archive` (www.ngdc.noaa.gov, NCEI's host for the SWPC daily products) and `usgs-geomag` (geomag.usgs.gov). No keys. Requests carry dates, a feed or product name and an observatory code, never plan content.
- **Estimate before fetch,** from the query alone. Real-time feed size scales with the window; the archive costs a day's two small files; the magnetometer cost follows the sampling period.
- **Validate and refuse.** Feeds are parsed with loose zod schemas and an unexpected shape is refused with the service named. The archive's daily indices file is parsed only in the layout seen; another layout is refused.
- **Never fill a gap.** A day without an archived file is listed in the dataset's modification note; if no day has one the fetch fails plainly. Missing magnetometer samples stay missing. Messages are stored as written with their code and serial number, and as ground-truth events.
- **Share what exists.** Time and option helpers come from `noaa-common.ts` and response validation from `json.ts`; the archive layouts are parsed in `space_weather/archives.ts`.
- **The library is pointers.** The storm library lists dates and the peak level read from the archive; no data is bundled.

## Consequences

- A format change is a one-file fix with a fixture update; opt-in live tests (`LIVE=1`) catch it.
- The USGS geomagnetism service answered 404 to a User-Agent starting with "Action" and holding an http(s) URL. The app now names itself `AS/<version> (+https://actionstations.ai)` everywhere, which it accepts (#1095).
