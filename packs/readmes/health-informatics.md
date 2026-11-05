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

## Not bundled

- Joint Commission standards: https://www.jointcommission.org/
- HL7 v2 standard text (licensed): https://www.hl7.org/
- Vendor documentation
