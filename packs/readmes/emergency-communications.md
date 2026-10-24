# 911 and emergency communications

Included with Action Stations. This pack adds the `emergency_communications` domain profile: a fictional primary or consolidated PSAP / emergency communications center with NG911 call handling, CAD dispatch for police, fire and EMS, a trunked radio system, the logging recorder, alert and warning, and a backup PSAP.

Facts below were checked on 2026-10-24. State 911 rules vary, so check your state's rules before relying on a deadline.

## Plans and programs the profile assumes

| Plan                                                                        | Basis                                                                                                                                                       |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Continuity of operations and backup PSAP plan                               | State 911 rules (vary); NENA standards; the CISA 911 Cybersecurity Best Practices Package (July 2023) recommends incident response, recovery and COOP plans |
| Cyber incident response plan for the center (TDoS and CAD-down playbooks)   | No federal mandate; CISA and SAFECOM guidance                                                                                                               |
| CJIS security program                                                       | FBI CJIS Security Policy v6.1 (25 June 2026), through the state CJIS Systems Agency                                                                         |
| Tactical Interoperable Communications Plan and ICS 205 communications plans | SAFECOM / NCSWIC guidance                                                                                                                                   |
| Statewide Communication Interoperability Plan                               | State-level, owned by the SWIC                                                                                                                              |
| IPAWS alerting authority and MOA                                            | FEMA IPAWS program                                                                                                                                          |

## Reporting deadlines

- Providers must notify an affected 911 special facility as soon as possible, no later than 30 minutes after discovering an outage that potentially affects it, by telephone and in writing by electronic means, with a unique outage identifier and contact details (47 CFR 4.9(h)). Keep a designated outage contact on file with your carriers; providers confirm it once a year.
- The providers' own FCC NORS filings: notification within 120 minutes, initial report within 72 hours, final report within 30 days.
- The center itself generally reports nothing to the FCC. It reports CJIS security incidents to the state CJIS Systems Agency under CJIS Security Policy, and follows state 911 board rules and state breach law.

## Copyrighted references (not bundled)

- NENA standards (i3 NG911, GIS data model, call processing, NG911 security): https://www.nena.org/page/standards
- APCO ANS standards (telecommunicator training, cybersecurity): https://www.apcointl.org/
- The National Interoperability Field Operations Guide (NIFOG) v2.02 is a CISA publication but contains a third-party copyrighted figure; link only: https://www.cisa.gov/safecom/field-operations-guides
