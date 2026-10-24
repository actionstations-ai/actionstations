# Gas utilities and pipelines

Included with Action Stations. This pack adds the `gas_pipeline` domain profile: a fictional natural gas local distribution company or transmission pipeline operator, with city gates and regulator stations, compressor stations and mainline valves, storage, a gas control room on SCADA, and field servicepersons answering odor calls. Hazardous-liquid pipelines fit too. The `gas` alias now resolves here instead of to the energy utility profile.

Facts below were checked on 2026-10-24. Security directives expire and rules change, so check the current text before relying on a deadline.

## Plans and programs the profile assumes

| Plan or duty                                                                                                                                                                                                                                                                 | Basis                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Written emergency procedures: receiving and classifying notices, communicating with 911 and responders, emergency shutdown and pressure reduction, immediate and direct notice to the PSAP on a notification of potential rupture, rupture identification, restoring service | 49 CFR 192.615                                                                       |
| Cybersecurity Coordinator and alternate, available 24/7                                                                                                                                                                                                                      | TSA Security Directive Pipeline-2021-01G, effective 16 Jan 2026, expires 15 Jan 2027 |
| TSA-approved Cybersecurity Implementation Plan, a Cybersecurity Incident Response Plan exercised at least once a year, and a Cybersecurity Assessment Plan with an annual report                                                                                             | TSA Security Directive Pipeline-2021-02G, effective 3 May 2026, expires 2 May 2027   |
| Corporate security program (voluntary)                                                                                                                                                                                                                                       | TSA Pipeline Security Guidelines, March 2018 with Change 1 (April 2021)              |

## Reporting deadlines

- Incident to the National Response Center by telephone (800-424-8802): at the earliest practicable moment, no later than 1 hour after confirmed discovery; revise or confirm within 48 hours (49 CFR 191.5). The April 2026 amendment removed the electronic NRC option.
- Written incident report for distribution systems: within 30 days on Form PHMSA F 7100.1 (49 CFR 191.9).
- Safety-related condition report: within 5 working days of determination, no later than 10 working days after discovery (49 CFR 191.25).
- Cybersecurity incident to CISA: as soon as practicable, no later than 72 hours after identification (SD Pipeline-2021-01G).

## Copyrighted references (not bundled)

- API RP 1162 (public awareness), API RP 1173 (pipeline safety management systems), API 1164 (pipeline SCADA security), API RP 1167 (alarm management): https://www.api.org
- AGA and INGAA guidance; ONG-ISAC and DNG-ISAC products (member-only).
- The 2024 Emergency Response Guidebook (ERG 2024) is a joint international publication; link only: https://www.phmsa.dot.gov/training/hazmat/erg/emergency-response-guidebook-erg
