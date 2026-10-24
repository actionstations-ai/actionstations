# Example: Halverson Unified School District

A ready-made example project for the `k12_schools` domain profile (#332): the fictional Halverson Unified School District (about 9,000 students in 14 schools, Brandt County, Oregon), its three plans from `reference/k12-district/` (the district EOP after the REMS guide, the cyber incident response plan, the schools, facilities and systems inventory), and a tabletop exercise generated from them with the app against local models.

The organization, people, students and identifiers are simulated for training use; no real district is depicted. Real products (PowerSchool, Tyler Munis, Google Workspace, Microsoft Entra, Veeam) and real agencies and sector organizations (the Oregon Department of Education, the FBI, CISA, MS-ISAC, K12 SIX) keep their names. `reference/k12-district/SOURCES.md` lists the public guidance the plans paraphrase (REMS K-12 EOP guide, CISA K-12 cybersecurity findings, the K-12 CTEPs, USSS threat assessment guides).

## Scenario

| Threat family | Exercise                                                                            | What it turns on                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyber`       | Ransomware with data theft during the state assessment window, then a swatting call | Student-services files copied from HUSD-FS02 through the unpatched HUSD-VPN01, encrypted servers and a ransom note, a leak-site sample on social media, a hoax shooter call to Halverson High School, lockdown and reunification at the Fairgrounds with the 05:00 offline rosters, the testing decision with the Oregon Department of Education, the ransom and Wednesday decision with counsel, the risk pool and the FBI |

The generated scenario was corrected by hand against the plans (the exercise day, no mid-exercise ENDEX, no instant all-clear, the decision point, recipients) and taken over with `refresh`.

## Rebuilding

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/k12-district/build.json
node scripts/make-example.mjs repair   --spec examples/k12-district/build.json
node scripts/make-example.mjs package  --spec examples/k12-district/build.json
node scripts/make-example.mjs verify   --spec examples/k12-district/build.json
```

Fixes after review are made in place in `.tmp/examples-release/k12-district/` and taken over with `refresh` (no model needed), never by regenerating.
