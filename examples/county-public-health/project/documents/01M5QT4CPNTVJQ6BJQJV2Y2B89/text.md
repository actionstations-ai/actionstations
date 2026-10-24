# Marston County Health Department — Facilities, Districts and Information Systems Description

Document Control Number: MCHD-FAC-SYS-2026 · Revision 2.0 · Effective Date: 02/01/2026 · Maintained by: Travis Lindqvist (PHEP Coordinator) and Wes Tran (Informatics Lead) · Reviewed: Darnell Okafor (MCM / SNS Coordinator), Pamela Ruiz (Marston County IT Director)

> **EXERCISE MATERIAL — for training use.** Marston County, the City of Ellery, the Marston County Health Department, its people, partners, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 1.0 — 05/01/2024 — All — First edition for the PHEP work plan · 1.1 — 03/15/2025 — Sections 3, 4 — POD 6 added; ColdSentry sensors replaced the paper logs · 2.0 — 02/01/2026 — All — Systems inventory and data flows for the Cyber Incident Response Annex

**Handling:** Internal. Contains hostnames and building details.

## Table of Contents

Section 1 Overview · Section 2 Health Districts · Section 3 Buildings and Clinics · Section 4 POD Sites · Section 5 Vaccine Storage · Section 6 Information Systems Inventory · Section 7 Data Flows · Section 8 Networks and Accounts · Section 9 Partners

## SECTION 1: OVERVIEW

The Marston County Health Department (MCHD) has 96 staff in four buildings. It runs immunization, family planning, STD, TB and WIC clinics; communicable disease investigation; environmental health (food, pools, private wells, septic); vital records; and public health preparedness. The department has no laboratory of its own: specimens go to the Kansas Health and Environmental Laboratories in Topeka by courier, or to commercial labs.

## SECTION 2: HEALTH DISTRICTS

| Health District | Towns and townships | Office | District nurse lead | Schools (public / private) |
|---|---|---|---|---|
| Health District 1 | City of Ellery | Ellery Health Center | Paula Wren | 14 / 3 |
| Health District 2 | Brandt, Harlan Township, Osage Township | North District Clinic | Dana Whitcomb | 7 / 2 (Grace Fellowship Academy, Brandt Christian School) |
| Health District 3 | Coyle, Mill Creek Township, Sumner Township | South District Clinic | Joel Ferraro | 6 / 1 |
| Health District 4 | Lindell, Prairie Township | West District Office | Anita Brooks | 4 / 0 |

There are no other health districts or service areas in the county.

## SECTION 3: BUILDINGS AND CLINICS

| Site | Address | Hours | Functions | Staff |
|---|---|---|---|---|
| Ellery Health Center | 400 Courthouse Square, Ellery | Mon–Fri 08:00–17:00; Thu to 19:00 | Headquarters, DOC (Conference Room B), all clinics, epidemiology, environmental health, vital records, vaccine depot (VF-01 to VF-04) | 71 |
| North District Clinic | 112 Main Street, Brandt | Mon, Wed, Fri 08:00–16:30 | Immunization, WIC, family planning; vaccine refrigerator VF-05 | 11 |
| South District Clinic | 38 Cedar Avenue, Coyle | Tue, Thu 08:00–16:30 | Immunization, WIC; vaccine refrigerator VF-06 | 8 |
| West District Office | 7 Depot Road, Lindell | Wed 09:00–15:00 | Environmental health field office, WIC; no vaccine storage | 6 |

These are the only MCHD clinics and district offices. Partner clinics (not MCHD): Prairie Valley Family Clinic (federally qualified health center, Ellery and Brandt), Brandt Pediatrics, Coyle Family Medicine.

Hospitals: Marston Regional Medical Center, Ellery (148 beds, emergency department, airborne-infection isolation rooms AIIR-1 to AIIR-4); St. Brigid Hospital, Brandt (25-bed critical access hospital, one AIIR).

## SECTION 4: POD SITES

| POD | Site | Address | Layout | Owner contact | IT on site |
|---|---|---|---|---|---|
| POD 1 | Ellery High School gymnasium | 1200 Pioneer Road, Ellery | Walk-through, 10 vaccination stations | Ellery Public Schools facilities | School Wi-Fi guest network; MCHD brings 6 laptops and 2 hotspots |
| POD 2 | Brandt Middle School gymnasium | 300 School Street, Brandt | Walk-through, 6 stations | Brandt Public Schools facilities | 4 laptops, 1 hotspot |
| POD 3 | Marston County Fairgrounds Expo Hall | 2100 Fair Road, Ellery | Drive-through lanes A–D plus walk-in, 12 stations | Marston County Fair Board | Wired county link to the fair office; 8 laptops |
| POD 4 | Coyle Community Center | 15 Park Lane, Coyle | Walk-through, 5 stations | City of Coyle | 3 laptops, 1 hotspot |
| POD 5 | Lindell Elementary School | 50 Elm Street, Lindell | Walk-through, 4 stations | Prairie Unified Schools | 3 laptops, 1 hotspot |
| POD 6 | Ellery Civic Arena | 500 Arena Drive, Ellery | Mass dispensing only, 20 stations | City of Ellery | Arena network (guest VLAN) |

POD laptops run SlotWise check-in in a browser and record doses on paper form MCHD-F-40 when the network is unavailable.

## SECTION 5: VACCINE STORAGE

| Unit | Location | Type | Monitor |
|---|---|---|---|
| VF-01, VF-02 | Ellery Health Center, Room 108 | Pharmaceutical refrigerators | ColdSentry sensors CS-101, CS-102 |
| VF-03 | Ellery Health Center, Room 108 | Pharmaceutical freezer | CS-103 |
| VF-04 | Ellery Health Center, Room 108 | Pharmaceutical refrigerator (POD reserve) | CS-104 |
| VF-05 | North District Clinic | Pharmaceutical refrigerator | CS-105 |
| VF-06 | South District Clinic | Pharmaceutical refrigerator | CS-106 |

ColdSentry sends alarms by text and phone to the clinic manager and the MCM Coordinator. Sensors report over cellular, independent of the county network.

## SECTION 6: INFORMATION SYSTEMS INVENTORY

| System | Purpose | Hosted | Host / URL | Owner | Paper fallback |
|---|---|---|---|---|---|
| State disease surveillance system | Case investigation, ELR and eCR receipt, contact records | KDHE | state web portal (individual accounts) | KDHE; local users managed by Colin Mercer | MCHD-F-10, MCHD-F-20 |
| State Immunization Information System (IIS) | Immunization histories; receives MCHD doses nightly | KDHE | state web portal | KDHE; MCHD users managed by Wes Tran | Paper records |
| ESSENCE (syndromic surveillance) | Emergency department visit data | KDHE / CDC NSSP | web | Dr. Neha Raman | KDHE daily summary by email |
| ClinicTrack EHR (Corvane Health) | Clinic records, billing, dose documentation | County data center | MCHD-EHR-APP01 (application), MCHD-SQL02 (database) | Wes Tran; Corvane support | MCHD-F-40 |
| IIS interface engine | Builds the nightly HL7 VXU file from ClinicTrack and sends it to the state IIS by SFTP | County data center | MCHD-INT01, job IIS-EXPORT-NIGHTLY at 01:30 | Wes Tran | None (records wait) |
| SlotWise | Online appointment booking for clinics and PODs; text reminders | Vendor cloud | booking page on marstonhealth.example | Jenna Fowler | Paper booking sheets |
| File shares | Program files, templates, the printed-plan masters | County data center | MCHD-FS01 (\\\\MCHD-FS01\\Epi, \\\\MCHD-FS01\\Clinics) | County IT | DOC kit |
| Outbreak SharePoint site "MCHD Epi Response" | Working line lists, contact tracing assignments | Microsoft 365 (county tenant) | — | Dr. Neha Raman | Printed line list |
| Fax server | Inbound epidemiology and clinic faxes to email | County data center | MCHD-FAX01 (Epi fax 555-0149) | County IT | Phone reports |
| Email, Teams, identity | Microsoft 365, county Active Directory | County tenant / data center | MC-DC01, MC-DC02 | County IT | Phones, personal devices not permitted for health data |
| ColdSentry | Vaccine temperature monitoring | Vendor cloud | — | Darnell Okafor | Manual twice-daily readings |
| CountyNotify | Mass notification to staff, MRC volunteers and partners | Vendor cloud | — | Travis Lindqvist | Phone tree |
| MCHD website | Public information, exposure page, "What's true" panel | Hosted outside the county network | marstonhealth.example | Lena Abernathy | Partner websites |
| Environmental health permits (EnviroTrack) | Inspections, permits | County data center | MCHD-EH-APP01 | Gordon Pike | Paper inspection forms |

## SECTION 7: DATA FLOWS

1. Laboratories and hospitals → state surveillance system (ELR / eCR) → MCHD investigators' work queue.
2. Clinicians → MCHD Disease Reporting Line (phone) or Epi fax → MCHD-FAX01 → Epi shared mailbox.
3. MCHD clinics and PODs → ClinicTrack (MCHD-EHR-APP01 / MCHD-SQL02) → MCHD-INT01 nightly VXU file → state IIS.
4. Public → SlotWise booking page → appointment lists printed each morning for each clinic or POD.
5. Investigators → outbreak SharePoint line list → daily extract to KDHE by 15:00 during an outbreak.

## SECTION 8: NETWORKS AND ACCOUNTS

- All MCHD buildings are on the county wide-area network; there is no separate MCHD network. The district clinics connect by county-managed VPN over local broadband.
- Remote access: county VPN with multi-factor authentication (Microsoft Authenticator). Vendor access for Corvane Health uses a county jump host (MC-JUMP01), enabled per ticket.
- Service accounts: svc-iisexport (MCHD-INT01 to the state SFTP), svc-ctsql (ClinicTrack database). Their passwords are held by County IT.
- Backups: nightly to the county backup appliance, weekly copy to immutable cloud storage. ClinicTrack database restore tested 11/2025 (6 hours).
- Monitoring: Bluestem Managed Security runs the county's endpoint detection and SIEM 24/7.

## SECTION 9: PARTNERS

| Partner | Role in an outbreak |
|---|---|
| KDHE Bureau of Epidemiology and Public Health Informatics | Investigation support, case definitions, state surveillance and IIS |
| Kansas Health and Environmental Laboratories | Measles PCR and serology |
| Marston County Emergency Management | County EOC, ESF-8 seat, resource requests |
| Marston Regional Medical Center; St. Brigid Hospital | Case reports, isolation, exposure notification at their sites |
| Ellery, Brandt, Coyle and Prairie school districts; private schools | Immunization records, exclusion lists, parent messages |
| Prairie Bend Healthcare Coalition | Hospital and clinic coordination |
| Marston County Medical Reserve Corps | Vaccinators, call-center volunteers, POD staff |
| American Red Cross, Kansas region | Support for quarantined households |
