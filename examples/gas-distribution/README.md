# Example: Corwin Valley Gas Company

A ready-made example project for the `gas_pipeline` domain profile (#332): the fictional Corwin Valley Gas Company (a natural gas local distribution company in Lake Haven County, Pennsylvania: two city gates, fourteen district regulator stations, two low-pressure cast-iron districts, SCADA with an integrator remote-access path), its three plans from `reference/gas-distribution/` (the 49 CFR 192.615 emergency plan, the cybersecurity incident response plan built on TSA Security Directive Pipeline-2021-02G, the distribution system and SCADA description), and a tabletop exercise generated from them with the app against local models.

The company, people, places and identifiers are simulated for training use; no real utility is depicted. The SCADA product and the integrator are simulated; real equipment (Emerson ROC800) and real agencies (PHMSA, TSA, CISA, the NTSB, the National Response Center, the Pennsylvania PUC) keep their names. `reference/gas-distribution/SOURCES.md` lists the public guidance the plans paraphrase and the incident the scenario is modeled on (the 2018 Merrimack Valley overpressurization, NTSB PAR-19/02).

## Scenario

| Threat family    | Exercise                                           | What it turns on                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyber_physical` | Low-pressure overpressure while SCADA shows normal | High-flame calls from downtown Corwin, a field gauge at RS-22 reading 1.1 psig against 10 in. w.c. on the screen, PC-21 and PC-22 setpoints written from CVG-ENG01 by the integrator account through CVG-OT-JMP01, mechanical pilots and local control, isolation levels I-1 to I-4, shutting in Pressure District 7 at Valve 21 and Valve 22 with two nursing homes on a 12°F night, a SCADA command that reappears, CISA and TSA, relight |

The generated scenario was corrected by hand against the plans (pressures that add up, the inlet valves of District 7, CISA, TSA and the vendor in their real roles, no early ENDEX or instant restoration) and taken over with `refresh`.

## Rebuilding

```
pnpm build:app
node scripts/make-example.mjs generate --spec examples/gas-distribution/build.json
node scripts/make-example.mjs repair   --spec examples/gas-distribution/build.json
node scripts/make-example.mjs package  --spec examples/gas-distribution/build.json
node scripts/make-example.mjs verify   --spec examples/gas-distribution/build.json
```

Generating this scenario needed the LM Studio model loaded with a 64k context; at 32k the critique stage returned no JSON twice. Fixes after review are made in place in `.tmp/examples-release/gas-distribution/` and taken over with `refresh` (no model needed), never by regenerating.
