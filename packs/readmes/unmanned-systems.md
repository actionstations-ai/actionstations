# Unmanned systems

Domain pack for an organization that flies unmanned aircraft: a university UAS program, a public-safety drone unit (including drone as first responder), or an inspection contractor. It covers flight operations and test sites, ground control stations, C2 links, payloads, the fleet's data, and the airspace authorizations the program flies under. A drone response at an airport belongs to the Airports pack.

Included with Action Stations and enabled by default. Turn it off on the Packs screen if you never exercise a UAS program; projects already on the domain keep working.

## What is in the pack

- **Domain profile `unmanned_systems`:** flight sites, airframes, ground control stations, frequencies, payloads, airspace and hangars as fact categories. Systems: fleet management and flight logging, mission planning, LAANC clients, the vendor cloud, GCS, C2 and telemetry links, GNSS/RTK, autopilots, Remote ID, docking stations and UAS detection. Player roles: Director of Flight Operations, Systems & Cybersecurity Lead, Aviation Safety Officer, Communications, Security, Chief Remote Pilot, Maintenance / Airworthiness Lead and Risk Manager / Counsel.
- **Example:** UAS operations (`uas-operations`).

## Plans and clocks the profile knows

- **14 CFR Part 107** and AC 107-2A: report to the FAA within **10 calendar days** an operation that causes serious injury, loss of consciousness, or property damage other than the aircraft over $500 (107.9).
- **Remote ID** (14 CFR Part 89).
- **Detection and mitigation:** under the 2020 interagency advisory (FAA, DOJ, FCC, DHS), detection tools can raise federal criminal-law questions and mitigation is generally prohibited outside authorized agencies. Since 1 Jul 2026 the SAFER SKIES Act interim final rule (6 CFR and 28 CFR part 124, 91 FR 41466) lets certified state, local, tribal and territorial law-enforcement and correctional agencies detect and mitigate credible UAS threats to people, mass gatherings, critical infrastructure and correctional facilities.
- **Proposed only:** BVLOS rules (Part 108) and fixed-site flight restrictions (Section 2209, a new Part 74).
- **CISA Be Air Aware** guidance on suspicious UAS activity and on handling a downed drone.

## Further reading (not bundled)

- ANSI/CTA-2063-A (serial numbers) and ASTM F3411 (Remote ID): https://www.cta.tech/ , https://www.astm.org/
- AUVSI policy papers: https://www.auvsi.org/

Facts were checked against public sources on 2026-10-24. The SAFER SKIES rule is an interim final rule; check its current status before relying on it.
