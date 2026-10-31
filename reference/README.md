# reference: sample plans and the hand-written exercises

This folder holds two kinds of material, all as Markdown text:

- **Sample plans**: the documents a user of each kind of organization would import into a project. The app's example projects are built from them, and the [getting started guide](../docs/guides/getting-started.md) uses the airport set.
- **The hand-written exercises**: eight airport cybersecurity tabletops written by hand for CSAAP, the Cybersecurity for Airports course, before the app existed. The app's output is measured against them, and `scenario-3/` is the main benchmark. If a generated MSEL would look weak next to that one, the generator has more work to do.

If you work on generation, prompts or inject templates, read `ncia/` (what a user uploads), `scenario-3/` (what the app has to be able to produce) and `course/` (where learning objectives come from) first.

Every organization, person, phone number, address, IP address and hostname in these documents is simulated for training use. Most sets outside the airport have a `SOURCES.md` that lists the public guidance (regulations, federal advisories) their plans paraphrase; it is not a project document.

## The airport set and the CSAAP exercises

| Path | What it is | Role in the app |
|---|---|---|
| `ncia/airport-emergency-plan-AEP.md` | North Coast International Airport (NCIA) Airport Emergency Plan | Sample project document (plan) |
| `ncia/airport-security-program-ASP.md` | NCIA Airport Security Program; its "SSI" banner is part of the fiction | Sample project document (plan) |
| `ncia/terminal-incident-response-plan-TIRP.md` | NCIA Terminal Incident Response Plan; Section 13 is the cyber section | Sample project document (plan) |
| `ncia/terminal-map.md` | NCIA terminal map (the original is an image; its facts are summarized) | Sample project document (map) |
| `ics-forms/ICS-201-incident-briefing.md` | FEMA ICS Form 201, Incident Briefing | Basis for the form template |
| `ics-forms/ICS-203-organization-assignment-list.md` | FEMA ICS Form 203, Organization Assignment List | Basis for the form template |
| `course/course-outline.md` | The CSAAP course modules, condensed | Learning objectives and outcome IDs |
| `scenario-1/` … `scenario-8/` | The eight CSAAP exercises: MSEL, controller handbook and player briefing for each | Gold-standard output |
| `scenario-3/` | "Flight to Nowhere": MSEL, master inject deck, controller handbook, player briefing | The primary benchmark |
| `scenario-3/injects/README.md` | Descriptions of the scenario's five inject images | Visual targets for templates |

Scenarios 1 to 7 also have a master inject deck. Every scenario except 3 has player material: a reference card or an evidence packet. Scenario 8, "Countdown", uses an action menu and clue cards in place of an inject deck. The example project `examples/airport-ncia/` holds all eight, seeded from these folders.

## Other domains

These sets exercise the domain-neutral generator ([ADR-0014](../docs/adr/0014-domain-profiles.md)). They follow the NCIA pattern: section-numbered plans with deliberate hooks for scenarios, consistent identifiers across documents, invented people, numbers, hostnames and addresses, and a short map or system description.

| Path | Organization | Documents |
|---|---|---|
| `transit/` | Riverbend Regional Transit Authority, a bus and light-rail agency | Emergency Operations Plan (EOP); System Security and Emergency Preparedness Plan (SSEPP); CAD/AVL and fare-system cyber annex; system map |
| `dam/` | Cedar Ridge Dam, Cedar Valley Water Authority (hydro and flood control) | Emergency Action Plan (EAP) with inundation zones and notification flowchart; security plan (physical and SCADA); O&M manual excerpt; site map |
| `city-water/` | City of Millbrook Department of Water & Sewer: a treatment plant and wells, three tanks, four pump stations, SCADA with vendor remote access | AWIA-style Emergency Response Plan; OT / cybersecurity plan and incident response playbook; SCADA system description; public communications plan; system map and asset sheet |
| `uas-ops/` | Harwick UAS Operations Group, a drone operator flying under Part 107 beside a Class C airport | Flight Operations and Safety Manual (FOM); Emergency Response Plan for flight operations (ERP); Information Security Plan for the ground-control fleet and data pipeline (ISP); site and airspace sheet |
| `chemical-rmp/` | Teague Valley Chemical Company, Corbin Falls Works | Emergency Response Plan (40 CFR 68.95); facility and process description; process control and cybersecurity plan |
| `county-911/` | Rook County Emergency Communications District, a county 911 center | ECC operations and continuity plan; cyber incident response playbook; systems, positions and radio description |
| `county-elections/` | Lisle County Board of Elections | Cybersecurity incident response plan; election contingency and continuity plan; facilities, precincts and systems description |
| `county-public-health/` | Marston County Health Department | All-hazards public health emergency operations plan; cyber incident response annex; facilities, districts and information systems description |
| `gas-distribution/` | Corwin Valley Gas Company, a natural gas distribution utility | Gas emergency plan (49 CFR 192.615); distribution system and SCADA description; cybersecurity incident response plan |
| `hospital/` | Ottawa River Regional Medical Center, a 412-bed hospital in Toledo, Ohio | Emergency operations plan (42 CFR 482.15); EHR downtime procedures annex; cyber incident response plan; patient surge and evacuation annex; facilities and information systems description |
| `k12-district/` | Halverson Unified School District | District Emergency Operations Plan; cyber incident response plan; schools, facilities and systems inventory |

The example projects in [`examples/`](../examples/README.md) are generated from these sets (all but `transit/` and `dam/`).

## Not included: copyrighted course texts

The CSAAP course also used the four AAAE Certified Member (C.M.) Body of Knowledge modules (7th edition, © 2022 American Association of Airport Executives, all rights reserved). They are licensed course texts and are not in this repository; `course/course-outline.md` summarizes them by topic. To test ingestion with them locally, put your own copies in `reference/originals/private/`, which git ignores.

## `originals/`: the source files, added by hand

The original PDFs and PNGs are not committed. If you have them, copy them into `reference/originals/`; they make realistic ingestion test files and visual targets:

```
originals/
  North Coast International Airport NCIA  Airport Emergency Plan AEP.pdf
  North Coast International Airport NCIA  Airport Security Program ASP.pdf
  North Coast International Airport NCIA  Terminal Incident Response Plan TIRP.pdf
  NCIA Terminal Map.pdf
  ICS Form 201 – Incident Briefing v3.pdf
  ICS Form 203 – Organization Assignment List v3.pdf
  Scenario 3 – Master Scenario Events List MSEL.pdf
  Scenario 3 – Master Inject Deck.pdf
  Scenario 3 – Controller Handbook.pdf
  Scenario 3 – Player Briefing Packet.pdf
  Scenario 3  Inject I02a.png
  Scenario 3  Inject I04.png
  Scenario 3  Inject I06.png
  Scenario 3  Inject I06b.png
  Scenario 3  Inject I10b.png
  Module 1  Presentation.pdf … Module 6  Presentation.pdf
  private/            (ignored by git) AAAE Module 1–4 PDFs, if you have them
```

The blank ICS forms are published by FEMA: https://training.fema.gov/icsresource/icsforms.aspx
