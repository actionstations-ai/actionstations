# Example: Lisle County Board of Elections

A ready-made example project for the `elections` domain profile (#332): the fictional Lisle County Board of Elections (Carrow, Ohio: 24 precincts at 12 polling locations, an Early Vote Center, one drop box, paper ballots on precinct scanners and electronic pollbooks loaded from the county voter registration system), its three plans from `reference/county-elections/`, and a tabletop exercise generated from them with the app against local models.

The organization, people, contests and identifiers are simulated for training use; no real election office, candidate or party is depicted. Real voting equipment (ES&S DS200, DS850, ExpressVote, Electionware, KnowInk Poll Pad) and real agencies (the Ohio Secretary of State, CISA, the FBI, the EAC) keep their names; the voter registration system is simulated. `reference/county-elections/SOURCES.md` lists the public guidance the plans paraphrase (EAC contingency and COOP templates, the EAC/CISA incident response communications guide, CISA election checklists, the voting machine CTEP).

## Scenario

| Threat family | Exercise                                            | What it turns on                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyber`       | Altered voter records five days before the election | 1,186 records in Precinct 111 and Precinct 112 marked "mail ballot issued" from a phished clerk's account, a spoofed Polling Location 6 relocation, a defaced results page, the Secretary of State's questions, freezing record changes (COOP-DR-5) and rebuilding the pollbook from the air-gapped 10/28 export, provisional ballots, the public statement (COOP-DR-6), the records hold |

The generated scenario was corrected by hand against the plans (the exercise day, one time jump per phase, no mid-exercise ENDEX, the Secretary of State and CISA in their real roles, the drop box's location) and taken over with `refresh`.

## Rebuilding

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/county-elections/build.json
node scripts/make-example.mjs repair   --spec examples/county-elections/build.json
node scripts/make-example.mjs package  --spec examples/county-elections/build.json
node scripts/make-example.mjs verify   --spec examples/county-elections/build.json
```

Fixes after review are made in place in `.tmp/examples-release/county-elections/` and taken over with `refresh` (no model needed), never by regenerating.
