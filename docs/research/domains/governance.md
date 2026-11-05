# Domain dossier: `governance` (corporate governance, risk and business continuity)

Research for the governance epic (#692, spec 0459) and the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session. Where a fact came only from a law-firm or trade summary it is marked **[U]**.

## 1. Scope

**Covers:** the people who decide for an organization as a whole when something goes wrong: boards and audit or risk committees, the chief executive and executive team, general counsel and outside counsel, chief risk, compliance and internal audit officers, business continuity (BC) and operational resilience managers, investor relations, and business and law programs that teach these decisions.

**Exercise types this domain needs:**

- **Disclosure decision exercises:** a cyber incident where the executive team and counsel decide whether and when it is material, with the disclosure clock running.
- **Board crisis tabletops:** directors practice oversight: what they must be told, when, and what they approve (ransom payment, public statement, regulator contact).
- **Business continuity exercises:** loss of a site, a key system, a cloud provider or a critical supplier, tested against recovery time objectives from the business impact analysis (BIA).
- **Executive succession and key-person events:** sudden loss of the CEO or CFO; the chain of authority.
- **Sensitive-information events:** insider threat, M&A leak, regulatory investigation or subpoena (legal hold, privilege).

**Aliases:** board, board of directors, audit committee, risk committee, executive team, C-suite, general counsel, legal department, risk management, compliance, enterprise risk, ERM, business continuity, BCM, operational resilience, crisis management team, CMT, disclosure committee, investor relations.

**Boundary with existing domains:** `financial_services` already covers banks and credit unions (their regulators and the FFIEC examination of continuity). `governance` is sector-neutral: the corporate decision layer that sits on top of any operating domain. A bank uses both: its operating domain plus governance. `generic` stays the fallback.

## 2. Organization and roles

| Title                                    | Abbrev. | Team          | What they decide                                                                                   |
| ---------------------------------------- | ------- | ------------- | -------------------------------------------------------------------------------------------------- |
| Board chair / lead independent director  | CHAIR   | Board         | Convenes the board, approves extraordinary actions, decides what the board must hear and when      |
| Audit or risk committee chair            | AUDIT   | Board         | Oversight of cyber and continuity risk, receives incident reports, disclosure review               |
| Chief Executive Officer                  | CEO     | Executive     | Declares a crisis, approves ransom, public statements, regulator contact, activates succession     |
| Chief Financial Officer                  | CFO     | Executive     | Financial impact estimate for materiality, liquidity, insurance, certification of filings          |
| General Counsel                          | GC      | Legal         | Materiality advice, privilege (outside counsel directs forensics), disclosure drafting, legal hold |
| Disclosure committee chair               | DISC    | Legal/Finance | Materiality determination process, drafts and approves the filing                                  |
| Chief Information Security Officer       | CISO    | Security      | Facts on scope and impact, escalation to the executive team, containment                           |
| Chief Risk Officer                       | CRO     | Risk          | Risk appetite, impact tolerances, links incident to enterprise risk register                       |
| Business Continuity Manager              | BCM     | Resilience    | Activates plans, owns the BIA, tracks recovery against recovery time objectives (RTOs)             |
| Chief Compliance Officer                 | CCO     | Compliance    | Regulatory notice obligations and clocks, regulator relationships                                  |
| Internal audit head                      | IA      | Audit         | Independent view of the response; later review of controls                                         |
| Investor relations / Chief Comms Officer | IR      | Comms         | Investor, analyst and employee messaging; consistency with the filing                              |
| Outside counsel / forensic firm          | OUT     | External      | Privileged investigation; ransom negotiation and sanctions screening (external)                    |

Outside parties: the SEC, other regulators, law enforcement (FBI, CISA, Secret Service), the insurer and broker, the auditor, key customers and suppliers, the stock exchange, shareholders and the press.

## 3. Systems

- **Enterprise risk register and GRC platform**, BIA tool or spreadsheet, crisis management plan and call tree, mass notification, board portal for secure materials, document management and legal hold, disclosure controls and procedures, EDGAR filing agent, insurance policy and claims portal, ERP and finance close.
- **Continuity dependencies:** data center and cloud regions, SaaS providers, payment processors, telecom, key suppliers, the head office building, staff location.

## 4. Products (what injects look like)

| Product                                                                                       | Render                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Board briefing memo (one page) and board deck outline                                         | template                                    |
| Materiality worksheet: facts so far, quantitative and qualitative factors, open questions     | template (new)                              |
| Disclosure draft: Form 8-K Item 1.05 and Item 8.01 text, press release                        | template (existing report form + new draft) |
| Business impact analysis table: function, impact over time, RTO, recovery point, dependencies | template + figure (new)                     |
| Recovery tracker: each function's RTO against elapsed time                                    | figure (time series/Gantt)                  |
| Legal privilege reminder, legal hold notice, regulator inquiry letter or subpoena summary     | template (new)                              |
| Decision log (what was decided, by whom, on what information, at what time)                   | template                                    |
| Ransom payment decision paper: sanctions screening, insurer position, alternatives            | template (new)                              |
| Insurer notice, auditor inquiry, investor question list, analyst call talking points          | templates                                   |
| Executive succession notice and authority matrix                                              | template (new)                              |

## 5. Regulations, doctrine and documents

**SEC cybersecurity disclosure (Release 33-11216, July 2023).**

- Registrants must determine materiality "without unreasonable delay" after discovery, and if the incident is material, file an Item 1.05 Form 8-K "generally within four business days of such determination" **[V: SEC fact sheet and adopting release text]**.
- The Attorney General may delay disclosure for substantial risk to national security or public safety: up to 30 days, extendable by up to 30 more, and in extraordinary circumstances a final period of up to 60 days **[V: adopting release]**. Staff interpretations: requesting a delay does not change the filing obligation, and the four business days run from the end of the delay or the Attorney General's notice **[V: Exchange Act Form 8-K C&DIs 104B.01-104B.03]**.
- Ransomware: stopping an incident or paying a ransom does not remove the duty to make a materiality determination (104B.05) or to file if material (104B.06); payment size is one factor (104B.08); related incidents may be assessed together (104B.09); insurance reimbursement does not by itself make an incident immaterial (104B.07) **[V]**.
- The adopting release says a company may not defer the determination by delaying a committee meeting past the normal time to convene it, and may not change incident policies to support a delayed determination **[V: release text]**.
- Compliance: Item 1.05 from 2023-12-18; smaller reporting companies 180 days later; annual Regulation S-K Item 106 disclosure of risk management, strategy and board oversight in the Form 10-K for fiscal years ending on or after 2023-12-15 **[V: SEC press release 2023-139]**.
- May 2024 staff statement: voluntary disclosure of incidents not yet judged material belongs under Item 8.01, not 1.05 **[U: secondary summaries]**. Example: a consumer products company filed an Item 8.01 8-K on 2023-08-14 describing unauthorized IT activity and offline systems, without a materiality statement **[V: the 8-K on EDGAR]**.
- Existing in the app: `packs/regulations/sec_8k_105.json` (spec 0426) already carries the trigger "materiality determined" and the four-business-day clock; this field reuses it and adds the "discovered" to "materiality determined" decision as a player decision to be timed, not a clock.

**New York DFS Cybersecurity Regulation (23 NYCRR 500)** **[V: Cornell LII text of the CFR]**:

- 500.16(a): covered entities must have written incident response and business continuity and disaster recovery (BCDR) plans; BCDR plans identify essential resources and personnel, communications, recovery, offsite backup and third parties.
- 500.16(d): test the incident response and BCDR plans with all critical staff and management, and the ability to restore from backups, "periodically, but at a minimum annually".
- 500.17(a): notify the superintendent within 72 hours of determining a cybersecurity incident occurred; 500.17(c): notice of an extortion payment within 24 hours and a written explanation within 30 days (including alternatives and sanctions diligence).

**FFIEC Business Continuity Management booklet** (IT Examination Handbook, November 2019, replacing the 2015 booklet) covers governance, resilience, "exercises and tests" and maintenance **[V: Federal Reserve SR 19-13 transmittal]**. Board duties and annual frequency: **[U: secondary summaries; the booklet itself was not retrievable]**. Do not state "annual" as an FFIEC rule.

**ISO 22301:2019 (business continuity management systems).** Licensed standard, not copied. Cited concepts only: business impact analysis and risk assessment (clause 8.2), continuity strategies, an exercise programme (clause 8.5), maximum tolerable period of disruption versus recovery time objective **[U: clause numbers from third-party guides; check the standard]**. The app uses the concepts with its own wording.

**Public-domain candidates (verify license and URL at pack build):** CISA Tabletop Exercise Packages for ransomware, insider threat and executives and senior leadership (situation manuals dated September 2023, September 2023 and August 2024) **[U: titles and dates from search results]**; FEMA Ready.gov business continuity and BIA material **[U: page not retrievable this session]**; NIST SP 800-61 and CSF 2.0 (already in the core pack via spec 0426); SEC rule release and fact sheet **[V]**; FFIEC BCM booklet **[U]**; HSEEP.

## 6. Data sources (free, public)

| Data                                                                   | Source                                            | Notes                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8-K filings, company facts, filing history                             | SEC EDGAR APIs (submissions, XBRL company facts)  | No key or account required **[V]**; the page defers rate rules to the Developer FAQs **[U: 10 requests per second and a declared User-Agent are the commonly cited rules]** |
| Real disclosure language for realistic drafts                          | EDGAR full-text search of 8-K Items 1.05 and 8.01 | Public filings; the drafts must use fictional companies                                                                                                                     |
| Cyber incident impacts (stock moves, revenue effects) for case studies | Company filings, EDGAR                            | Facts only; do not name real companies in generated exercises                                                                                                               |

There is no operational data to replay. The "figures" are the BIA table, the recovery tracker and a decision timeline; case data is simulated by the app.

## 7. Evaluation

- **Disclosure timing:** time from discovery to materiality determination, and from determination to filing, against the four-business-day clock; whether the determination was deferred without cause (the release names that as unreasonable delay) **[V]**.
- **Decision documentation:** each decision has an owner, the facts known at the time, the basis (materiality factors considered) and a timestamp.
- **Recovery against RTOs:** functions restored within RTO, percent of critical functions at each hour, dependencies missed.
- **Consistency:** the board briefing, the filing, the press statement and the employee message say the same thing.
- **HSEEP core capabilities:** Operational Coordination, Planning, Public Information and Warning, Operational Communications, Economic Recovery, Situational Assessment.

## 8. Threat families and scenario arcs

- **Cyber:** ransomware with a materiality call; data theft with extortion; cloud provider outage.
- **Continuity:** site loss, supplier failure, key system failure, pandemic absence.
- **People and information:** insider threat, executive succession emergency, M&A leak, regulatory investigation.
- Arc for disclosure decisions: detection → facts and scope → materiality determination → board escalation → disclosure and regulator notices → investor reaction → recovery and review.

## 9. Reuse by other domains

Governance is the top layer of every commercial or institutional domain. The materiality worksheet and decision log suit healthcare systems, utilities, financial services, universities and any public company. The BIA and recovery tracker are reused by supply chain (spec 0462), data center and IT, hospitality and campus. Regulatory clocks (spec 0426) supply the deadlines. Crisis communications (#691) supplies statements.
