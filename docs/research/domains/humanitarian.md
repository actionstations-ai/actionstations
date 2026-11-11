# Domain dossier: `humanitarian` (NGOs, UN agencies and clusters in international response)

Research for the humanitarian and international response epic (#702, spec 0469) and the toolkit framework (#648, spec 0448). Researched 2026-11-05. **[V]** = checked this session against a primary or official source (or, where noted, an official listing of it). **[U]** = not verified this session.

## 1. Scope

**Covers:** international and national NGOs, UN agencies, the Red Cross and Red Crescent movement, and development programs that respond to crises outside a single national emergency management system: sudden-onset disasters (earthquake, cyclone, flood), conflict displacement, refugee influxes, disease outbreaks in camps, food insecurity, and the supply chains and staff security that sit under all of them. Coordination bodies (a Humanitarian Country Team, sector clusters, donors, host government disaster agencies) are part of the exercise.

**Exercise types this domain needs:**

- **Coordination exercise:** the first 72 hours of a sudden-onset disaster abroad: who leads, which clusters activate, an initial rapid assessment, a shared "who does what where" picture, an appeal.
- **Refugee influx:** arrival at a border, registration, site planning and the split of roles between a refugee agency and others (refugee settings use a different coordination model; clusters are not activated in refugee situations **[V: UNHCR emergency handbook page, marked outdated and under revision]**).
- **Outbreak in a camp:** cholera or measles in a displacement site, with health, water and sanitation, camp management and protection coordination.
- **Staff security:** a kidnapping, detention, a convoy attack, an evacuation or hibernation decision, a fatality, and the crisis management team's decisions and family communications. Kept at the level of decisions and coordination.
- **Supply pipeline disruption:** a port closure, a funding gap, an access constraint or customs hold that breaks a pipeline of food, medicines or shelter items.
- **Continuity and information:** data breach of beneficiary records, misinformation about aid distribution, communication loss in the field.

**Aliases:** humanitarian response, international aid, relief, NGO, INGO, UN country team, cluster, HCT, OCHA, field office, country office, emergency response team, camp management, refugee response, disaster response abroad, development program.

## 2. Organization and roles

| Title                                                                                         | Abbrev.          | Team             | What they decide                                                                                  |
| --------------------------------------------------------------------------------------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| Humanitarian Coordinator                                                                      | HC               | Country level    | Leads the in-country response through cluster lead agencies; recommends scale-up and appeals      |
| OCHA Head of Office / Coordination Lead                                                       | OCHA             | Country level    | Convenes the Humanitarian Country Team, issues updates, manages information products              |
| Humanitarian Country Team members                                                             | HCT              | Country level    | Agree strategy, priorities, and access and security approaches                                    |
| Cluster Coordinator (health, WASH, shelter, food security, protection, logistics, and others) | CC               | Cluster          | Sector strategy, gap analysis, partner coordination, reports to the HCT                           |
| Information Management Officer                                                                | IMO              | Coordination     | 3W (who does what where) data, maps, dashboards, data sharing rules                               |
| NGO Country Director                                                                          | CD               | NGO              | Programme and staff decisions, funding, relations with host government                            |
| Programme / Emergency Response Manager                                                        | PM               | NGO              | Response scope, sites, partners, scale of operations                                              |
| Head of Logistics / Supply Chain                                                              | LOG              | NGO              | Pipeline, procurement, transport, warehousing                                                     |
| Security Manager / Focal Point                                                                | SEC              | NGO              | Security risk assessment, movement approvals, incident reports, evacuation and hibernation advice |
| Crisis Management Team Lead                                                                   | CMT              | NGO headquarters | Staff incidents, family liaison, legal and insurance, public statements                           |
| Camp Manager / CCCM lead                                                                      | CAMP             | Site             | Site services, registration, community feedback, site planning                                    |
| Health, WASH and Protection Officers                                                          | HEALTH/WASH/PROT | Sector           | Disease surveillance, water and sanitation, protection monitoring and referrals                   |
| Communications and Advocacy Lead                                                              | COMMS            | NGO              | Public statements, donor communication, media                                                     |
| Donor Representative                                                                          | DONOR            | Outside          | Funding decisions, reporting requirements                                                         |
| Host-government disaster authority                                                            | GOV              | Outside          | National response lead, customs and access, registration of NGOs                                  |

The cluster approach grew out of the 2005 Humanitarian Response Review; the IASC Principals agreed the Transformative Agenda in December 2011 to make activation more strategic and time-limited; clusters are activated by the Emergency Relief Coordinator at the request of the Humanitarian Coordinator with IASC Principals' endorsement, and country-level responses are led by the HC through the cluster lead agencies **[V: IASC and UNHCR pages]**. Some global clusters have named leads (for example, UNHCR leads the Global Protection Cluster, UNHCR and IFRC co-lead the Shelter Cluster, camp coordination and management is co-led by UNHCR and IOM) **[V: UNHCR page; the full cluster table could not be read]**. A 2018 IASC protocol replaced the 2012 protocol on emergency scale-up **[V: via UNHCR page]**. Reports of changes to the number of clusters in 2025 and 2026 were not confirmed **[U]**.

**Outside parties:** national and local authorities and civil society organizations, donors, the military and police for civil-military coordination, private sector (shipping, telecom, banks), affected communities and their representatives, media and social media, and families of staff.

## 3. Systems

- **Coordination tools:** meeting notes and cluster mailing lists, shared drives, 3W matrices and dashboards, an assessment registry, HDX (Humanitarian Data Exchange) for data sharing, ReliefWeb for reports, the Financial Tracking Service for funding **[V: HDX 3W and ReliefWeb API pages; FTS not checked]**.
- **Field operations:** satellite phones and VHF radio, mobile data collection, beneficiary registration systems, cash and voucher platforms, warehouse management, fleet tracking **[U]**.
- **Security:** incident reporting and tracking, security briefings, UN and NGO security collaboration through the Saving Lives Together framework (revised 2015: two levels of collaboration, headquarters support and an oversight committee) **[V: IASC and GISF pages]**.
- **Dependencies:** ports and airports, customs, fuel, banking and mobile money, power, telecom, roads and seasonal access.

## 4. Products (what injects look like)

| Product                                                                                                          | From                  | Render                |
| ---------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------- |
| Situation report / flash update (event, humanitarian impact, response, gaps, access, contact)                    | OCHA / NGO            | text template         |
| 3W (who does what where) matrix and map by sector and admin area                                                 | IMO / clusters        | table + map figure    |
| Cluster meeting minutes and gap list                                                                             | Cluster coordinator   | text template         |
| Humanitarian needs overview, response plan, funding status                                                       | HC / OCHA             | document + chart      |
| Rapid assessment form summary, needs by sector                                                                   | Assessment team       | table figure          |
| Pipeline dashboard (stock on hand, in transit, pipeline break forecast, lead times)                              | Logistics             | data figure + table   |
| Distribution report and coverage by site                                                                         | Programme             | table + figure        |
| Camp health surveillance (cases, deaths, attack rate, case fatality) and epidemic curve                          | Health cluster / site | data figure           |
| Field security incident report, security risk assessment, movement request, security alert shared among agencies | Security manager      | form + text templates |
| Crisis management team log and decision record (fictional)                                                       | HQ CMT                | log template          |
| Family liaison update, staff statement, donor notification, media holding statement                              | COMMS / CMT           | existing templates    |
| Community feedback / complaint log, misinformation tracker                                                       | Camp management       | table template        |

## 5. Doctrine, standards and documents

- **Sphere Handbook (2018 edition)** sets humanitarian minimum standards. The licensing is unclear: Sphere's intellectual property page is reported to release Sphere resources under CC BY 4.0 (third-party content excluded), while the 2018 PDF's own notice allows reproduction without fee for educational purposes and requires written permission for posting online or adaptation, and the Core Humanitarian Standard portion has separate copyright **[U: two sources disagree; the IP page could not be fetched this session]**. **Not bundled; linked.** Sphere indicators (water, space, nutrition and so on) are named and linked, not copied.
- **IASC documents:** the cluster coordination reference module (2015 revision), the Transformative Agenda protocols, scale-up activation (2018), Emergency Response Preparedness guidelines (draft for field testing, July 2015, and the 2013 Common Framework for Preparedness) **[V: titles and dates; content not read]**. IASC document terms **[U]**; linked.
- **Field security:** the IASC "Saving Lives Together" framework (2015) lists goals for security collaboration among the UN, international NGOs and international organizations, including timely sharing of incident reports and alerts, and does not make the UN responsible for NGO security **[V: IASC and GISF]**. GISF guides **[U: licenses]**.
- **Lessons from real responses:** inter-agency real-time evaluations of the 2010 Haiti earthquake found slow cluster coordination, weak leadership and capacity among lead agencies, weak inter-sectoral coordination and a compartmentalized cluster approach at local level **[V: evaluation documents listed by search]**; the synthesis of Inter-Agency Humanitarian Evaluations of the Philippines (Typhoon Haiyan), South Sudan and Central African Republic responses found strategic coordination not always matched by operational coordination at cluster level and diluted leadership responsibilities **[V: ReliefWeb synthesis, listing]**.
- **Exercise requirement:** INSARAG-classified urban search and rescue teams must take part in INSARAG regional meetings, exercises (including simulation exercises) and other activities to keep their classification, which is valid five years **[V: INSARAG manuals as returned by search; a 2011 guideline's ten-year language not reflected later]**. Other humanitarian exercise drivers (donor preparedness requirements, organization policies, IASC preparedness) **[U]**.
- **US federal sources:** public-domain candidates are limited in this field. Federal works may exist from CDC (cholera, refugee health) and the former USAID disaster office (a field operations guide for disaster assessment and response) **[U: availability after agency changes unknown]**.

## 6. Data sources (free, public)

| Data                                                     | Source                                                                                                            | Notes                                                                                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3W / operational presence by country, sector, admin area | Humanitarian Data Exchange (HDX), country datasets from OCHA offices; OCHA's global operational presence pipeline | quarterly or as-needed updates; licenses vary by dataset (a Creative Commons attribution license on the HAPI data) **[V: dataset pages; per-dataset license must be read]**                        |
| Reports, maps, disasters                                 | ReliefWeb API                                                                                                     | free, but since 1 November 2025 requires a pre-approved appname **[V]**                                                                                                                            |
| OCHA key figures                                         | OCHA Key Figures API                                                                                              | free; requires an APP-NAME header **[V: beta]**                                                                                                                                                    |
| Funding flows                                            | OCHA Financial Tracking Service                                                                                   | **[U]**                                                                                                                                                                                            |
| Aid worker security incidents                            | Aid Worker Security Database (Humanitarian Outcomes)                                                              | 383 aid workers killed in 2024 (a record, 293 in 2023), 599 major attacks, 308 wounded, 125 kidnapped, 45 detained; provisional 2025: 350 killed **[V: AWSD figures as reported by UN and press]** |
| Disaster alerts and risk indexes                         | GDACS, INFORM, FEWS NET, IPC                                                                                      | **[U: not checked]**                                                                                                                                                                               |
| Displacement and refugee statistics                      | UNHCR, IOM DTM                                                                                                    | **[U]**                                                                                                                                                                                            |
| Common Operational Datasets (boundaries, populations)    | HDX                                                                                                               | **[U: terms]**                                                                                                                                                                                     |

## 7. Evaluation

- **Coordination gaps closed:** a gap list from cluster meetings and the time to close each (assigned, covered); the coordination reviews above are the reason this is the measure leaders ask for.
- **Needs coverage:** share of assessed needs met by sector and site, with time; coverage standards come from the response plan, not an invented number (Sphere indicators are linked for reference).
- **Staff safety decisions:** decision timing relative to a threat's onset (movement stopped, hibernation or evacuation ordered, family notified), and information sharing through the security collaboration forum.
- **Pipeline:** days of stock against forecast need, time to detect and respond to a pipeline break.
- **Epidemic response:** time from first case report to a response in each sector (reuses the epidemiology toolkit, #690).
- **HSEEP-style capabilities** do not map directly. The spec uses a short list of humanitarian capability areas (coordination, assessment and information management, security and duty of care, logistics, sector response, communications and accountability to communities) and maps them to HSEEP core capabilities where a US sponsor needs it **[V: HSEEP names; mapping is ours]**.

## 8. Threat families and scenario arcs

- **Hazard-driven:** sudden-onset disaster abroad (earthquake, cyclone, flood), refugee influx, cholera or measles outbreak in a site, food insecurity.
- **Operations-driven:** staff kidnapping or detention, convoy attack, evacuation or hibernation, supply pipeline break, funding gap, data breach of beneficiary records, misinformation about aid, and the shared **service degradation** family (communications loss).
- Arc for a sudden-onset disaster: alert and first reports → first 24 hours (government request, assessment teams, cluster activation) → first 72 hours (3W, gaps, appeal) → first weeks (response plan, access constraints, funding) → transition. Arc for a staff security incident: incident report → crisis management team activation → family liaison and information control → resolution decisions → recovery and review.

## 9. Reuse by other domains

Camp management and shelter reuse the human services toolkit (spec 0464); outbreak scenarios reuse the epidemiology toolkit (#690) and the public_health domain; pipelines reuse the supply chain toolkit (#695) and port_maritime; sudden-onset hazards reuse weather (0449), earth sciences (0450) and flooding (#687); misinformation reuses crisis communications (#691) and AI incidents (#700); beneficiary data breaches reuse the cyber scenarios. In the other direction, domestic NGOs, faith-based and voluntary organizations active in disasters can use the 3W, coordination and sitrep products in US community exercises.

## Expert review (2026-11-11)

This is a model-led expert review, written from the standpoint of a humanitarian coordinator with UN cluster and NGO experience. It is not a review by a licensed or employed practitioner.

**Checked.** The domain profile with its eight threat families and four role sets, the humanitarian toolkit (glossary, product conventions, realism rules, the seventeen decision forms, measures and their thresholds, critical tasks), the cluster activation and Saving Lives Together lint rules, the humanitarian guide and pack readme, and the flash update and Humanitarian Country Team record previews.

**Sources.** The OPAG co-chairs' "Humanitarian Reset: Cluster Simplification" final proposal to the IASC Principals (9 June 2025) and the summary of the IASC Principals' meeting of 17 June 2025, both read 2026-11-11 from the Global Nutrition Cluster site; ALNAP, State of the Humanitarian System 2026, chapter 2.2 (coordination); the Global Protection Cluster note on the consolidated protection cluster; UN General Assembly resolutions 46/182 and 58/114 for the principles.

**Confirmed.** The 3W definition and its rule that a blank is a gap or a reporting failure; the HCT's composition; the refugee coordination model in refugee settings; Saving Lives Together not transferring security responsibility; the four humanitarian principles; hibernation, relocation and evacuation as separate decisions; the guardrail on kidnapping and detention content; the days-of-stock arithmetic. The gap measures (12 hours to assign, 48 hours to cover) and the 24-hour outbreak declaration window are reasonable exercise defaults.

**Changed and why.**

- Cluster activation. The pack stated only the classic procedure (the HC requests, the ERC decides with the IASC Principals), and its lint flagged any text in which the HC activates clusters. In June 2025 the IASC Principals broadly agreed the cluster simplification, under which HCs and HCTs decide which clusters to activate or merge and the 11 global clusters are consolidated into 8. Implementation is uneven by country. The realism rule, the domain prompt guidance, the decision form descriptions, the guide and the readme now give both arrangements and ask the scenario to state which applies. The lint no longer flags text that names its process (the Reset, the HCT or the ERC), nor clusters beside a refugee response in a named mixed setting. Tests cover both.
- The cluster choice lists lacked Emergency Telecommunications and misnamed Camp Coordination and Camp Management; both are fixed.
- The glossary now separates the OCHA flash update from the situation report and defines do no harm. Realism rules apply do no harm and need-to-know handling of beneficiary and protection data, and require staff security decisions to address national staff, not only international staff.
- The flash update's schema examples cited the Health and Shelter Clusters as sources two days before the HCT met to consider activation; they now say Health partners and Shelter partners.

**Defaults set.** Where a scenario does not say otherwise, the classic IASC request and decision path is assumed; the Reset arrangement is accepted when stated. The cluster lists keep the 11 established names, since many country operations still use them.

**Caveats left for the owner.**

- The flash update preview still cites "Health Cluster" and "Shelter Cluster" before activation. Change both to "Health partners" and "Shelter partners" and regenerate that template's golden; the app could not be rendered in this review's environment.
- The March 2026 IASC guidance on in-country adaptation of clusters was not read. Re-check the eight cluster names and the activation authority before the next release.
- The evacuation decision's scope choices name international and non-essential staff only; a choice for relocating national staff and families may be worth adding.
- The Sphere licence question from the spec remains open; the toolkit still links rather than bundles.
