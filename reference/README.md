# reference/ — CSAAP source material and gold-standard outputs

Everything the CSAAP Tabletops project held, as text, plus a slot for the original binaries. Claude Code should read all of this before generating anything: `ncia/` is what an end user would *upload* to a project; `scenario-3/` is what the app must be able to *produce*; `course/` is where learning objectives come from.

## Included (text, extracted and lightly formatted)

| Path | Original project file | Role in the app |
|---|---|---|
| `ncia/airport-emergency-plan-AEP.md` | North Coast International Airport NCIA Airport Emergency Plan AEP.pdf | Sample project document (plan) |
| `ncia/airport-security-program-ASP.md` | …Airport Security Program ASP.pdf | Sample project document (plan, "SSI") |
| `ncia/terminal-incident-response-plan-TIRP.md` | …Terminal Incident Response Plan TIRP.pdf | Sample project document (plan) — Section 13 is the cyber section |
| `ncia/terminal-map.md` | NCIA Terminal Map.pdf (image-only; facts summarized) | Sample project document (map) |
| `ics-forms/ICS-201-incident-briefing.md` | ICS Form 201 – Incident Briefing v3.pdf | Form template basis |
| `ics-forms/ICS-203-organization-assignment-list.md` | ICS Form 203 – Organization Assignment List v3.pdf | Form template basis |
| `scenario-3/msel.md` | Scenario 3 – Master Scenario Events List MSEL.pdf | **Gold-standard output** |
| `scenario-3/master-inject-deck.md` | Scenario 3 – Master Inject Deck.pdf | **Gold-standard output** |
| `scenario-3/controller-handbook.md` | Scenario 3 – Controller Handbook.pdf | **Gold-standard output** |
| `scenario-3/player-briefing.md` | Scenario 3 – Player Briefing Packet.pdf | **Gold-standard output** |
| `scenario-3/injects/README.md` | the five Inject PNGs (described) | Visual targets for templates |
| `course/course-outline.md` | Module 1–6 Presentation.pdf (condensed) | Learning objectives / outcome IDs |

## NOT included — copyright

The project also contains the four **AAAE Certified Member (C.M.) Body of Knowledge** modules (7th ed., © 2022 American Association of Airport Executives, "All Rights Reserved"): Module 1 Finance and Administration of Airports; Module 2 Planning, Construction, and Environmental; Module 3 Airport Operations, Security and Maintenance; Module 4 Communications and Community Relations. They are licensed course texts and must **not** be committed to a public repository. They are summarized by topic in `course/course-outline.md`. If you want them available to the app locally for testing ingestion, put them in `reference/originals/private/` which is gitignored.

## `originals/` — add these by hand

Binary files could not be exported from the project automatically. Copy them from the CSAAP project into `reference/originals/` (they are useful as realistic ingestion test fixtures and as visual targets):

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
  private/            (gitignored) AAAE Module 1–4 PDFs if desired
```

External link kept from the project: FEMA ICS forms — https://training.fema.gov/icsresource/icsforms.aspx

## Everything here is fictional
NCIA, NCRAA, every named person, phone number, IP address and hostname are invented for teaching. The ASP's "SSI" banner is part of the fiction.
