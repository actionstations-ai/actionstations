# Health informatics and clinical IT

Included with Action Stations. This pack adds the `health_informatics` domain profile: the clinical IT desk of a fictional hospital or health system, with a CIO, CMIO, CNIO, EHR and interface analysts, health information management, clinical engineering and an informatics-program lab. It is the same organization as the `healthcare` profile seen from the systems side. Use both together for a full hospital exercise. The clinical systems toolkit (its own pack) supplies the downtime, interface and identity knowledge, decisions and evaluation measures.

Facts below were checked on 2026-11-04. Regulations and accreditation standards change; check the current text before relying on them.

## Plans and requirements the profile assumes

| Plan or requirement                                                          | Basis                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hospital emergency preparedness exercises                                    | 42 CFR 482.15(d)(2): the hospital must conduct exercises to test the emergency plan at least twice a year; one is an annual full-scale community-based exercise (or a facility-based functional exercise), the other may be a facilitator-led tabletop |
| Medical documentation that preserves patient data                            | 42 CFR 482.15(b)                                                                                                                                                                                                                                       |
| Contingency plan (backup, disaster recovery, emergency mode) and its testing | HIPAA Security Rule, 45 CFR 164.308(a)(7); testing and revision procedures are an addressable specification                                                                                                                                            |
| Breach notification                                                          | 45 CFR 164.400 through 164.414; individual notice without unreasonable delay and no later than 60 calendar days after discovery                                                                                                                        |
| Accreditation exercise standard                                              | Joint Commission EM.16.01.01 (copyrighted; named, not bundled)                                                                                                                                                                                         |

The exercise record this profile produces is an aid. The hospital's compliance office decides whether an exercise satisfies a requirement.

## Threat families this pack adds

`ehr_downtime`, `interface_failure`, `identity_overlay`, `clinical_alert_fault`, `device_network_loss` and `clinical_third_party_failure`, each with a phase arc. The built-in cyber, insider and infrastructure failure families are reused.

## Scenario seeds from past incidents

Facts only, dated and attributed, checked 2026-11-04. They are history, not feeds, and no exercising organization takes a real organization's name.

- **Ascension, May 2024.** The company reported unusual activity on its network systems on 2024-05-08 and said care teams started established downtime procedures. Its statements put EHR access as restored across the system by mid-to-late June 2024 (its filings give mid-June in one place and "by June 30, 2024" in another). Seed: weeks of downtime, with the restore sequence and reconciliation as the main problem.
- **Change Healthcare, February 2024.** A clearinghouse outage disrupted claims, eligibility and pharmacy processing (HHS Office for Civil Rights FAQ). Seed: a third-party failure with no workaround of your own.
- **CrowdStrike endpoint update, 2024-07-19.** The American Hospital Association advised that hospitals canceled some elective services and used downtime procedures. Seed: a non-malicious endpoint failure.
- **Scripps Health, May 2021, and its neighbors.** Dameff et al., JAMA Network Open 2023;6(5):e2312270, reported more emergency department volume and stroke code activations at hospitals next to a health system under a month-long ransomware attack. Seed: the neighbor's exercise. Check the paper for exact figures before quoting any.

## Not bundled

- Joint Commission standards: https://www.jointcommission.org/
- HL7 v2 standard text (licensed): https://www.hl7.org/
- Vendor documentation
