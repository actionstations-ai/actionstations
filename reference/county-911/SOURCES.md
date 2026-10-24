# Sources — public guidance the Rook County documents paraphrase

Rook County, the City of Halden, the Rook County Emergency Communications District, and every person, partner agency, vendor, product, number, hostname, talkgroup and procedure in this folder are simulated for training use; no real 911 center is depicted. The shape of the documents and the obligations they describe follow the public guidance below. Nothing was copied; the plans paraphrase what these sources require or recommend, in the way a county emergency communications center's own plans would.

## Regulation

- 47 CFR 4.9(h) — a covered 911 service provider must notify an affected PSAP of an outage as soon as possible and no later than 30 minutes after discovering it, by telephone and in writing by electronic means, with an identifier unique to each outage and contact information; providers confirm the PSAP's designated contact annually. https://www.ecfr.gov/current/title-47/part-4/section-4.9
- FBI CJIS Division, *CJIS Security Policy*, Version 6.1 (25 June 2026): incident response and reporting to the state CJIS Systems Agency, and the security incident response form in its appendix. https://le.fbi.gov/file-repository/cjis_security_policy_v6-1_20260625-1.pdf

## 911 cybersecurity guidance

- CISA (SAFECOM/NCSWIC), *Cyber Risks to 911: Telephony Denial of Service* (4 June 2020). https://www.cisa.gov/sites/default/files/2023-02/Cyber%20Risks%20to%20911%20TDoS_6.4.2020%20-%20%28508c%29_1.pdf
- CISA (SAFECOM/NCSWIC), *Telephony Denial of Service Attacks: Lessons Learned from a Public Safety Answering Point* (14 April 2022): daily TDoS on a PSAP's ten-digit lines, conferenced call takers, a call-screening appliance placed in front of the call-handling equipment, staff reluctance to disconnect nuisance calls, and agreements with neighboring PSAPs. https://www.cisa.gov/sites/default/files/publications/22_0414_cyber_incident_case_studies_tdos_final_508c.pdf
- CISA (SAFECOM/NCSWIC), *Malware Attacks: Lessons Learned from an Emergency Communications Center* (14 April 2022): a worm that spread from one floor workstation to more than 30 machines including CAD consoles. https://www.cisa.gov/sites/default/files/publications/22_0414_cyber_incident_case_studies_malware_final_508c.pdf
- CISA (SAFECOM/NCSWIC), *Cyber Incident Response to Public Safety Answering Points: A State's Perspective* (14 April 2022). https://www.cisa.gov/sites/default/files/publications/22_0414_cyber_incident_case_studies_state_final_508c.pdf
- CISA, *An Introduction to Swatting and Fraudulent Calls for Emergency Communications Center Administrators* (May 2026): swatting targets, calm or recorded callers, use of ten-digit lines, ANI validation and STIR/SHAKEN. https://www.cisa.gov/sites/default/files/2026-05/Intro_to_Swatting_and_Fraudulent_Calls_for_ECCs_508.pdf
- CISA (SAFECOM/NCSWIC NG911 Working Group), *Considerations for Cyber Disruptions in an Evolving 911 Environment* (31 March 2023). https://www.cisa.gov/sites/default/files/2023-04/23_0331_s_n_ng911wg_consideration_cyber_disruptions_911_environment_508C.pdf
- CISA, *911 Cybersecurity Best Practices Package* (July 2023): incident response, recovery and continuity planning for ECCs. https://www.cisa.gov/sites/default/files/2024-05/24_0517_ecd_ead-brown_cyber-best-practices_508c.pdf
- CISA, *Cyber Risk to Public Safety: Ransomware* (29 September 2020). https://www.cisa.gov/sites/default/files/2023-02/CISA%20Cyber%20Risks%20to%20Public%20Safety%20Ransomware_9.29.20%20-%20FINAL%20%28508c%29.pdf
- CISA (SAFECOM/NCSWIC), *Cyber Risks to Next Generation 9-1-1* (November 2019). https://www.cisa.gov/sites/default/files/2023-02/NG911%20Cybersecurity%20Primer.pdf
- CISA, *Tabletop Exercise Package: Emergency Services Sector — Situation Manual* (updated January 2024): Module 1 uses a robocall TDoS as cover for a CAD intrusion. https://www.cisa.gov/sites/default/files/2025-01/Emergency-Services-Sector-CTEP-Situation-Manual-012024-508.docx

## Scenario pattern

The exercise combines seed scenarios 1 (TDoS during a severe storm), 2 (malware forcing CAD offline) and 4 (swatting) of the emergency_communications dossier. The national interoperability channel names (8CALL90, 8TAC91, VCALL10, UCALL40) are the standard names used in the National Interoperability Field Operations Guide; the county talkgroups are simulated.

## Methodology

- DHS Homeland Security Exercise and Evaluation Program (HSEEP). https://www.fema.gov/emergency-managers/national-preparedness/exercises/hseep
- FEMA ICS forms (ICS-201, ICS-205, ICS-214). https://training.fema.gov/icsresource/icsforms.aspx
