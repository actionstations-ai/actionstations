# Example: Rook County Emergency Communications District

A ready-made example project for the `emergency_communications` domain profile (#332): the fictional Rook County Emergency Communications District (a consolidated 911 center in Halden, Indiana: twelve positions, NG911 call delivery over the state ESInet, a CAD on the county domain, a five-site P25 radio system, a backup PSAP at the county highway garage), its three plans from `reference/county-911/`, and a tabletop exercise generated from them with the app against local models.

The organization, people, numbers and identifiers are simulated for training use; no real 911 center is depicted. The call-handling, CAD, recorder and call-screening products in the plans are simulated; real agencies (the Indiana State Police, the FBI, CISA, the FCC) keep their names. `reference/county-911/SOURCES.md` lists the public guidance the plans paraphrase (CISA 911 cyber resources and case studies, the CJIS Security Policy, the emergency services CTEP).

## Scenario

| Threat family | Exercise                                                             | What it turns on                                                                                                                                                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cyber`       | Telephony denial of service and CAD malware during a tornado warning | Silent calls on the 10-digit lines and then SIP trunk group A, GateKeeper TDoS-strict rules, malware beaconing from CAD-MDS01, a swatting call against a commissioner, a false "call 555-0177" number on TV, rerouting to Tamarack County (OPS-DR-2), alternate numbers and a WEA (OPS-DR-4), cards (OPS-DR-3), CJIS reporting |

The generated scenario was corrected by hand against the plans (the storm, one time jump per phase, Annex A numbers, positions, a restore that is not instant) and taken over with `refresh`.

## Rebuilding

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/county-911/build.json
node scripts/make-example.mjs repair   --spec examples/county-911/build.json
node scripts/make-example.mjs package  --spec examples/county-911/build.json
node scripts/make-example.mjs verify   --spec examples/county-911/build.json
```

Fixes after review are made in place in `.tmp/examples-release/county-911/` and taken over with `refresh` (no model needed), never by regenerating.
