# Domain dossier: `ai_incidents` (AI incidents and synthetic media)

Research for the AI incidents epic (#700, spec 0467) and the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session (found in secondary summaries or from general knowledge). Law and guidance in this field are changing quickly; re-check dates before relying on them.

## 1. Scope

**Covers:** organizations that must prevent, detect and respond to two new incident types: (1) **synthetic media attacks**, in which AI-generated or manipulated voice, video, images or text impersonate a person or fabricate an event (deepfaked executives authorizing payments, fake spokesperson video, synthetic misinformation about the organization); and (2) **AI system incidents**, in which an organization's own or a vendor's AI system fails or is attacked (harmful output to customers, data poisoning, model tampering, AI vendor breach).

**Who exercises:** security and fraud teams, trust and safety teams, communications and public affairs, AI governance and risk, legal and compliance, product and engineering teams that deploy models, treasury and accounts payable staff, and boards.

**Exercise types this domain needs:**

- **Deepfake-enabled fraud:** an employee is asked on a call or video meeting by someone who looks and sounds like an executive to move money; the exercise tests verification procedures, payment holds and recall.
- **Synthetic media about the organization:** a fake video of the spokesperson or CEO spreads; verification, takedown and public response.
- **AI model produces harmful output:** a customer-facing assistant gives dangerous, discriminatory or false advice; kill switch, customer notice and regulator reporting.
- **Data poisoning or model tampering:** training or retrieval data is corrupted; detection, rollback and disclosure.
- **AI vendor breach:** a model or data vendor is compromised; third-party notification and contract duties.
- **AI-generated misinformation:** automated campaigns target the organization (shared with crisis communications, spec 0458).

**Aliases:** AI incident, AI governance, responsible AI, trust and safety, deepfake, synthetic media, voice cloning, model failure, AI risk, generative AI incident, AI vendor risk, fraud, business email compromise (when the lure is synthetic media).

## 2. Organization and roles

| Title                                    | Abbrev. | What they decide                                                                                  |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| AI governance lead / responsible AI lead | AIGOV   | Whether an event is an AI incident, severity, which review board and which regulator duties apply |
| Chief information security officer       | CISO    | Containment, evidence preservation, link to the cyber incident process                            |
| Fraud investigator / financial crimes    | FRAUD   | Payment holds, recall requests, reports to the bank and law enforcement                           |
| Treasury / accounts payable lead         | TREAS   | Whether to execute or hold a transfer; out-of-band callback verification                          |
| Trust and safety lead                    | T&S     | Takedown and labeling of synthetic content on the organization's platform                         |
| Model owner / ML engineering lead        | MLENG   | Kill switch, rollback to a prior model, retraining, evaluation results                            |
| Product owner of the AI feature          | PROD    | Feature pause, customer-facing changes                                                            |
| Communications / PIO                     | COMMS   | Statements and corrections (see the crisis communications dossier)                                |
| General counsel / privacy officer        | LEGAL   | Disclosure duties and clocks, regulator and customer notices, privilege                           |
| Procurement / vendor risk manager        | VENDOR  | Vendor notice, contract rights, interim controls                                                  |
| Executive / board member                 | EXEC    | Materiality, public disclosure, resourcing                                                        |
| The impersonated executive               | VICTIM  | Confirms they did not make the call; supports takedown and statements                             |

**Outside parties:** banks and payment processors, law enforcement (in the US, the FBI's Internet Crime Complaint Center), market surveillance authorities in EU member states, data protection authorities, the AI vendor, platforms hosting the synthetic content, the press, customers, insurers.

## 3. Systems

- **Collaboration and communication:** video conferencing, voice calls, messaging, email, executive assistants' workflows; call-back directories.
- **Payment systems:** treasury management, wire and ACH, vendor master data, payment approvals and holds, bank portals for recall.
- **AI systems:** customer-facing assistants and chatbots, internal copilots, classifiers and scoring models, retrieval-augmented systems with document stores, model registries, evaluation harnesses, guardrail and moderation layers, logging and monitoring, **AI system inventories** (a register of models and where they are used).
- **Detection and provenance:** deepfake detectors (probabilistic scores with false positives and false negatives), Content Credentials (C2PA). A C2PA manifest is a set of provenance information (assertions, one claim, a signature); a hard binding of hashes lets a validator check that the manifest belongs to the asset and that the asset is unmodified; the trust model rests on the signer's identity, not on proof that the content is true **[V: C2PA Technical Specification 2.0, spec.c2pa.org]**. A missing credential proves nothing.
- **Incident tooling:** the cyber incident process (SIEM, case management), AI incident tracking, legal hold, disclosure and filing portals.

## 4. Products (what injects look like)

Existing templates **[V: repo `templates/injects/`]**: `wire_transfer_request`, `voicemail`, `phone_call`, `text_message`, `chat_transcript`, `email`, `email_header_analysis`, `tweet`, `facebook_post`, `news_article`, `press_release`, `reporter_email`, `service_status_page`, `breach_notification_letter`, `regulatory_notice`, `regulatory_report_form`, `siem_alert`, `incident_alert_notification`, `memo`.

| Product                                                                              | From                 | Render                                                         |
| ------------------------------------------------------------------------------------ | -------------------- | -------------------------------------------------------------- |
| Deepfake call or video meeting (audio clip, video card, call log, chat side-channel) | attacker             | fictional synthetic voice/face; labeled; see spec 0467 FR-6    |
| Payment instruction and approval trail; bank recall request                          | treasury, bank       | exists (`wire_transfer_request`) + new recall form             |
| Model incident report (what happened, system, impact, status)                        | model owner          | new text template                                              |
| AI system inventory entry (system, purpose, risk class, owner, vendor)               | AI governance        | new table template                                             |
| Serious incident notification draft for a market surveillance authority              | AI governance, legal | new text template aligned with the Commission's draft template |
| Disclosure drafts: customer notice, regulator notice, public statement               | legal, comms         | new text templates, linking to crisis comms products           |
| Takedown request to a platform                                                       | T&S, legal           | new text template                                              |
| Evaluation results and harmful-output rate over time                                 | ML team              | data figure (time series)                                      |
| Moderation queue volume; detector score distribution with uncertainty                | T&S                  | data figure                                                    |
| Vendor incident notice and vendor questionnaire                                      | vendor               | new text template                                              |
| Verification note and provenance findings                                            | verification         | from the media environment toolkit (spec 0458)                 |
| Social posts, news articles, reporter calls                                          | public, press        | existing templates via the media environment                   |

## 5. Regulations, doctrine and documents

- **EU AI Act, Article 73 (serious incident reporting).** Providers of high-risk AI systems placed on the Union market report serious incidents to the market surveillance authorities of the member states where the incident occurred. General serious incidents: immediately after a causal link is established or reasonably likely, and in any event not later than **15 days** after the provider becomes aware. Widespread infringement or serious incidents of the kind in Article 3(49)(b): immediately and not later than **2 days**. Death of a person: not later than **10 days**. An incomplete initial report is allowed, followed by a complete one. The authority acts within 7 days of receiving a notification; authorities inform the Commission **[V: Article 73 text as reproduced at artificialintelligenceact.eu; the Official Journal text was not opened]**.
- **Serious incident (Article 3(49)):** an incident or malfunction of an AI system that directly or indirectly leads to death or serious harm to health; a serious and irreversible disruption of the management or operation of critical infrastructure; infringement of obligations under Union law intended to protect fundamental rights; or serious harm to property or the environment **[V: same source]**.
- **Deep fake (Article 3(60)):** AI-generated or manipulated image, audio or video content that resembles existing persons, objects, places, entities or events and would falsely appear to a person to be authentic or truthful **[V]**. **Article 50(4):** deployers of AI that generates or manipulates deep fakes must disclose that it is artificially generated or manipulated, with exceptions (for example evidently artistic, creative or satirical works). **Article 50(2):** providers must mark synthetic outputs in a machine-readable format **[V: text as reproduced at artificialintelligenceact.eu]**.
- **Application dates are moving.** Regulation (EU) 2026/1744 (published in the Official Journal 24 July 2026) entered into force on 27 July 2026 (its Article 4). Its Article 1(40)(b) replaces Article 113, third paragraph, point (c): Chapter III, Sections 1, 2 and 3, except Article 6(5), apply from 2 December 2027 for systems high-risk under Article 6(2) and Annex III, and from 2 August 2028 for systems high-risk under Article 6(1) and Annex I. Article 1(40)(a) moves the new Article 5 prohibitions to 2 December 2026, point (d) applies Articles 102 to 110 from 27 July 2026, and the new Article 111(4) gives generative systems already on the market until 2 December 2026 for Article 50(2) **[V: Official Journal text, read 2026-11-05]**. Article 73 sits in Chapter IX, which applies from the general date, 2 August 2026 (Article 113, second paragraph); the amending regulation does not change Article 73 (it adds Article 75(1a), AI Office reporting for systems under its competence) **[V: Official Journal text and the EUR-Lex amendment list, read 2026-11-05]**. A system only carries the Article 73 duty once it is a high-risk system with Chapter III applying, so in practice the duty starts on the deferred dates **[U: reading of the text, not a court or Commission statement]**.
- **Commission draft guidance and reporting template for Article 73** was published 26 September 2025 with consultation to 7 November 2025; it addresses what counts as a serious incident, causality (an indirect link is considered sufficient), investigation duties, and a template field for parallel sectoral reporting **[U: summaries of the draft; final status not confirmed]**. It covers high-risk systems, not general-purpose models with systemic risk (separate duties under Article 55) **[U]**.
- **Important scope point for exercise design:** Article 73 binds providers of high-risk AI systems (and deployers feed information to the provider). A company defrauded by a deepfake call, with no AI system of its own involved, has a fraud and cyber incident, not an Article 73 incident. An exercise that mixes the two (for example a bank's AI-based credit-scoring assistant harming customers) is where the duty applies **[U: reading of the Article; needs practitioner review]**.
- **FinCEN alert FIN-2024-Alert004 (13 November 2024)** on fraud schemes involving deepfake media targeting financial institutions: describes the schemes, gives red-flag indicators and reminds institutions of Bank Secrecy Act reporting; FinCEN reported more suspicious activity reports describing suspected deepfake use, especially fraudulent identity documents used to defeat verification **[V: fincen.gov news release]**. A SAR key term is specified in the alert **[U: wording not read]**.
- **FCC declaratory ruling FCC 24-17 (adopted 2 February 2024):** AI-generated human voices in robocalls are "artificial or prerecorded voice" under the TCPA, following the January 2024 New Hampshire robocall with an AI voice imitating the President **[U: from fcc.gov search results]**.
- **FBI Internet Crime Complaint Center public service announcement (15 May 2025, updated 19 December 2025)** warned of impersonation of senior US officials with texts and AI-generated voice messages, and advised verifying a caller through an independently found number; the 2025 IC3 annual report cites more than 22,000 complaints with AI-related information **[U: search summaries of ic3.gov and fbi.gov]**.
- **SEC Form 8-K Item 1.05:** public companies disclose a material cybersecurity incident within four business days of determining it is material **[U: SEC final rule 33-11216 and staff guidance as seen in search summaries]**; relevant when an AI vendor breach or poisoning is a cyber incident.
- **NIST AI Risk Management Framework 1.0** (NIST AI 100-1, 26 January 2023; functions Govern, Map, Measure, Manage; NIST says it is being revised) and the **Generative AI Profile** (NIST AI 600-1, 26 July 2024) **[V: nist.gov]**. US federal works, public domain candidates **[U: confirm license on each document]**.
- **AI Incident Database**, run by the Responsible AI Collaborative: a collection of real-world AI failures, open to submissions reviewed by editors **[V: incidentdatabase.ai/about]**; the data license was not stated on the page, so it is linked, not bundled.
- **Other privacy duties** (for example GDPR 72-hour notification where personal data is involved) are covered in the regulatory clocks spec 0426 and the privacy-related dossiers **[U: not rechecked this session]**.

## 6. Real events and lessons

- **Arup, Hong Kong (reported 2024) [V: Construction Briefing, 21 May 2024].** An employee was persuaded during what seemed to be a genuine company video conference with callers posing as senior officers; funds of HK$200 million (about US$25.6 million) were transferred to designated accounts in a series of transfers. Arup notified police in January 2024; police reported the case in February without naming the company; Arup said its finances and operations were unaffected and no internal systems were compromised. Arup's global chief information officer said the number and sophistication of such attacks was rising sharply. Use: a finance employee, a multi-person video call, urgency, and no out-of-band verification.
- **New Hampshire robocall, January 2024 [U].** Thousands of voters received a call with an AI-generated voice imitating the President two days before the primary; led to the FCC ruling above and proposed penalties. Use: synthetic voice, election timing, communications and regulator response.
- **Impersonation of senior US officials, 2025 [U].** Texts and AI-generated voice messages to build trust before account takeover. Use: verification by an independently found number.
- **Verification failure in news (the 2013 AP hack) and the Hawaii false alert [V/U]** are covered in the crisis communications dossier and reused here for correction practice.

## 7. Data sources (free, public)

| Data                            | Source                         | Notes                                                                                      |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Real AI incident descriptions   | AI Incident Database           | Reference only; data license not stated on the about page **[V]**; not replayed as injects |
| Fraud and scam trend statistics | FBI IC3 annual reports         | Public US government reports **[U]**; use for realism and figures in documents             |
| Deepfake red flags              | FinCEN alert FIN-2024-Alert004 | Public US government document **[V: release]**                                             |
| Provenance test files           | C2PA public sample assets      | **[U: not checked]**; the app produces its own labeled sample manifests instead            |

There is no public dataset appropriate for replaying a real deepfake or model incident, and real synthetic media of real people must not be reused. The app builds **simulated** case data: a payment timeline, evaluation series with a drift, moderation queue volumes, and detector scores with uncertainty, all labeled simulated.

## 8. Evaluation (how the field scores itself)

- **Time to detect synthetic media:** from the first exposure (the call, the first post) to the first person flagging it as suspect, and to the formal declaration.
- **Payments stopped:** value and count of payments held or recalled against those attempted; time from the instruction to the hold; use of the out-of-band callback on a known number.
- **Disclosures on time:** each applicable clock (regulator, customer, market) met or missed, against the clock and its trigger (see the regulatory clocks spec 0426).
- **Containment of an AI system incident:** time from detection to kill switch or rollback; whether evidence (logs, model version, prompts, data snapshots) was preserved before changes.
- **Message consistency and correction** (from spec 0448 and the crisis communications toolkit).
- **HSEEP Core Capabilities:** Cybersecurity, Public Information and Warning, Operational Coordination, Intelligence and Information Sharing **[V: Core Capability names used in the repo's EEG model]**.

## 9. Threat families and scenario arcs

- **Synthetic impersonation fraud:** deepfaked executive voice or video authorizing a payment; synthetic supplier or HR requests; synthetic identity for account opening. Arc: lure → instruction → verification (or not) → payment → discovery → hold and recall → investigation → disclosure and lessons.
- **Synthetic media about the organization:** fake spokesperson video, fabricated statement, AI-generated "leak". Arc: appears → spreads → verification → response and takedown → correction.
- **AI system malfunction or misuse:** harmful or false output to customers, discriminatory results, prompt injection through documents. Arc: complaints → triage → confirm → pause → fix → notify → review.
- **Data poisoning and model tampering:** corrupted training or retrieval data, backdoored model artifacts. Arc: anomaly → investigation → rollback → disclosure.
- **AI vendor or supply chain breach:** vendor notice → scope check → interim controls → customer duties.
- **Service degradation:** monitoring blind spot, expired evaluation pipeline, detector outage.

## 10. Reuse by other domains

AI incidents sit on top of other fields: the **media environment toolkit** (crisis communications, spec 0458) supplies verification tasks, social spread and press; the **corporate governance** epic (#692) supplies materiality and disclosure decisions; the cyber and data center domains supply the incident process and regulatory clocks; financial services, elections, campus, healthcare and municipal profiles list `ai_incidents` as a suggested toolkit.
