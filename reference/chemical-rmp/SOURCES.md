# Sources — public guidance the Corbin Falls Works documents paraphrase

Teague Valley Chemical Company, the Corbin Falls Works, Corbin Falls, Teague County and every person, neighbor, vendor relationship, number, hostname and procedure in this folder are simulated for training use; no real plant is depicted. Real products (Emerson DeltaV, Schneider Electric Triconex, AVEVA PI, SAP, Microsoft 365) and real agencies keep their names. The shape of the documents and the obligations they describe follow the public guidance below. Nothing was copied; the plans paraphrase what these sources require or recommend, in the way a mid-size chlor-alkali plant's own plans would. The research behind them is docs/research/domains/chemical.md.

## Regulation

- 40 CFR Part 68 (Risk Management Program): hazard assessment (worst-case and alternative release scenarios, 68.25 and 68.28), five-year accident history (68.42), emergency response program for responding facilities (68.95), annual coordination with local responders (68.93), exercises (68.96): an annual notification exercise; a tabletop exercise involving a simulated accidental release of a regulated substance before 21 December 2026 and then at least every three years; a field exercise before 15 March 2027 and then at least every ten years; an evaluation report within 90 days of each exercise. RMP corrections within six months of a reportable accident (68.195). https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-68
- EPA, *Risk Management Program: Emergency Response Exercises Fact Sheet*, EPA 550-F-25-001 (June 2026): responding vs non-responding facilities, the exercise table and deadlines, the notification-exercise procedure, the tabletop and field-exercise scope, the evaluation report. https://www.epa.gov/system/files/documents/2026-06/rmp-emergency-response-exercise-fact-sheet-508.pdf
- EPA, *General Guidance on Risk Management Programs, Chapter 8: Emergency Response Program* (December 2021): coordination with the LEPC, communicating with the community. https://www.epa.gov/sites/default/files/2013-11/documents/chap-08-final.pdf
- EPA, *List of Lists*, EPA 550-B-24-001 (April 2025): chlorine (CAS 7782-50-5) — CAA 112(r) threshold quantity 2,500 lb, EPCRA and CERCLA reportable quantity 10 lb. https://www.epa.gov/system/files/documents/2025-04/consolidated-list-of-lists-updated-april-2025.pdf
- CERCLA §103 and 40 CFR 302.6 (immediate report to the National Response Center); EPCRA §304 and 40 CFR 355 Subpart C (immediate notice to the SERC and the LEPC community emergency coordinator, then written follow-up).
- 29 CFR 1910.119 (Process Safety Management) and OSHA 3132 / OSHA 3908-03: process safety information, operating procedures, MOC, PSSR, incident investigation, emergency planning. https://www.osha.gov/sites/default/files/publications/OSHA3132.pdf
- 29 CFR 1904.39: report a fatality within 8 hours; an in-patient hospitalization, amputation or eye loss within 24 hours.
- 29 CFR 1910.38 (emergency action plans) and 1910.120(q) (HAZWOPER emergency response).
- A 2024 RMP final rule and a February 2026 EPA proposal to retain, modify or rescind parts of it are noted in the dossier as not verified; the plan only says the exercise dates are checked before scheduling.

## Chemical security and cyber

- CISA, *ChemLock: Secure Your Chemicals* (November 2021) and its facility security plan template: voluntary security planning used in place of CFATS. https://www.cisa.gov/sites/default/files/publications/chemlock-secure-chems-nov21-508.pdf
- DHS/CISA, *CFATS Risk-Based Performance Standards Guidance* (legacy; CFATS lapsed on 28 July 2023 and CISA cannot enforce it): RBPS 8 (cyber) used as a checklist. https://www.cisa.gov/sites/default/files/publications/cfats-rbps-guidance_508.pdf
- CISA, *Tabletop Exercise Package: Chemical Sector* (situation manual template, updated November 2023): exercise structure and discussion questions. https://www.cisa.gov/sites/default/files/2025-01/Chemical-Sector-CTEP-Situation-Manual-122023-508.docx

## Incidents the scenario is modeled on

- The 2017 attack on the safety instrumented system of a petrochemical plant, publicly known as TRITON or TRISIS: the attackers reached the Triconex engineering workstation and the controllers; the plant tripped when their changes failed. The dossier marks the details as not verified this session; the plan uses only the pattern (do not reset the SIS until the cause is known; key-switch position; engineering-workstation access).
- The loading-arm connection failure at a rail spot is a generic RMP "alternative release" planning case, not a specific accident.

## Methodology

- DHS Homeland Security Exercise and Evaluation Program (HSEEP): exercise design, MSEL and evaluation structure used by the generated tabletop. https://www.fema.gov/emergency-managers/national-preparedness/exercises/hseep
