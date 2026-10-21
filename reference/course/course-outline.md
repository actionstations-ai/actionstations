# CSAAP Course One — "Introduction to Cybersecurity and Airport Administration"

Six modules; Modules 1–4 are built on the AAAE Certified Member (C.M.) body-of-knowledge modules (© 2022 AAAE, *not included in this repo — see `reference/README.md`*), and Modules 5–6 are cybersecurity-management content. The tabletops are the **next course**, in which students "join tabletop exercises to put the cybersecurity concepts from this course into practice… mimicking the airport environment, IT and cyber teams, and EOC/AOC using the Incident Command System."

This outline is the source of **learning objectives** that generated scenarios should target. Numbers in parentheses are the program's learning-outcome IDs.

## Module 1 — Introduction to Airports, Airport Administration, and Cybersecurity Fundamentals
Objectives: recall data integrity/availability principles (1.1); describe secure communication importance (1.2); identify key federal regulations (3.1); understand governance role (3.2).
Topics: airport history (Air Mail Act 1925 → ATSA 2001 → NextGen); stakeholders and their data needs (FAA/TSA/CBP SSI; airlines PII & ops data; concessions PCI-DSS; community); airport types (Part 139 commercial, GA, cargo, joint-use); airport as "target-rich"; governance (sponsor vs. executive); regulatory drivers (FAA grant assurances; TSA Part 1542, SDs/EAs, Part 1520 SSI; PCI-DSS); **CIA triad in the airport context**; threats — phishing, data breach, ransomware (Cleveland Hopkins example), DoS; frameworks — NIST CSF, ISO 27001, IEC 62443 (OT), MITRE ATT&CK.

## Module 2 — Airport Planning, Design, Construction & Environmental Cybersecurity
Objectives: protecting property/facility management systems (5.2); risks in commercial/capital development projects (5.5, 6.1); cybersecurity of capital development/AIP systems (6.3).
Topics: NPIAS, SASP/MASP, Master Plans, ALP/eALP and 5010 integrity; airfield design (RDC, TDG, protection areas); construction management and contractor/supply-chain cyber risk, CSPP; terminal design and **BMS/BAS and PACS security**; other terminal systems — FIDS/BIDS/GIDS, BHS, CUSS/CUTE, concessionaire POS; NEPA/environmental compliance data integrity (SWPPP, SPCC).

## Module 3 — Airport Operations, Safety Certification, and Airfield Maintenance Cybersecurity
Objectives: integrity/availability of historical/operational data (1.3); role-based access control design (1.5); ATC cyber risks (2.1); encryption in comms (2.2); **cyber incident response for ops systems (2.5)**; secure governance/legal data, ASP-related (3.4).
Topics: Part 139 and the ACM; self-inspections and NOTAM integrity; pavement, markings, **airfield lighting control (OT/SCADA)**; NAVAIDS and public protection; SICP, ARFF index, WHMP data; **AEP, NIMS/ICS, EOC systems**; ACC/dispatch and IROPS; ATSA, Parts 1540/1542, **ASP (SSI)**; security areas (AOA, SIDA, Sterile, Secured); PACS database as prime target; IP CCTV; GA security.

## Module 4 — Communications, Community Relations, Air Service & Future Trends
Objectives: stakeholder comms vulnerabilities (1.4); IDS in ATC (2.3); encryption of flight-ops data (2.4); compliance audits (3.3); monitor/adapt practices (3.5); secure tenant/contractor data (5.1, 5.3); digital property management security (5.4); vendor cyber practices (6.2, 6.4).
Topics: stakeholder engagement and board comms; **PR, crisis communications plan, social media and misinformation/impersonation**; marketing/CRM/PII; Air Service Development data; noise programs (Part 150/161) and networked monitors; NAS/ATC interfaces; NAVAIDS and capacity; NextGen (ADS-B spoofing, SWIM, DataComm, PBN); UAV/C-UAS and spaceports.

## Module 5 — Cybersecurity Governance, Risk Management, and Operational Compliance
Objectives: align leadership with cyber strategy; develop/enforce airport-specific policies; vendor risk program; airport-focused risk assessments; translate TSA directives into procedures; protect SSI; prepare for compliance audits; apply NIST CSF functions.
Topics: operationalized governance and key actors (Sponsor/Board, Executive, CISO, department heads, all staff, regulators); leadership buy-in and risk ownership; policies (ICAO guidance), compliance structure; security culture, training, phishing simulations; **Cyber Incident Response Plan (CIRP) and testing via drills/TTX**; technology (firewalls, IDS/IPS, SIEM, EDR); A-ISAC; TSA SDs/EAs (segmentation, MFA/least privilege, vulnerability management, IR plans); FAA expectations; Part 1520 SSI handling; PCI-DSS; audits; cybersecurity program charter/steering committee (ACRP Report 140); risk-based governance; **NIST CSF Identify/Protect/Detect/Respond/Recover applied to airports**.

## Module 6 — Managing Advanced Airport Cybersecurity Operations, Threat Intelligence, and Future Preparedness
Objectives: analyze vulnerabilities/threats/mitigations for airport OT (BHS, airfield lighting, BMS) (2.1, 5.4, 5.5); encryption and IDS for OT comms (2.2, 2.3); **develop a cyber incident response protocol for a specific attack on a flight-operations system (2.5)**; assess capital-project OT/ICS cybersecurity (6.3); emerging threats from NextGen, UAVs, AI (2.4, 3.5).
Topics (each with vulnerabilities / threats / mitigations):
- **BHS:** legacy OS, flat network, unauthenticated industrial protocols, vendor remote access → ransomware halts sortation; data manipulation misroutes bags → IEC 62443 zones, application whitelisting, MFA for vendors.
- **Airfield lighting & NAVAIDs:** serial-to-ethernet converters, unencrypted C2, cabinet physical security → disable runway lights, manipulate PAPI → isolated segment with OT-aware IDS, locks/seals, SSH/TLS.
- **AOCC:** third-party feeds, RMS reliance, social engineering → **FIDS manipulation (false gates/cancellations)**, RMS ransomware, radio dispatch compromise → zero trust, data diodes/input validation, pressure-tested IR simulations, redundant RMS.
- **PACS:** Wiegand, web UI SQLi/XSS, weak segmentation, credentialing social engineering → ghost badges, card cloning, DoS, pivot → OSDP, app testing, isolation, SIEM integration.
- Security culture by role (maintenance techs, procurement, IT/cyber cross-training on Modbus/BACnet).
- CTI operationalization (STIX/TAXII from A-ISAC → firewall/SIEM/EDR; inform TTX scenarios).
- **IR scenario walkthroughs:** PACS compromise (detect → contain → coordinate with AEP → eradicate/recover) and **FIDS data-integrity attack** (the direct ancestor of Scenario 3: spear-phished marketing workstation with improper access to the FIDS management interface; isolate; emergency firewall rule; activate CIRP, notify AOCC and PIO; PA and social media; manual signage; re-image; verify data before restoring feeds).
- Emerging: ADS-B spoofing via SDR (mitigate with MLAT/radar fusion), C-UAS jamming/spoofing, AI data poisoning.

## Mapping to Scenario 3
Scenario 3 exercises outcomes 1.1 (integrity), 1.4 (stakeholder comms), 2.5 (IR for a flight-ops system), 3.4 (doctrine/ASP-AEP-TIRP use) and Module 6's FIDS IR walkthrough, with the PIO track drawn from Module 4's crisis-communications content. **The generator should map each proposed scenario to outcome IDs like this and print them in the Scenario Overview.**
