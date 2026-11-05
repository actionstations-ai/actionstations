# Spec 0459: Corporate governance, risk and business continuity — the governance domain and toolkit

Issue: #692 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/governance.md](../research/domains/governance.md)

## Summary

Action Stations can exercise the people who decide for a whole organization when something goes wrong: the board and its committees, the executive team, general counsel, risk and compliance, and the business continuity manager. They work a disclosure decision (is this cyber incident material, and by when must we file?), a ransom payment decision, a site or supplier loss tested against recovery time objectives, an executive succession event, or an insider or M&A leak. They are scored on what the field cares about: decision timeliness against disclosure clocks, recovery within recovery time objectives (RTOs), and decisions documented with their basis. Everything they need ships as the **governance toolkit** (board briefings, materiality worksheet, disclosure drafts, business impact analysis (BIA), decision log), so any other domain can put an executive decision layer on top of its operational scenario. The regulatory clocks (spec 0426) already exist and are reused, not rebuilt.

## Requirements

### User stories

- As a general counsel, I want an exercise where facts about a ransomware incident change every 30 minutes and my team must decide when it is material, so we practice making the call without waiting for certainty.
- As a board chair, I want a tabletop where directors see only what management would send them, and must decide on a ransom payment with the insurer, counsel and the clocks in view.
- As a business continuity manager, I want to load my functions and RTOs and watch recovery against them while a data center is lost.
- As a CFO, I want to write the materiality worksheet during the exercise and have the disclosure draft match it.
- As a business school instructor, I want a two-hour case with roles for the board, CEO, counsel and communications, scored on decisions and documentation.
- As a bank's risk officer, I want the governance layer on top of the financial services cyber exercise, with the NYDFS and SEC clocks.

### Functional requirements

**Domain**

- **FR-1 Governance domain.** A `governance` domain profile with the roles, systems, outside parties and phrasing in the dossier (sections 2–3), with variants for a public company executive team and board, a business continuity and resilience program, and an academic case (business or law school); aliases as listed. The profile lists suggested toolkits (governance, crisis communications) and regulations (`sec_8k_105`, `nydfs_500_17`).
- **FR-2 Threat families and arcs.** Families: cyber disclosure (ransomware, data theft with extortion), continuity (site loss, system failure, supplier or cloud outage, pandemic absence), and people and information (insider threat, executive succession, M&A leak, regulatory investigation), using extensible families (spec 0448 FR-15). Phase arcs as in the dossier (section 8).

**Governance toolkit: products**

- **FR-3 Products as templates.** Exact, legible templates for: board briefing memo and deck outline; materiality worksheet (facts known, quantitative and qualitative factors, open questions, determination, who and when); disclosure drafts (Form 8-K Item 1.05, Item 8.01, press release, employee and investor messages); BIA table; ransom payment decision paper (sanctions screening, insurer position, alternatives, law enforcement contact); legal hold notice and privilege reminder; regulator inquiry letter or subpoena summary; insurer notice; auditor inquiry; investor question list; decision log; executive succession notice and authority matrix. The existing `regulatory_report_form` and `press_release` templates are reused.
- **FR-4 Format rules.** Lint checks: every draft carries the exercise-aid line (not legal advice, spec 0426 NFR-5); the company is fictional (no real ticker or company name in generated documents); an Item 1.05 draft states the nature, scope and timing of the incident and its material impact or reasonably likely impact; an Item 8.01 draft does not claim materiality; the disclosure draft's facts match the latest worksheet and decision log. Generator knowledge states the rules in the dossier (section 5) in plain words: determination without unreasonable delay, four business days after a materiality determination, no deferral by delaying a meeting, ransom payment does not end the duty, delay only by Attorney General determination.

**Governance toolkit: figures**

- **FR-5 Figures.** Figure kinds (spec 0448 FR-4) for: BIA table with impact over time per function; recovery tracker (each function's RTO against elapsed exercise time, by status); dependency map (function, system, supplier, site) using the generic network figure; decision timeline (discovery, determination, board notice, filing, regulator notices, with clocks). Each produces the text summary and data table of spec 0448 FR-5.

**Simulated data**

- **FR-6 Simulated incident.** For a fictional incident, parameters (type, systems hit, scope growth over time, financial estimate range, third-party involvement) produce consistent case data: a fact timeline that sharpens over hours (early facts incomplete or wrong), a financial impact estimate range that widens and narrows, and recovery progress per function. Includes a "continued investigation" thread so players can test the rule that investigation need not finish before the materiality call. All labeled simulated.

**Exercise play**

- **FR-7 Structured decisions.** Decision forms (spec 0448 FR-14): "Materiality determination" (decision: material, not material, not yet; factors considered; basis; time), "Disclosure" (item, approver, filing time), "Ransom payment" (decision, amount band, sanctions screening done, insurer and law enforcement informed), "Activate continuity plan" (scope, sites, functions), "Escalate to board", "Regulator or insurer notice", "Succession and delegation of authority". Available to players in live play and to the facilitator in Facilitate.
- **FR-8 Clock wiring.** Reuse the clock engine (spec 0426). Add pack data: a `nydfs_500_17` regulation (72 hours from determining a cybersecurity incident occurred; 24 hours for an extortion payment, 30 days for the written explanation). Extend `sec_8k_105` with trigger `delay_ended` (Attorney General delay lapsed or ended; the four business days then run from it, per staff interpretations 104B.02 and 104B.03). A "Materiality determination" decision of "material" fires the `materiality_determined` trigger; a decision of "not yet" starts a visible "determination pending" timer from `discovered` so the facilitator and the debrief can show how long the call took.

**Evaluation**

- **FR-9 Metrics.** Configured from the built-in set (spec 0448 FR-12): time from discovery to determination, determination to filing against the clock, board notice time, share of critical functions restored within RTO at each hour, decisions with a recorded owner and basis, message consistency across board briefing, filing, press statement and employee message.
- **FR-10 Core capabilities.** EEGs for Operational Coordination, Planning, Public Information and Warning, Operational Communications, Economic Recovery and Situational Assessment, with governance critical tasks (a determination made and recorded; board informed; filing made on time; recovery order follows the BIA).

**Data and knowledge**

- **FR-11 EDGAR connector (optional).** With consent and a size estimate, search public 8-K filings by Item (1.05 or 8.01) and date range through the SEC EDGAR APIs (no key; honors the SEC's fair-access rules in the Developer FAQs) to give the facilitator sample disclosure language as reference. Generated exercise documents never name the real company; the connector shows real text only to the facilitator, with the source link.
- **FR-12 Document library.** A public-domain library pack: the SEC adopting release and fact sheet for Release 33-11216 and the Form 8-K staff interpretations; CISA Tabletop Exercise Packages for ransomware, insider threat and executives and senior leadership; FFIEC Business Continuity Management booklet; NIST SP 800-61 and CSF 2.0 (already in core); FEMA Ready.gov business continuity and BIA material (verify each license and URL when building the pack; ISO 22301 is cited only and never bundled).
- **FR-13 Examples.** (1) A fictional manufacturer's executive team and board: ransomware on a Thursday afternoon, the materiality call and filing. (2) A fictional regional bank: governance on top of the financial services cyber scenario with the NYDFS and SEC clocks. (3) A fictional software company: loss of a cloud region, BIA and RTOs, a customer contract dispute.
- **FR-14 Reuse.** Suggested toolkits added to the financial services, healthcare, energy utility, data center and IT, campus, commercial facilities, supply chain (spec 0462) and hospitality (spec 0470) profiles; the BIA and recovery tracker are available to every domain.

### Non-functional requirements

- **NFR-1 Cost:** only free public sources; no accounts or keys.
- **NFR-2 Privacy:** EDGAR is contacted only when the user searches, and the query (Item, dates) is the only data sent; nothing about the user's scenario goes out.
- **NFR-3 Accessibility:** tables and trackers have text summaries; status uses words and icons, not color alone; the decision timeline is also a table.
- **NFR-4 Accuracy:** deadlines come from the pack's regulation data with `verifiedOn` dates (spec 0426 FR-16); every regulation card and export says "Exercise aid, not legal advice. Check the current rule and your counsel." A review by a general counsel and a business continuity manager before release (owner to arrange).

### Out of scope

- Legal advice, a materiality calculator that decides for the user, or filing real forms.
- Bundling ISO 22301, ISO 27001, COSO or other licensed standards.
- Real company names, tickers or live filings inside generated exercises.
- A GRC platform or risk register product.

## Design

- **Domain:** `packs/domains/governance.json` (bundled) with variants as role sets.
- **Toolkit:** `packs/toolkits/governance/` (toolkit JSON, templates, knowledge fragments, lint configuration, decision forms).
- **Regulations:** `packs/regulations/nydfs_500_17.json`; `packs/regulations/sec_8k_105.json` gains the `delay_ended` trigger.
- **Figures:** `src/main/render/figures/governance/` (BIA table, recovery tracker, decision timeline); the dependency map reuses the generic network figure.
- **Simulation:** `src/main/toolkits/governance/simulate.ts` (fact timeline, impact range, recovery curves).
- **Connector:** `src/main/toolkits/connectors/edgar.ts` (estimate, fetch, recorded-response tests).

## Security and privacy

As spec 0448: one fixed host (`sec.gov` APIs) with size limits, files only in the scenario folder, consent before fetching, a declared User-Agent per the SEC's rules. Exercise documents contain no real company data. Facilitator-only EDGAR text is never put in player-visible injects.

## Testing

Table-driven clock tests for the added regulation and trigger (business days across holidays, AG-delay cases from the staff interpretations); golden images for each figure; lint tests for each rule in FR-4; simulation tests (facts consistent, ranges narrow over time, recovery curves respect dependencies); connector contract tests with recorded EDGAR responses and an opt-in live test; example projects generated end to end with the local model before release.

## Tasks

1. **#761** Governance domain profile, roles, variants, threat families and arcs (FR-1, FR-2).
2. **#764** Toolkit templates and format lint (FR-3, FR-4).
3. **#767** BIA and recovery tracker figures (FR-5).
4. **#770** Simulated incidents and case data (FR-6).
5. **#774** Materiality and disclosure decisions with regulatory clocks (FR-7, FR-8).
6. **#778** Decision timing and recovery metrics, EEGs (FR-9, FR-10).
7. **#783** EDGAR connector (FR-11).
8. **#789** Document library pack (FR-12).
9. **#791** Examples, reuse in other domains, user guide (FR-13, FR-14).

## Open questions

- **Practitioner review.** Recommendation: ask a public company general counsel and a certified business continuity professional to review the templates, decision forms and examples before release.
- **FFIEC and ISO detail.** The FFIEC booklet's exercise and board expectations and the ISO 22301 clause numbers were not read in primary text for the dossier. Recommendation: read the FFIEC booklet when building the library pack and keep ISO as a citation only.
- **Attorney General delay.** Modeling `delay_ended` as a manual trigger is enough; confirm with counsel that the four-business-day restart reading of the staff interpretations is the one to show.
- **Other regulators.** State breach laws, EU NIS2/DORA (already packs) and sector rules can be added as pack data; recommendation: ship SEC and NYDFS first.
