# Ottawa River Regional Medical Center — Facilities and Information Systems Description

Document Control Number: ORRMC-FIS-2026 · Revision 2.1 · Effective Date: 01/15/2026 · Owners: Dana Whitcomb (Director of Facilities and Emergency Management) and Raymond Okafor (Director of Information Technology) · Reviewed: Dr. Priya Raman (Chief Medical Information Officer)

> **EXERCISE MATERIAL — for training use.** Ottawa River Regional Medical Center, its people, vendors, telephone numbers, hostnames and identifiers are simulated. Toledo, Lucas County, Ohio and the public agencies named as outside parties are real; no real hospital is depicted.

**Handling:** Internal. Contains hostnames. Copies: Hospital Command Center (HCC) binder, IT on-call binder, Clinical Engineering.

## SECTION 1: THE HOSPITAL

Ottawa River Regional Medical Center (ORRMC) is a 412-licensed-bed, not-for-profit acute care hospital in Toledo, Ohio, serving Lucas County and the surrounding northwest Ohio and southeast Michigan communities. It is a Level II trauma center, a certified stroke center and the area's only inpatient behavioral health unit with a locked pediatric wing. About 3,900 staff, 640 medical staff members and 180 volunteers work at the campus. Average daily census is 318; the emergency department sees about 74,000 visits a year.

ORRMC is not part of a multi-hospital system. It shares a regional healthcare coalition with the other hospitals, the health department, EMS and long-term care facilities of the area, and it is a member of H-ISAC.

## SECTION 2: CAMPUS AND UNITS

The campus sits on a single site on the east bank of the Maumee River. No street address is published in this document; the main entrance is signed from the city's arterial roads and the helipad is on the roof of Tower B.

| Building | Floors | What is in it |
|---|---|---|
| Tower A | 6 | Original 1962 building. Administration, Health Information Management, the Hospital Command Center (HCC, Room A-114), Pharmacy, the Laboratory, Food Services, Materials Management, Biomedical (Clinical Engineering) shop, the primary data room (A-B02, basement) |
| Tower B | 8 | Patient tower opened 2014. Emergency Department (ED, ground floor), Imaging, ICU 3 North, ICU 3 South, Cardiac Care 4 East, Medical-Surgical 4 West, 5 East and 5 West, Oncology 6 East, Women and Infants 6 West, Telemetry 7 East, Behavioral Health 7 West, helipad on the roof |
| Pavilion C | 3 | Outpatient services. Outpatient Dialysis Center (12 chairs, first floor), Infusion Center, Cardiac Rehabilitation, specialty clinics |
| Surgical Pavilion | 2 | Operating rooms 1–12, Post-Anesthesia Care Unit (PACU), Sterile Processing (SPD) |
| Central Plant | 1 | Boilers, chillers, three emergency generators, water treatment for dialysis (reverse osmosis), medical gas manifolds, bulk oxygen tank |
| Backup data room | — | Pavilion C, second floor, room C-212: secondary data room with replication target and network core |

Nursing units: 4 West (28 beds), 4 East (24), 5 East (30), 5 West (30), 6 East (24), 6 West (32 plus 18 bassinets), 7 East (24), 7 West (20), ICU 3 North (16), ICU 3 South (16). The ED has 48 treatment spaces, 6 of them in the Decontamination and Isolation Suite with its own entrance. Operating rooms 1–12 are in the Surgical Pavilion; OR 11 and OR 12 are hybrid rooms.

## SECTION 3: UTILITIES AND CRITICAL BUILDING SYSTEMS

- **Power:** two utility feeds from different substations into the Central Plant. Three diesel generators (G1, G2, G3; 2 MW each) carry the whole campus; fuel for 96 hours at full load, refuelling contract with a regional fuel distributor. Automatic transfer within 10 seconds. Generators are tested monthly under load.
- **Water:** city water enters through two connections. Domestic and dialysis water come from the municipal supply; the Central Plant holds a 40,000-gallon potable storage tank (about 18 hours at normal use, 36 hours with conservation measures). The Outpatient Dialysis Center has its own reverse osmosis (RO) loop and water quality testing (chlorine and chloramine, conductivity, microbiological cultures). Dialysis cannot run on untreated or advisory-affected supply.
- **Medical gas:** oxygen from a bulk tank at the Central Plant (about 5 days at normal use) with a reserve manifold of cylinders; medical air and vacuum plants in the Central Plant.
- **HVAC and building automation:** a building management system (BMS, server ORRMC-BMS01) controls air handlers, negative-pressure rooms and the pneumatic tube system. It runs on the facilities network, which is segmented from the clinical network by a firewall, with one allowed path to the central monitoring workstation in the HCC.
- **Elevators, doors and security:** the access control system (ORRMC-PACS01) governs badge doors, the infant protection system and the locked behavioral health unit; doors fail secure except fire exits.

## SECTION 4: INFORMATION SYSTEMS

| System | What it does | Hosts and notes |
|---|---|---|
| CareLine EHR | Electronic health record: orders, charting, medication administration (eMAR), results, scheduling and registration | Application servers ORRMC-EHR-APP01 to -APP04, database cluster ORRMC-SQL01 and ORRMC-SQL02, read-only downtime viewer BCA-VIEW01 (the Business Continuity Access viewer, updated every 15 minutes) |
| Interface engine | HL7 routing between the EHR, lab, radiology, pharmacy and devices | ORRMC-INT01 and ORRMC-INT02 |
| Laboratory information system (LIS) | Specimen tracking and results | ORRMC-LIS01; analyzers connect through middleware ORRMC-LABMW01 |
| PACS / RIS | Radiology imaging and worklists | ORRMC-PACS-IMG01; modalities in Imaging and the ED |
| Pharmacy | Order verification and automated dispensing cabinets (ADCs) on every unit | ORRMC-PHARM01; each ADC holds an offline "override" supply for downtime |
| Patient monitoring | Bedside monitors and central telemetry stations on ICU 3 North and 3 South, 4 East and 7 East | Monitoring network, own VLAN, central server ORRMC-MON01 |
| Infusion pumps | About 620 networked smart pumps with drug libraries pushed from a server | Pump server ORRMC-PUMP01; pumps keep running their programmed therapy without the network |
| Medical devices | Ventilators, anesthesia machines, imaging modalities, dialysis machines, lab analyzers, sterilizers | Managed by Clinical Engineering; inventory 9,400 devices; device segments 10.40.x.x |
| Bed management and patient flow | Census, transport and bed assignment | ORRMC-BED01 |
| Secure messaging and nurse call | Staff phones, nurse call, overhead paging | Hosted secure messaging service plus on-premises call servers |
| Revenue cycle | Patient accounts, claims through a clearinghouse | ORRMC-RCM01 |
| Identity and email | Active Directory, cloud email, multi-factor authentication | ORRMC-DC01 to DC03 |
| Backup | Nightly backups to disk in room C-212, weekly offline copies to tape rotated off site, immutable cloud copy of the EHR database | ORRMC-BKP01 |

**Network:** a core in room A-B02 and a second core in room C-212; clinical, device, monitoring, facilities and guest networks are separate VLANs behind internal firewalls. Remote access through a VPN with multi-factor authentication; vendor remote access to the imaging and monitoring systems through a supervised session broker.

**Cybersecurity services:** a managed detection and response service (a regional security provider) monitors endpoints and the network 24 hours a day and calls the IT on-call phone. The Information Security Officer is Marcus Hale.

## SECTION 5: OUTSIDE PARTIES

Responders and agencies the hospital calls or that call the hospital: Toledo Fire and Rescue Department; Toledo Police Department; Lucas County EMS; the Toledo-Lucas County Health Department; the Lucas County Emergency Management Agency; the City of Toledo Department of Public Utilities (water); the Ohio Department of Health; the Ohio Emergency Management Agency; the Ohio Hospital Association; the regional healthcare coalition; the FBI Cleveland Field Office; CISA; HHS (Office for Civil Rights and the Administration for Strategic Preparedness and Response); H-ISAC; the American Red Cross; neighbouring hospitals as receiving and sending facilities.

## SECTION 6: KEY CONTACTS

| Role | Primary | Alternate |
|---|---|---|
| Administrator on Call (Incident Commander) | Helen Marchetti, Chief Operating Officer | Dr. Samuel Obuya, Chief Medical Officer |
| Director of Facilities and Emergency Management | Dana Whitcomb | Tomas Reyes |
| Director of Information Technology | Raymond Okafor | Nadia Petrov, Infrastructure Manager |
| Information Security Officer | Marcus Hale | Lena Fischer |
| Chief Nursing Officer | Carol Beckett | Rafael Ortiz, Director of Critical Care |
| Chief Privacy Officer | Joyce Tanaka | Daniel Whitfield, Compliance |
| Public Information Officer | Kevin Dunmore | Alicia Moreno |
| Clinical Engineering Manager | Peter Lindqvist | Hao Tran |
| Director of Security | Terrence Boyd | Marla Reese |
| Nephrology Medical Director and Dialysis Manager | Dr. Anita Shah and Beth Kowalczyk, RN | |
