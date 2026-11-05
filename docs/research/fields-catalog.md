# Fields catalog: where tabletop exercises are used, and what each field needs

Researched 2026-11-05 for the fields epics. Each field becomes a domain (the organization exercised), one or more toolkits (shared expertise any domain can use, spec 0448), or both. **[V]** = checked against a primary or official source this session; **[U]** = to verify in the field's dossier.

## Why fields exercise

The strongest pull is a requirement to exercise. Where one exists, Action Stations saves the organization real work every year.

| Requirement                                                                                                                                               | Who                                      | Status         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------- |
| CMS emergency preparedness (42 CFR 482.15(d)(2)): two exercises a year for hospitals, one of them full-scale (or functional), the other may be a tabletop | Hospitals and many provider types        | [V]            |
| Joint Commission EM.16.01.01: an annual operations-based exercise plus an annual exercise of choice                                                       | Accredited hospitals                     | [V]            |
| PREP (oil spill): annual spill management team tabletop, full-plan exercise every three years, a worst-case discharge scenario each triennium             | Vessels, facilities, pipelines, offshore | [V]            |
| NERC CIP-008 and CIP-009: test incident response and recovery plans                                                                                       | Electric utilities                       | [V]            |
| USDA APHIS training and exercise program follows HSEEP for animal disease outbreaks                                                                       | Animal health agencies                   | [V]            |
| CDC PHEP: annual exercises with partners (waived in some recent periods)                                                                                  | Public health departments                | [V, dated]     |
| HIPAA Security Rule contingency plan testing and revision                                                                                                 | Covered entities                         | [U]            |
| FAA airport emergency plan exercises (14 CFR 139.325)                                                                                                     | Certificated airports                    | [U]            |
| NRC emergency preparedness exercises for nuclear plants                                                                                                   | Nuclear operators                        | [U]            |
| EU NIS2 and DORA, Australia's SOCI Act: incident response testing                                                                                         | Critical sectors abroad                  | [V, secondary] |

Education is the second pull: nursing programs may replace up to half of clinical hours with high-quality simulation (NCSBN 2014) **[V]**, simulation follows the INACSL Healthcare Simulation Standards of Best Practice (prebriefing, facilitation, professional integrity, debriefing) **[V]**, and clinical judgment is measured with NCSBN's Clinical Judgment Measurement Model **[V]**. Only about 37% of hospitals without a past cyber emergency had run a cyber drill or tabletop (small survey) **[V]**.

## The fields

Tier 1 has a requirement, an education market, or toolkits many others reuse. Tier 2 extends existing domains. Tier 3 opens new audiences.

| Field (epic)                                               | Tier | Who exercises                                                   | New toolkits                                              | Reuses                                 |
| ---------------------------------------------------------- | ---- | --------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| Health informatics and clinical IT (#684)                  | 1    | CIOs, CMIOs, CNIOs, informaticists, HIM, clinical engineering   | clinical systems (EHR, downtime, interfaces)              | cyber, regulatory clocks               |
| Nursing and clinical care (#685)                           | 1    | Nurses, charge nurses, nursing schools, rapid response teams    | clinical care (vitals, labs, MAR, triage, SBAR)           | clinical systems, MCI                  |
| Classroom and course use (#686) (cross-cutting)            | 1    | Instructors and students in every field                         | learning outcomes and grading                             | all                                    |
| Flooding and hydrology (#687)                              | 1    | Emergency management, utilities, farms, transportation          | flooding (gauges, forecasts, inundation)                  | weather, earth sciences                |
| Environmental response and oil spills (#688)               | 1    | Spill management teams, Coast Guard area committees, facilities | spill and plume (trajectory, sensitive areas)             | weather, maritime                      |
| EMS, fire and hazardous materials (#689)                   | 2    | EMS agencies, fire departments, hazmat teams, dispatch          | MCI and triage, hazmat (ERG), dispatch                    | clinical care, weather, wildfire       |
| Epidemiology and outbreak science (#690)                   | 2    | Health departments, infection prevention, epidemiology programs | epidemiology (curves, transmission, contact tracing)      | public health domain, animal health    |
| Crisis communications and journalism (#691)                | 2    | Communications teams, PIOs, newsrooms, journalism schools       | media environment (news cycle, verification, sentiment)   | every domain                           |
| Corporate governance, risk and business continuity (#692)  | 2    | Boards, executives, general counsel, risk and BC managers       | governance decisions (materiality, disclosure)            | regulatory clocks, crisis comms        |
| Animal health, veterinary and agriculture (#693)           | 2    | State veterinarians, producers, extension, vet schools          | animal disease (premises, movement control, depopulation) | epidemiology, flooding, weather        |
| Wildfire (#694)                                            | 2    | Fire agencies, utilities (power shutoffs), counties, schools    | wildfire (perimeters, spread, smoke, evacuation zones)    | weather, earth sciences (debris flows) |
| Supply chain and logistics (#695)                          | 3    | Supply chain, procurement, logistics and food safety teams      | logistics (shipments, inventory, traceability)            | maritime, agriculture                  |
| Pharmacy and pharmaceutical supply (#696)                  | 3    | Pharmacists, pharmacy schools, health-system pharmacy           | pharmacy (shortages, cold chain, dispensing)              | clinical care, supply chain            |
| Behavioral health and human services (#697)                | 3    | Crisis lines, mental health, social services, mass care         | human services (shelters, reunification, crisis lines)    | public health, crisis comms            |
| Law enforcement, corrections and courts (#698)             | 3    | Police, sheriffs, corrections, courts, law schools              | justice (CAD, negotiation, court continuity)              | crisis comms, dispatch                 |
| Research labs and biosafety (#699)                         | 3    | Biosafety officers, lab managers, research compliance           | lab safety (exposure, select agents, sample loss)         | epidemiology, cyber                    |
| AI incidents and synthetic media (#700)                    | 3    | Security, trust and safety, comms, AI governance teams          | AI incidents (deepfakes, model failure, disclosure)       | crisis comms, governance               |
| Space weather and satellite operations (#701)              | 3    | Utilities, aviation, telecom, satellite operators               | space weather (geomagnetic storms, GNSS loss)             | weather, energy, telecom               |
| Humanitarian and international response (#702)             | 3    | NGOs, UN cluster partners, international aid teams              | humanitarian (field security, cluster coordination)       | epidemiology, human services           |
| Hospitality, tourism and cruise (#703)                     | 3    | Hotels, cruise lines, tourism boards, resorts                   | outbreak at sea, guest emergencies                        | epidemiology, crisis comms, venues     |
| Construction, engineering and the built environment (#704) | 3    | Contractors, engineers, building officials, engineering schools | structures (inspection, collapse, safety)                 | earth sciences, weather                |

Earlier epics: toolkits framework (#648), meteorology (#647), earth sciences (#668).

## How a field is built

Each field epic follows the same steps (spec 0448 FR-16): a research dossier in `docs/research/domains/`, a spec, the domain profile and toolkits as packs, data connectors and figures where the field has public data, structured decisions and metrics, a public-domain document library, two or three example projects, and a review by a practitioner before release.
