# Domain dossier: `telecom` (NEW)

Regional telecommunications carrier / ISP / cable operator: wireline (ILEC/CLEC), wireless (mobile network operator or regional MNO), broadband (fiber, DOCSIS cable, fixed wireless), interconnected VoIP, and covered 911 service provider (selective routing, ALI, ESInet/NGCS). Researched 2026-10-24. Regulation text checked against eCFR (point-in-time 2026-10-01) through the eCFR versioner API; Federal Register documents checked through the FR API.

---

## 1. Scope

**Covers:** a regional or mid-size communications service provider that owns facilities in a defined footprint (a few states or a metro area):

- Incumbent or competitive local exchange carrier (ILEC/CLEC), rural telco / telephone cooperative
- Regional mobile network operator (4G LTE / 5G NSA and SA), MVNO with own core, neutral-host / tower operator in a supporting role
- Cable multiple-system operator (MSO): hybrid fiber-coax (HFC), DOCSIS broadband, cable voice, video headends
- Fiber-to-the-home ISP, municipal broadband utility, fixed-wireless ISP (WISP)
- Interconnected VoIP provider
- Covered 911 service provider: legacy E911 selective router / ALI database operator, NG911 ESInet and NGCS operator (47 CFR 9.19(a)(4))
- Regional IP transit / backbone provider, Internet exchange point operator, colocation / carrier hotel operator (supporting)

**Aliases users might type:** telecom, telco, carrier, phone company, ISP, internet provider, broadband, cable company, cable operator, MSO, wireless carrier, mobile operator, MNO, cellular, cell provider, fiber provider, FTTH, WISP, VoIP provider, LEC, ILEC, CLEC, RLEC, telephone cooperative, 911 service provider, ESInet provider, NG911, backbone, transit provider, data center / colo (partial), communications provider.

**CISA critical infrastructure sector:** Communications Sector (primary). Strong dependencies with Information Technology (cloud, DNS, software), Energy (commercial power, generator fuel), Emergency Services (PSAPs, 911), and Government Facilities (NS/EP users).

**Sector Risk Management Agency:** DHS / CISA. CISA's Communications Sector page states "The Department of Homeland Security is designated as the Sector Risk Management Agency for the Communications Sector"; NSM-22 (April 2024) assigns the Communications SRMA role to CISA. Primary regulator is the **FCC** (Public Safety and Homeland Security Bureau for outage/911/DIRS; Enforcement Bureau and Wireline Competition Bureau for CPNI/privacy). State public utility commissions (PUCs) and state 911 boards regulate intrastate service and often have their own outage reporting rules.

---

## 2. Organization and roles (who sits at the table)

| #   | Title                                                                                               | Abbrev    | Team                               | What they decide                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | --------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Chief Operating Officer / SVP Network Operations (Incident Commander / Crisis Management Team lead) | COO       | Executive / Crisis Management Team | Declares a major incident, approves service-affecting actions (isolating the core, taking a route down), approves the public statement, authorizes spend (generators, mutual aid) |
| 2   | Director, Network Operations Center                                                                 | NOC Dir   | Network Operations                 | Owns the NOC alarm picture, outage classification, restoration priority (TSP circuits first), change freezes, NORS clock start ("discovery")                                      |
| 3   | Chief Information Security Officer                                                                  | CISO      | Security                           | Owns the cyber investigation, SOC, containment of compromised routers/OSS, FBI/CISA engagement, threat-hunt scope                                                                 |
| 4   | Director, Core / IP Network Engineering                                                             | Core Eng  | Network Engineering                | Owns routing (BGP, MPLS), mobile core (EPC/5GC), IMS/voice core; decides to filter, de-peer, roll back configs, re-route                                                          |
| 5   | Director, Field Operations / Outside Plant (OSP)                                                    | Field Ops | Field Operations                   | Owns fiber splicing crews, cell-site techs, generator deployment and fueling, COWs/COLTs, locate (811) and right-of-way access                                                    |
| 6   | 911 / Public Safety Services Manager                                                                | 911 Mgr   | Public Safety Services             | Owns PSAP relationships, the 30-minute 911 special facility notification (47 CFR 4.9(h)), ALI/selective-router health, ESInet/NGCS status                                         |
| 7   | Regulatory Compliance Director (FCC/PUC liaison)                                                    | Reg       | Legal & Regulatory                 | Files NORS notification/initial/final reports, DIRS daily reports, state PUC outage reports; decides reportability                                                                |
| 8   | General Counsel / Privacy Officer (CPNI)                                                            | GC        | Legal & Regulatory                 | CPNI breach determination and the 7-business-day USSS/FBI clock (47 CFR 64.2011), law-enforcement delay requests, SEC 8-K materiality if public, CALEA/lawful-intercept matters   |
| 9   | Senior Officer for CALEA / Legal Demands (Subpoena Compliance)                                      | LECC      | Legal & Regulatory                 | Owns lawful-intercept systems and the legal-demand/emergency disclosure request desk; reports compromise of lawful intercept to affected LEAs (47 CFR 1.20003(c))                 |
| 10  | VP Customer Care / Contact Center                                                                   | Care      | Customer Operations                | Owns IVR outage messages, call surge/TDoS handling, retail store and care-agent controls (SIM change, port-out), customer credits                                                 |
| 11  | Director, Corporate Communications (PIO)                                                            | PIO       | Communications                     | Owns press, social media, outage-map messaging, statements to elected officials                                                                                                   |
| 12  | Business Continuity / Emergency Management Manager                                                  | BCM       | Business Continuity                | Owns the EOC / emergency operations plan, liaison to county/state EOC and ESF-2, DIRS activation awareness, NS/EP coordination                                                    |
| 13  | Director, Enterprise & Government Accounts                                                          | Ent       | Sales / Enterprise                 | Owns large enterprise, hospital, utility and government customer notifications and SLAs; TSP-enrolled customers                                                                   |
| 14  | Facilities / Power Engineering Manager                                                              | Power     | Network Engineering                | Owns central office and MTSO/data center power (rectifiers, batteries, generators, fuel contracts), HVAC; 24h/72h backup power for 911 offices (47 CFR 9.19(c)(2))                |

Minimum table for a 5-role default: COO (IC), NOC Director, CISO, 911 / Regulatory (combined), PIO.

---

## 3. Systems

### IT / business systems (BSS and enterprise IT)

- Billing and customer care (BSS): billing, CRM, account management, order management (e.g., Amdocs, Netcracker, CSG as examples)
- Retail point-of-sale and care-agent desktop (SIM change, eSIM provisioning, port-out authorization)
- Number portability systems / LNP gateway (NPAC interface)
- Customer self-service portal and mobile app; outage map / status page
- Email, collaboration, identity (AD / SSO / MFA), VPN, privileged access management
- SIEM / SOC tooling, EDR, NetFlow/IPFIX collectors, DDoS detection and scrubbing (e.g., on-net scrubbing or a scrubbing service)
- ITSM / trouble ticketing (customer trouble tickets, network tickets)
- Lawful-intercept / CALEA mediation and legal-demand case management (high-sensitivity enclave)
- Data warehouse with CPNI (call detail records, location history)
- Corporate website, IVR / contact-center platform (ACD), outbound notification (SMS/email blast)

### OT / network systems (the "OT" of a carrier is the network itself)

- OSS / NMS / EMS: fault management (alarm console), performance management, inventory (circuit and fiber records), provisioning / activation
- NOC video wall and alarm correlation; element managers per vendor (optical, RAN, core)
- IP/MPLS core and edge routers (backbone "P", provider edge "PE", customer edge "CE"), route reflectors, BGP peering/transit edge, RPKI validators
- Optical transport: DWDM, ROADMs, SONET legacy rings, metro Ethernet
- Mobile core: EPC (MME, SGW/PGW, HSS) and 5G core (AMF, SMF, UPF, UDM/AUSF), SMSC, diameter/SS7 signaling (STPs, DEA/DRA), signaling firewall
- RAN: eNodeB/gNodeB at cell sites, baseband units, C-RAN hubs, microwave backhaul; cell sites with batteries and generators
- Voice: IMS core, class 5 / softswitch, SBCs, TDM tandems (legacy), SIP trunks
- Cable access: CMTS / vCMTS, headend and hubs, fiber nodes, DOCSIS provisioning (DHCP, TFTP, config files), video headend and set-top systems
- Fiber access: OLTs, ONTs (customer premises), PON splitters
- Customer premises equipment (CPE) fleet management: TR-069 / ACS, router firmware push
- DNS (recursive resolvers for subscribers, authoritative), DHCP, AAA/RADIUS
- 911: selective routers / E911 tandems, ALI database, ESInet, NGCS (ECRF, ESRP, LVF), legacy network gateway (LNG), location information server (LIS), PSAP trunks
- Timing and sync: GPS/GNSS-disciplined grandmasters, PTP/SyncE (GPS jamming/spoofing exposure)
- Facilities: central office power plants (rectifiers, battery strings, standby generators, fuel tanks), HVAC, fire suppression, building access control (PACS) and CCTV at COs, MTSOs, headends, data centers; cell-site alarm units (door, power, tower light per FAA)

### Identifiers documents state (candidate fact categories)

| id                | Label                             | Shape / example                                                                                      | Lint?          |
| ----------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| `central_offices` | Central offices / switches (CLLI) | 11-char CLLI, e.g. `SPFDMOXA01T`; or "the Riverside Central Office"                                  | yes, complete  |
| `cell_sites`      | Cell sites                        | "Site 4417", "Cell Site RV-112", eNB/gNB IDs                                                         | yes            |
| `routes`          | Fiber routes / rings / spans      | "Ring 3", "Route 12", "Span RVSD–NORT", cable IDs "CBL-0442"                                         | yes            |
| `hubs`            | Headends / hubs / nodes (cable)   | "Hub 7", "Node 3B-14", "Headend North"                                                               | yes            |
| `psaps`           | PSAPs served                      | "Lake County 911", "PSAP 14" (names the documents list)                                              | yes, complete  |
| `asns`            | Autonomous system numbers         | pattern `\b(AS\d{1,10})\b` (use private-use/documentation ASNs 64496–64511, 65536–65551 in examples) | yes            |
| `prefixes`        | IP prefixes                       | CIDR, e.g. `198.51.100.0/24` (documentation ranges)                                                  | no (too noisy) |
| `data_centers`    | Data centers / POPs / MTSOs       | "POP DEN1", "MTSO East"                                                                              | yes            |
| `counties`        | Counties / service areas          | names (DIRS reports are county-based)                                                                | no             |
| `circuits`        | Circuit IDs / TSP codes           | carrier circuit IDs; TSP authorization codes                                                         | no             |

---

## 4. Outside parties and media

**Federal**

- FCC Public Safety and Homeland Security Bureau (NORS, DIRS, 911 reliability); FCC Operations Center (24/7); FCC Enforcement Bureau
- CISA: National Coordinating Center for Communications (NCC) / Communications ISAC; CISA Central; CISA regional Emergency Communications Coordinators; Priority Telecommunications Services Center (GETS/WPS/TSP)
- FBI field office (Cyber squad) and IC3; U.S. Secret Service (CPNI breach reporting, financial fraud / SIM swap)
- FEMA (ESF #2 Communications, co-led with CISA/NCC), FEMA Regional Response Coordination Center
- NTIA / FirstNet Authority (if the carrier hosts or roams FirstNet-like public safety traffic) — role varies
- FAA (tower obstruction lighting outages; airport links per 47 CFR 4.5(c))
- DOJ / Team Telecom (if the carrier operates under a national-security mitigation agreement) — varies
- SEC (Form 8-K Item 1.05 for public companies, 4 business days after materiality determination)
- NSA Cybersecurity Collaboration Center (large carriers; advisory partner)

**State / local**

- State public utility commission (intrastate outage reporting, service quality)
- State 911 board / 911 authority, county 911 coordinators, PSAP directors
- State and county emergency management agencies and EOCs (ESF-2 desks)
- State fusion center; state attorney general (data breach notification under state law)
- Local law enforcement (fiber vandalism, copper theft, cell-site break-ins); utility locate center (811)
- Electric utility (commercial power restoration priority for COs and cell sites)

**Industry / mutual aid**

- Other carriers (roaming under disaster arrangements and mutual aid per 47 CFR 4.17 MDRI), wholesale/transport partners, interconnecting carriers and IXCs
- Tower companies (site access, generators), fiber construction contractors, generator fuel vendors
- Equipment vendors' TAC (router, RAN, core, CMTS vendors), DDoS mitigation provider, incident response retainer firm, cyber insurer
- Peering partners, IXPs, upstream transit providers, RIR (ARIN) for RPKI/ROA issues
- NCC / Comm-ISAC; industry associations (state telecom association, NTCA/WISPA-type member groups — as context only)

**Media channels**

- Local TV assignment desk and live shot outside a central office
- Outage-tracking site posts and spikes ("is it down?" type crowdsourced trackers)
- Neighborhood Facebook groups and Nextdoor ("is anyone else's internet out?")
- Reddit posts in the local city subreddit and the carrier's own customer subreddit
- X/Twitter replies to the carrier's support handle; TikTok of a burned/cut fiber vault
- Trade press reporter (telecom trade publication) asking about a nation-state compromise
- County emergency management social posts ("911 may be unavailable — use text to 911 / call the 10-digit line")

---

## 5. Regulatory drivers and plans

| Plan / obligation                                                               | Legal basis                                                                                                                        | What it contains                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Network outage reporting procedures (NORS)**                                  | 47 CFR Part 4 (§§4.5, 4.7, 4.9, 4.11)                                                                                              | Reportability thresholds, who determines "discovery", Notification → Initial → Final workflow, attestation by an officer for the Final report (§4.11)                                                                                                                                                                 |
| **911 special facility (PSAP) outage notification procedures and contact list** | 47 CFR 4.9(h)                                                                                                                      | Annually confirmed PSAP contact list ("special diligence"); notification by phone **and** in writing; 10 material-information elements                                                                                                                                                                                |
| **988 special facility notification procedures**                                | 47 CFR 4.9(i), 4.5(f)                                                                                                              | Same structure for the 988 Lifeline                                                                                                                                                                                                                                                                                   |
| **911 reliability (covered 911 service providers)**                             | 47 CFR 9.19, 9.20 (amended 91 FR 1403, Jan 14, 2026; 91 FR 42841, July 10, 2026)                                                   | Physical diversity of 911 circuits/paths (diversity audits, tagging), operational integrity (24 h backup power for offices that directly serve a PSAP, 72 h for selective-router offices), diverse network monitoring; certification by a certifying official under penalty of perjury; NG911 interoperability report |
| **DIRS reporting procedures**                                                   | 47 CFR 4.18 (mandatory since 89 FR 25542, Apr 11, 2024; compliance date set by PSHSB DA 25-74; amended 2025 and 2026)              | Daily infrastructure status reports while DIRS is activated (even when unchanged); NORS suspension in DIRS areas if timely reported in DIRS; FCC 26-34 (2026) eliminated the DIRS final report                                                                                                                        |
| **Mandatory Disaster Response Initiative (wireless)**                           | 47 CFR 4.17                                                                                                                        | Roaming under disaster arrangements, mutual aid agreements, municipal preparedness, consumer readiness, public awareness; annual bilateral roaming tests; post-disaster reports within 60 days of a PSHSB Public Notice                                                                                               |
| **CPNI protection program and breach response plan**                            | 47 U.S.C. 222; 47 CFR 64.2009–64.2011                                                                                              | Authentication, employee training, annual officer compliance certificate filed by March 1 (EB Docket 06-36), breach notification workflow and 2-year breach records                                                                                                                                                   |
| **SIM change / port-out fraud controls**                                        | 47 CFR 64.2010(h) (adopted Dec 2023, 88 FR 85814); 47 CFR 52.37 port-out provisions (not checked)                                  | Secure authentication before SIM change, employee training on SIM swap fraud; eCFR shows compliance "not required until this paragraph... contains a compliance date"                                                                                                                                                 |
| **CALEA System Security and Integrity (SSI) plan**                              | 47 U.S.C. 1004; 47 CFR 1.20003–1.20005                                                                                             | Senior officer responsible for lawful intercept, authorization policies, record retention, 24/7 LEA contact, reporting compromise of intercept to affected LEAs; filed with FCC via CEFS                                                                                                                              |
| **Emergency operations / business continuity plan**                             | Industry practice (CSRIC best practices, ISO 22301 — not bundled); state PUC rules vary                                            | EOC activation, generator and fuel plans, CO/cell-site priorities, mutual aid, ESF-2 liaison, NS/EP restoration priority                                                                                                                                                                                              |
| **TSP restoration priority procedures**                                         | 47 CFR Part 64 Appendix A (TSP rules; not checked in this pass)                                                                    | Provision/restore TSP-coded circuits by priority level before others                                                                                                                                                                                                                                                  |
| **Cybersecurity incident response plan**                                        | Voluntary (NIST CSF; CSRIC IV WG4 sector implementation of the CSF); CIRCIA once final; state laws; SEC rules for public companies | Detection, containment, evidence, notification matrix (FCC, FBI/USSS, CISA, PUC, AG, customers)                                                                                                                                                                                                                       |
| **CIRCIA covered-entity reporting**                                             | 6 U.S.C. 681b (CIRCIA 2022); proposed rule 89 FR 23644 (Apr 4, 2024)                                                               | 72 h covered cyber incident, 24 h ransom payment — final rule not published as of 2026-10-24 (secondary reporting: sent to OMB Oct 1, 2026; unverified)                                                                                                                                                               |

---

## 6. Common operational workflows (with clocks)

**A. Outage reportability (FCC NORS) — verified against eCFR 2026-10-01**

- Threshold for wireline, wireless, cable: outage of **at least 30 minutes** that potentially affects **at least 900,000 user minutes** of telephony (wireless: telephony and associated 2G-or-lower data, or paging), or **667 OC3 minutes**, or special offices and facilities (TSP Level 1–2 enrollees, incl. primary NPIAS airports, §4.5(b)), or a 911 special facility (§4.9(a), (e), (f)). Wireless also: any MSC outage ≥30 min. Wireless user count = disabled macro sites × average users per site (§4.9(e)(2)).
- IXC/LEC tandem: ≥30 min with ≥90,000 blocked calls or ≥667 OC3-minutes (§4.9(b)). SS7: ≥90,000 blocked calls real-time or ≥30,000 lost calls historic (§4.9(d)).
- **Notification within 120 minutes** of discovering the outage; **Initial Communications Outage Report within 72 hours**; **Final report within 30 days** (§4.9(a), (e)(4), (f)).
- Interconnected VoIP: Notification **within 240 minutes** if a 911 or 988 special facility is affected; **within 24 hours** for ≥900,000 user-minutes with complete loss of service or special offices; Final report within 30 days; no Initial report stage (§4.9(g)).
- Notification content (§4.11): reporting entity, onset date/time, brief description, service effects, geographic area, contact name and phone. Final report attested by a person authorized to legally bind the provider. Fallback by e-mail/fax if NORS is unreachable.
- NORS filings are presumed confidential (FCC NORS page, per search summary).

**B. 911 special facility (PSAP) notification — 47 CFR 4.9(h), 4.5(e)**

- 911 outage triggers (§4.5(e)): loss of communications to PSAP(s) ≥900,000 user-minutes, ≥30 min, no reroute, failure not at the PSAP; loss of 911 call processing in an E911 tandem/selective router ≥30 min; end office/MSC isolated from 911 ≥30 min and ≥900,000 user-minutes; loss of ANI/ALI or location determination ≥30 min and ≥900,000 user-minutes.
- Initial PSAP notification **as soon as possible, no later than 30 minutes** after discovery; by telephone **and** in writing electronically.
- First follow-up **no later than two hours** after initial contact (cable, satellite, wireless, wireline, VoIP), then as material information becomes available until restoration.
- Ten material elements: unique outage identifier; provider contact name/phone/email; provider name; start date/time with time zone; services affected; geographic area; expected effect on the PSAP (e.g., dropped calls, missing metadata); estimated restoration date/time with time zone; best-known cause; whether initial / update / final.
- Same structure for the 988 Lifeline (§4.9(i)).

**C. Disaster: DIRS / MDRI / ESF-2**

- FCC activates DIRS by Public Notice for specific counties; facilities-based cable, wireline, wireless and interconnected VoIP providers file **daily** status reports from activation until deactivation, even if unchanged (§4.18(a)). Outages in a DIRS area are excused from NORS if timely reported in DIRS and the first DIRS report is due before the NORS filing would be (§4.18(b)). DIRS final report eliminated by FCC 26-34 (2026).
- MDRI (§4.17): triggered by ESF-2 activation, DIRS activation, or PSHSB Public Notice at a state's request — roaming under disaster arrangements, mutual aid, public awareness of restoration status.
- State/county EOC ESF-2 desk; FEMA/CISA ESF #2 (NCC); NS/EP priority: TSP restoration order, GETS/WPS users.

**D. CPNI breach — 47 CFR 64.2011 (in-force text per eCFR 2026-10-01)**

- Notify USSS and FBI through the central reporting facility **as soon as practicable, and no later than 7 business days** after reasonable determination of the breach.
- Do not notify customers or the public until **7 full business days** after notifying USSS/FBI, unless "extraordinarily urgent" need (after consultation with the investigating agency); the agency may direct a delay of up to 30 days, extendable.
- Keep breach records **2 years**.
- **Pending amendment** (Data Breach Reporting Requirements, FCC 23-111, 89 FR 9968, Feb 12, 2024): adds notification to the **FCC** alongside USSS/FBI within 7 business days; covers CPNI **and PII** ("covered data"), includes inadvertent breaches; exemption for breaches of fewer than 500 customers with no reasonably likely harm (annual summary due Feb 1); customer notice without unreasonable delay and no later than **30 days** after reasonable determination. The FR notice says the §64.2011 amendments are "delayed indefinitely" pending an effective-date notice; the Sixth Circuit upheld the order (Ohio Telecom Ass'n v. FCC, No. 24-3133, Aug 2025, per secondary summaries). eCFR still shows the old text as of 2026-10-01. Designers should state which version the exercise assumes.
- State breach laws (AG and resident notice) and SEC 8-K Item 1.05 (public companies) run in parallel.

**E. Lawful intercept compromise (CALEA)** — report "any act of compromise of a lawful interception... to unauthorized persons or entities" and any unlawful electronic surveillance on its premises to affected law enforcement agencies "within a reasonable time upon discovery" (47 CFR 1.20003(c)). Note: the FCC's January 2025 declaratory ruling reading CALEA §105 as a general cybersecurity duty was rescinded in November 2025 (FCC fact sheet DOC-415190A1; press coverage).

**F. Cyber incident (general)** — SOC triage → CISO → incident declared → FBI field office and CISA (voluntary today; CIRCIA 72 h / 24 h ransom once final) → NCC/Comm-ISAC sharing → if service-affecting, NORS clock runs from discovery of the outage, not of the cause.

**G. Fiber cut / physical attack** — NOC alarms (LOS on spans) → OTDR shot to locate distance-to-fault → dispatch OSP splicing crew → law enforcement if vandalism/theft → reroute on protected rings → TSP circuit restoration order → NORS if thresholds met → PSAP notification if 911 trunks or ALI links affected.

**H. Forms used**

- FCC NORS Notification / Initial / Final templates (web forms)
- FCC DIRS daily status form (county-level cell sites, wireline/cable subscribers out, CO status)
- PSAP outage notification (phone script + written email)
- USSS/FBI CPNI central reporting facility submission
- TSP restoration request / TSP authorization code
- ICS 201 (incident briefing), ICS 202 (objectives), ICS 205 (radio plan — critical when the carrier's own network is down), ICS 205A (communications list), ICS 213 (general message), ICS 214 (activity log), ICS 215 (operational planning — crews, generators), ICS 209 (status summary for the county EOC)
- Internal: Major Incident Report / bridge log, change-freeze notice, customer credit authorization

---

## 7. Exercise scenarios (seeds)

1. **Cyber (state-sponsored, espionage):** A partner agency notifies the carrier that its provider-edge routers show signs of long-term access by a PRC-linked actor that modified ACLs and enabled packet capture; the actor may have touched the lawful-intercept environment. Pattern: CISA/FBI joint statement Nov 2024; joint guidance Dec 2024; AA25-239A (Aug 2025).
2. **Cyber / infrastructure failure (botched change):** A core network configuration change pushed without peer review takes down wireless voice and data across the footprint for 10+ hours; tens of thousands of 911 calls fail. Pattern: FCC PSHSB "February 22, 2024 ... Mobility Network Outage Report and Findings" (July 2024); March 2017 VoLTE 911 outage report.
3. **Cyber (destructive, CPE):** Malware pushed through the CPE management path bricks hundreds of thousands of customer routers / ONTs overnight; truck rolls and device replacement become the bottleneck. Pattern: 2022 satellite modem wiper (AcidRain) and the 2023 rural ISP router-bricking event publicly reported by Lumen Black Lotus Labs (May 2024) — cite as public reporting, not bundled.
4. **Cyber (BGP):** The carrier's customer prefixes, including a county government's and a PSAP's ESInet edge, are hijacked by a more-specific announcement from a distant AS; RPKI ROAs were never published. Pattern: NIST SP 800-189; public BGP hijack history (2008 video-site hijack, 2018 DNS-provider route hijack).
5. **Insider / fraud (SIM swap):** A retail store employee is paid to execute SIM changes and port-outs against local officials and cryptocurrency holders; one victim is a county emergency manager. Pattern: FBI IC3 PSA 220208 (Feb 2022); FCC SIM-swap rules (Dec 2023).
6. **Cyber / fraud (fraudulent emergency data request):** A compromised police-department email account sends exigent emergency disclosure requests for subscriber location and call records; legal desk must judge authenticity under time pressure. Pattern: FBI PIN 20241104-001 (Nov 2024).
7. **Physical security (coordinated fiber vandalism):** Overnight cuts of multiple long-haul and metro fiber routes at manholes isolate two COs, including the one hosting the selective router; 911 calls reroute but ALI is lost. Pattern: public reports of coordinated fiber vandalism; FCC 911 reliability rules on diversity.
8. **Physical / infrastructure failure (CO bombing or fire):** A vehicle bomb or fire next to a downtown central office knocks out commercial power; batteries and generators fail as water reaches the power room; wireless, wireline and 911 in several counties go down. Pattern: Nashville Dec 25, 2020 bombing (public NTSB/FBI/FCC accounts; not bundled).
9. **Natural hazard (hurricane / wildfire):** A hurricane takes down hundreds of cell sites and the commercial power grid; DIRS activates for 30 counties; generator fuel, roaming under disaster arrangements and DIRS daily reports dominate. Pattern: 47 CFR 4.17/4.18; FCC DIRS status reports for 2017–2024 hurricanes.
10. **Mass gathering / cyber (TDoS + DDoS):** During a regional championship event the carrier's DNS and web portal are hit with a multi-terabit DDoS while a TDoS floods the care center and a PSAP's admin lines; outage-tracker sites and local media amplify. Pattern: CISA Communications CTEP Situation Manual (Feb 2024) Module 2 (DDoS followed by inadvertent TDoS).
11. **UAS (optional):** A drone is repeatedly seen hovering at a hub site and a tower compound; a GPS jamming episode disrupts timing at cell sites near an airport. Pattern: public GNSS interference advisories (not bundled). Weakest grounding of the set.
12. **Ransomware (BSS):** Ransomware encrypts billing, care and provisioning; the network keeps carrying traffic but no one can activate, port or restore service, and CPNI exfiltration triggers the breach clock. Pattern: CISA #StopRansomware advisories; CI Fortify Isolation & Recovery CTEP (Sept 2026), vignette 1 (state-sponsored telecom compromise).

---

## 8. Inject templates

**Existing templates that already fit (from templates/injects/):** `siem_alert`, `system_log`, `console_dump` (router CLI `show` output), `network_diagram`, `helpdesk_ticket` (customer trouble ticket), `status_board` (NOC wall summary), `incident_alert_notification`, `email`, `email_forward`, `email_header_analysis` (phishing), `chat_transcript` (NOC bridge), `phone_call`, `voicemail`, `text_message` (customer SMS blast), `911_cad_entry` (PSAP side), `regulatory_notice` (FCC/PUC letter), `official_letter`, `memo`, `press_release`, `news_article`, `news_chyron_still`, `reporter_email`, `media_inquiry_phone_slip`, `tweet`, `facebook_post`, `reddit_post`, `tiktok_video_card`, `field_report` (OSP crew), `scene_photo` (cut fiber vault), `cctv_still`, `pacs_alarm_panel` (CO door alarms), `map_annotation` (fiber route / outage area), `ransom_note`, `sitrep`, `ics_201_prefill`, `ics_203_prefill`, `scenario_update`, `startex_card`, `endex_card`, `time_jump_card`, `simcell_script`, `uas_detection_alert`, `error_dialog`, `screenshot_generic`.

**New templates proposed:**

| Template id                | What players see                                                           | Fields                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noc_alarm_console`        | NMS/OSS fault-management alarm list                                        | timestamp (UTC/local), severity (Critical/Major/Minor/Warning), network element (CLLI / site ID / router hostname), alarm type (LOS, LOF, AIS, BGP session down, power fail, door open, high temp), facility (ring/span/port), affected services count, correlated parent alarm, ack status / ack by, ticket number                                                                                           |
| `nors_notification`        | FCC NORS Notification (or Initial/Final) form view                         | filing stage (Notification/Initial/Final), reporting entity, outage type (wireline/wireless/cable/VoIP/SS7), date-time of onset + time zone, date-time discovered, brief description, service effects, geographic area (states/counties/cities), estimated user-minutes, 911 special facility affected (Y/N), PSAPs affected, special offices affected, contact name and phone, NORS reference number, status |
| `psap_outage_notification` | Written 911 outage notice to a PSAP (§4.9(h))                              | the ten material elements: outage ID, provider contact (name/phone/email), provider name, start date/time + TZ, services affected, geographic area, expected PSAP impact (e.g., calls not delivered / ANI-ALI missing / reroute to backup PSAP), ETR + TZ, best-known cause, notice type (initial/update/final); plus sent-at timestamp and phone-call confirmation line                                      |
| `dirs_status_report`       | DIRS daily county table                                                    | report date/time, activation name, county, cell sites served / out, out-by-cause (damage, transport, power), sites on generator, wireline/cable subscribers out, COs/headends on generator or down, fuel status, ETR; "no change" flag                                                                                                                                                                        |
| `bgp_route_alert`          | Route-monitoring alert / looking-glass output                              | prefix, expected origin AS, observed origin AS, AS path, more-specific Y/N, RPKI validity (valid/invalid/not-found), collectors/peers seeing it, first seen, last seen, affected customers (from inventory)                                                                                                                                                                                                   |
| `outage_status_page`       | Carrier's public service-status page / outage map card                     | region/ZIP list, services affected (internet, TV, voice, mobile, 911 note), customers affected (est.), cause wording, ETR, last updated, "text 911 if you can't call" advisory line                                                                                                                                                                                                                           |
| `sim_change_log`           | Account activity log in care/retail system                                 | account/MSISDN (masked), event (SIM change, eSIM transfer, port-out request, password reset, address change), channel (store ID / care agent ID / app), authentication method used, old/new ICCID or IMEI (masked), timestamp, fraud score / flags, approving supervisor                                                                                                                                      |
| `legal_demand_request`     | Law-enforcement emergency disclosure request (EDR) / exigent request form  | requesting agency, officer name/badge, sending email address, case number, target identifier (phone/account), data requested (location, CDRs, subscriber info), emergency justification text, signature block, callback number; desk verification checklist (callback to agency main line, domain check)                                                                                                      |
| `osp_dispatch_ticket`      | Outside-plant dispatch / work order for a fiber cut                        | ticket #, priority, cable ID / route, fiber count, span (A-end CO / Z-end CO), OTDR distance-to-fault, nearest manhole/handhole, 811 locate ticket, crew assigned, ETA on site, splice ETA, TSP circuits on the cable, law-enforcement report #                                                                                                                                                               |
| `tsp_restoration_list`     | TSP / priority restoration worksheet                                       | TSP authorization code (masked), priority level (1–5), customer (hospital, PSAP, utility — simulated names), circuit ID, location, status (down/restored), restore time                                                                                                                                                                                                                                       |
| `cpni_breach_report`       | Central reporting facility submission (USSS/FBI, + FCC under amended rule) | carrier name/address/contact, description of breach, method of compromise, date range, approximate customers affected, estimated financial loss, data types, determination date, business-day clock (day N of 7), LE delay request field                                                                                                                                                                      |

---

## 9. Public-domain documents to bundle

Sizes from `curl -sIL` Content-Length (or GET size where HEAD is refused), checked 2026-10-24.

| #   | Exact title                                                                                                                                        | Publisher                                      | Edition / date                                   | Landing page                                                                                                            | Direct file URL                                                                                                                         | Type / size                  | Public-domain basis / notes                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Communications Sector-Specific Plan: An Annex to the NIPP 2013                                                                                     | DHS (now CISA)                                 | 2015                                             | https://www.cisa.gov/resources-tools/resources/communications-sector-specific-plan-2015                                 | https://www.cisa.gov/sites/default/files/publications/nipp-ssp-communications-2015-508.pdf                                              | PDF, 3,193,339 B (40 pp)     | 17 U.S.C. §105 federal work; no copyright notice found in text. Oldest edition but still the current SSP CISA lists                                                                                                                                                                               |
| 2   | Communications Sector Risk Management Agency Fact Sheet                                                                                            | CISA                                           | Aug 5, 2021                                      | https://www.cisa.gov/resources-tools/resources/communications-sector-risk-management-agency-fact-sheet                  | https://www.cisa.gov/sites/default/files/publications/Communications%2520SRMA%2520Fact%2520Sheet_508.pdf                                | PDF, 528,006 B (2 pp)        | §105 federal work                                                                                                                                                                                                                                                                                 |
| 3   | Communications Cybersecurity Tabletop Exercise Package (CTEP) Situation Manual                                                                     | CISA                                           | Feb 2024 (posted Jan 2025)                       | https://www.cisa.gov/resources-tools/resources/cybersecurity-scenarios                                                  | https://www.cisa.gov/sites/default/files/2025-01/Communications-CTEP-Situation-Manual-022024-508.docx                                   | DOCX, 6,168,969 B            | Federal work, TLP:CLEAR template, no copyright notice; contractor-prepared; one cover photo of unknown provenance (coordinator note) — strip or replace the cover image when bundling. Scenario: phishing → DDoS → inadvertent TDoS against a "<broadband provider>"                              |
| 4   | CISA Tabletop Exercise Package: Isolation and Recovery (CI Fortify)                                                                                | CISA                                           | Sept 2026                                        | https://www.cisa.gov/ci-fortify (listed on https://www.cisa.gov/resources-tools/resources/cybersecurity-scenarios)      | https://www.cisa.gov/sites/default/files/2026-09/CISA_Tabletop_Exercise_Package_Isolation_and_Recovery_CI_Fortify.docx                  | DOCX, 4,470,624 B            | Federal work, TLP:CLEAR by default (coordinator-verified); vignette 1 is a state-sponsored telecom compromise                                                                                                                                                                                     |
| 5   | February 22, 2024 AT&T Mobility Network Outage: Report and Findings                                                                                | FCC Public Safety and Homeland Security Bureau | July 22, 2024                                    | (fcc.gov blocks scripted checks; report linked from FCC news release, July 2024)                                        | https://docs.fcc.gov/public/attachments/DOC-404150A1.pdf                                                                                | PDF, 149,926 B (10 pp)       | §105 federal work (FCC staff report). Names a real carrier — use as reference on change-management failure, 911 impact and notification gaps, not as a seed                                                                                                                                       |
| 6   | NIST SP 800-189, Resilient Interdomain Traffic Exchange: BGP Security and DDoS Mitigation                                                          | NIST                                           | Dec 2019 (final)                                 | https://csrc.nist.gov/pubs/sp/800/189/final                                                                             | https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-189.pdf                                                               | PDF, 2,513,662 B (81 pp)     | "not subject to copyright in the United States" (NIST notice). One section notes text parallels an IETF RFC (IETF rule: authors retain copyright) — minor caveat. Rev. 1 is still an initial public draft (Jan 2025)                                                                              |
| 7   | Priority Telecommunications Services (GETS, WPS, TSP) fact sheet                                                                                   | CISA                                           | Feb 2022 (file dated Jan 2023)                   | https://www.cisa.gov/resources-tools/resources/priority-telecommunications-services-fact-sheet                          | https://www.cisa.gov/sites/default/files/2023-01/pts-fact-sheet-022022-508.pdf                                                          | PDF, 345,470 B (1 p)         | §105 federal work                                                                                                                                                                                                                                                                                 |
| 8   | CSRIC Best Practices (dataset export)                                                                                                              | FCC (FCC Open Data)                            | rows updated Dec 2022 (rowsUpdatedAt 1670437258) | https://opendata.fcc.gov/Public-Safety/CSRIC-Best-Practices/qb45-rw2t                                                   | https://opendata.fcc.gov/api/views/qb45-rw2t/rows.csv?accessType=DOWNLOAD                                                               | CSV, 688,878 B (~1,448 rows) | Dataset metadata license: "Public Domain U.S. Government" (USGOV_WORKS). Text was drafted by CSRIC (federal advisory committee) members; FCC publishes it as public domain. Includes retired practices (marked "Retired")                                                                         |
| 9   | Enhanced Visibility and Hardening Guidance for Communications Infrastructure                                                                       | CISA, NSA, FBI with ASD's ACSC, CCCS, NCSC-NZ  | Dec 3, 2024                                      | https://www.cisa.gov/resources-tools/resources/enhanced-visibility-and-hardening-guidance-communications-infrastructure | https://www.cisa.gov/sites/default/files/2025-01/joint-guidance-enhanced-visibility-hardening-guide-for-comms-infrastructure-508c_0.pdf | PDF, 795,821 B (9 pp)        | **Caveat:** joint product; US agency contributions are §105, foreign co-sealers may hold Crown copyright; marked TLP:CLEAR "may be distributed without restriction... subject to standard copyright rules". Bundle with attribution, or move to useful links if the pack policy is US-only strict |
| 10  | Joint Cybersecurity Advisory AA25-239A: Countering Chinese State-Sponsored Actors Compromise of Networks Worldwide to Feed Global Espionage System | NSA, CISA, FBI and international partners      | Aug 27, 2025; Ver. 1.1 Sept 2025                 | https://www.cisa.gov/news-events/cybersecurity-advisories/aa25-239a                                                     | https://www.ic3.gov/CSA/2025/250827.pdf                                                                                                 | PDF, 1,262,302 B (38 pp)     | Same caveat as #9 (multinational co-authors; TLP:CLEAR, "subject to standard copyright rules"). cisa.gov page offers only HTML + STIX; ic3.gov (FBI) hosts the PDF                                                                                                                                |

**Total: 10 documents, 20,116,997 bytes (~20.1 MB).** Strict US-only subset (#1–#8): 8 documents, 18,058,874 bytes.

Also downloadable and public domain, held back to keep the pack to 10 (swap in if wanted):

- FCC PSHSB, _March 8th, 2017 AT&T VoLTE 911 Outage Report and Recommendations_, May 2017 — https://docs.fcc.gov/public/attachments/DOC-344941A1.pdf (PDF, 1,755,203 B, 22 pp)
- NIST SP 800-187, _Guide to LTE Security_, Dec 2017 — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-187.pdf (PDF, 1,109,359 B, 49 pp)
- CISA, _Mobile Communications Best Practice Guidance_, Dec 2024 — https://www.cisa.gov/sites/default/files/2024-12/guidance-mobile-communications-best-practices.pdf (PDF, 390,677 B; TLP:CLEAR)
- CISA, _Priority Services Eligibility_ sheet, Sept 2023 — https://www.cisa.gov/sites/default/files/2023-09/Priority%20Services%20Elgibility.pdf (PDF, 484,170 B)
- NIST SP 1800-33A (5G Cybersecurity, Executive Summary), **initial public draft**, Mar 2025 — https://www.nccoe.nist.gov/sites/default/files/2025-03/nist-sp-1800-33a-ipd.pdf (PDF, 2,822,297 B). Not final — prefer not to bundle a draft.
- NIST SP 800-189 Rev. 1 **initial public draft**, Jan 2025 — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-189r1.ipd.pdf (PDF, 3,406,221 B)
- FCC 26-34, DIRS Third Report and Order (2026) — https://docs.fcc.gov/public/attachments/FCC-26-34A1.pdf (PDF, 305,524 B)

---

## 10. Useful links (not bundled)

| Title                                                                                       | Publisher                    | URL                                                                                                                                          | Why not bundled                                                                                            |
| ------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 47 CFR Part 4 (§§4.5, 4.9, 4.11, 4.17, 4.18)                                                | eCFR / OFR                   | https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-4                                                                          | HTML regulation text (public domain, but cite live)                                                        |
| 47 CFR 9.19 / 9.20 911 reliability                                                          | eCFR                         | https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-9/subpart-H                                                                | HTML                                                                                                       |
| 47 CFR 64.2009–64.2011 CPNI                                                                 | eCFR                         | https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-U                                                               | HTML                                                                                                       |
| 47 CFR 1.20000–1.20008 CALEA SSI                                                            | eCFR                         | https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-1/subpart-Z                                                                | HTML                                                                                                       |
| Data Breach Reporting Requirements (FCC 23-111)                                             | Federal Register 89 FR 9968  | https://www.govinfo.gov/content/pkg/FR-2024-02-12/html/2024-01667.htm                                                                        | HTML; §64.2011 amendments not yet effective                                                                |
| Network Outage Reporting System (NORS)                                                      | FCC                          | https://www.fcc.gov/general/network-outage-reporting-system-nors                                                                             | HTML (fcc.gov returns 403 to scripted clients; URL from search)                                            |
| NORS User Manual v9                                                                         | FCC                          | https://transition.fcc.gov/pshs/outage/nors_manual.pdf                                                                                       | Downloadable federal PDF but dated Nov 2013 (search summary mentions a 2021 v3 manual not located)         |
| DIRS modernization fact sheet (July 17, 2025)                                               | FCC                          | https://docs.fcc.gov/public/attachments/DOC-413064A1.pdf                                                                                     | Superseded by FCC 26-34                                                                                    |
| FCC CALEA declaratory-ruling rescission fact sheet                                          | FCC                          | https://docs.fcc.gov/public/attachments/DOC-415190A1.pdf                                                                                     | Policy context only                                                                                        |
| National Coordinating Center for Communications (NCC / Comm-ISAC)                           | CISA                         | https://www.cisa.gov/national-coordinating-center-communications                                                                             | HTML                                                                                                       |
| Priority Telecommunications Services (GETS/WPS/TSP)                                         | CISA                         | https://www.cisa.gov/resources-tools/programs/priority-telecommunications-services                                                           | HTML                                                                                                       |
| Communications Sector page                                                                  | CISA                         | https://www.cisa.gov/topics/critical-infrastructure-security-and-resilience/critical-infrastructure-sectors/communications-sector            | HTML                                                                                                       |
| Joint statement FBI/CISA on PRC targeting of commercial telecommunications (Nov 2024)       | CISA                         | https://www.cisa.gov/news-events/news/joint-statement-fbi-and-cisa-peoples-republic-china-prc-targeting-commercial-telecommunications        | HTML                                                                                                       |
| CISA China cyber threat page                                                                | CISA                         | https://www.cisa.gov/topics/cyber-threats-and-advisories/nation-state-cyber-actors/china                                                     | HTML                                                                                                       |
| FBI PSA: criminals increasing SIM swap schemes (Feb 8, 2022)                                | FBI IC3                      | https://www.ic3.gov/PSA/2022/PSA220208                                                                                                       | HTML                                                                                                       |
| FBI PIN 20241104-001: fraudulent emergency data requests                                    | FBI IC3                      | https://www.ic3.gov/CSA/2024/241104.pdf                                                                                                      | Downloadable federal PDF; not size-checked; candidate replacement doc                                      |
| ESF #2 Communications Annex (NRF, 2021)                                                     | FEMA                         | https://www.fema.gov/sites/default/files/documents/fema_NRF-ESF-2-annex_102021.pdf                                                           | Federal PDF, but fema.gov returned 403 to curl; size unverified — add once fetched by hand                 |
| CSRIC IV WG4, Cybersecurity Risk Management and Best Practices, Final Report (Mar 18, 2015) | FCC CSRIC (industry members) | http://transition.fcc.gov/pshs/advisory/csric4/CSRIC_WG4_Report_Final_March_18_2015.pdf (cited in filings; returned 404 on 2026-10-24)       | Advisory-committee work product drafted by non-federal members; public-domain status not stated; URL moved |
| CSRIC home page (current and past council reports)                                          | FCC                          | https://www.fcc.gov/about-fcc/advisory-committees/communications-security-reliability-and-interoperability-council-0 (403 to scripted check) | Same status question as above                                                                              |
| NCCoE 5G Cybersecurity project                                                              | NIST                         | https://www.nccoe.nist.gov/5g                                                                                                                | SP 1800-33 still draft; white-paper series is final but not individually checked                           |
| Lumen Black Lotus Labs report on a rural ISP router-bricking event (2024)                   | Lumen (vendor)               | (vendor blog; not fetched)                                                                                                                   | Copyrighted vendor research                                                                                |
| ATIS / 3GPP / ETSI standards (e.g., ETSI TS 103 994)                                        | ATIS, ETSI                   | linked from AA25-239A                                                                                                                        | Copyrighted standards                                                                                      |

---

## 11. Sources

- Research brief: local file (research-brief.md)
- eCFR versioner API (point-in-time 2026-10-01): 47 CFR 4.5, 4.9, 4.11, 4.17, 4.18, 9.19, 9.20, 64.2009, 64.2010, 64.2011, 1.20003, 1.20005 — https://www.ecfr.gov/api/versioner/v1/full/2026-10-01/title-47.xml?part=4&section=4.9 (and equivalents)
- Federal Register API, document 2024-01667 (Data Breach Reporting Requirements) — https://www.federalregister.gov/api/v1/documents/2024-01667.json ; text https://www.govinfo.gov/content/pkg/FR-2024-02-12/html/2024-01667.htm
- Federal Register search results: Resilient Networks (DIRS) rules 2025-17899 (Sept 16, 2025), 2026-13155 (June 30, 2026); NG911 reliability 2026-13998 (July 10, 2026) — https://www.federalregister.gov/documents/2026/06/30/2026-13155/resilient-networks-concerning-disruptions-to-communications ; https://www.federalregister.gov/documents/2026/07/10/2026-13998/facilitating-implementation-of-next-generation-911-services-ng911-improving-911-reliability
- FCC 26-34 — https://docs.fcc.gov/public/attachments/FCC-26-34A1.pdf
- FCC DOC-413064A1 — https://docs.fcc.gov/public/attachments/DOC-413064A1.pdf
- FCC DOC-404150A1 — https://docs.fcc.gov/public/attachments/DOC-404150A1.pdf (URL found via https://benton.org/node/347449)
- FCC DOC-344941A1 — https://docs.fcc.gov/public/attachments/DOC-344941A1.pdf
- FCC DOC-415190A1 and coverage: https://docs.fcc.gov/public/attachments/DOC-415190A1.pdf ; https://www.theregister.com/2025/11/24/fcc_salt_typhoon_rules/ ; https://therecord.media/fcc-plans-vote-rescind-biden-era-ruling-telecoms-cyber
- FCC NORS pages (search): https://www.fcc.gov/general/network-outage-reporting-system-nors ; https://transition.fcc.gov/pshs/outage/nors_manual.pdf
- FCC Open Data CSRIC Best Practices — https://opendata.fcc.gov/Public-Safety/CSRIC-Best-Practices/qb45-rw2t ; metadata https://opendata.fcc.gov/api/views/qb45-rw2t.json
- CSRIC IV WG4 report references: https://www.squirepattonboggs.com/en/insights/publications/2015/03/first-time-ever-cybersecurity-measures-adopted-for-communications-sector ; https://www.efis.psc.mo.gov/Document/Display/112547
- CISA Communications Sector — https://www.cisa.gov/topics/critical-infrastructure-security-and-resilience/critical-infrastructure-sectors/communications-sector
- CISA SSP 2015, SRMA fact sheet, PTS fact sheet, eligibility sheet (URLs in §9)
- CISA Cybersecurity Scenarios (CTEP list) — https://www.cisa.gov/resources-tools/resources/cybersecurity-scenarios ; CI Fortify — https://www.cisa.gov/ci-fortify
- CISA enhanced visibility guidance — https://www.cisa.gov/resources-tools/resources/enhanced-visibility-and-hardening-guidance-communications-infrastructure ; https://www.ic3.gov/CSA/2024/241203.pdf
- AA25-239A — https://www.cisa.gov/news-events/cybersecurity-advisories/aa25-239a ; https://www.ic3.gov/CSA/2025/250827.pdf
- CISA joint statement Nov 2024 — https://www.cisa.gov/news-events/news/joint-statement-fbi-and-cisa-peoples-republic-china-prc-targeting-commercial-telecommunications
- CISA NCC — https://www.cisa.gov/national-coordinating-center-communications
- CISA PTS — https://www.cisa.gov/resources-tools/programs/priority-telecommunications-services
- CISA Mobile Communications Best Practice Guidance — https://www.cisa.gov/resources-tools/resources/mobile-communications-best-practice-guidance
- NIST SP 800-189 — https://csrc.nist.gov/pubs/sp/800/189/final ; Rev. 1 ipd https://csrc.nist.gov/pubs/sp/800/189/r1/ipd
- NIST SP 800-187 — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-187.pdf
- NIST SP 1800-33 — https://csrc.nist.gov/pubs/sp/1800/33/ipd ; https://www.nccoe.nist.gov/sites/default/files/2025-03/nist-sp-1800-33a-ipd.pdf
- FEMA ESF #2 annex (search result) — https://www.fema.gov/sites/default/files/documents/fema_NRF-ESF-2-annex_102021.pdf
- FBI IC3 PSA 220208 — https://www.ic3.gov/PSA/2022/PSA220208 ; FBI PIN 20241104-001 — https://www.ic3.gov/CSA/2024/241104.pdf
- CPNI rule litigation (secondary): https://www.tlp.law/2024/02/15/fcc-publishes-data-breach-ro-in-fed-reg/ ; JD Supra topic pages
- CIRCIA status (secondary): https://www.hunton.com/privacy-and-cybersecurity-law-blog/cisa-plans-to-finalize-cyber-incident-reporting-regulations-in-september-2026 ; https://cyberscoop.com/cisa-pushes-final-cyber-incident-reporting-rule-to-may-2026/
- DIRS compliance date (secondary): https://jsitel.com/?p=14896

**Unverified / marked items:** NSM-22 SRMA wording (CISA page says DHS); TSP rule citation (47 CFR Part 64 App. A) and 47 CFR 52.37 not fetched; CIRCIA OMB submission date; Sixth Circuit decision details (secondary only); Nashville 2020, AcidRain 2022, rural-ISP router bricking 2023 and BGP hijack history are cited from general public reporting, not fetched in this pass; FEMA ESF #2 PDF size.
