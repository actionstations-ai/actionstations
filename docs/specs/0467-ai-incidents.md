# Spec 0467: AI incidents and synthetic media — and the AI incidents toolkit

Issue: #700 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #691 (crisis communications, spec 0458), #692 (corporate governance), spec 0426 (regulatory clocks) · Research: [docs/research/domains/ai_incidents.md](../research/domains/ai_incidents.md)

## Summary

Action Stations can exercise the teams that face the two new incident types of the AI era: **synthetic media attacks** (a deepfaked executive on a video call authorizing a payment, a fake spokesperson video, synthetic misinformation about the organization) and **AI system incidents** (a model giving harmful output to customers, data poisoning, an AI vendor breach). The field has new reporting duties, for example the EU AI Act's serious incident reporting for providers of high-risk AI systems, and the clocks run differently from cyber and privacy clocks. The exercise gives security, fraud, trust and safety, communications, legal and AI governance teams, and boards, the documents and evidence of such an incident, the verification clues that decide whether a media item is real, and the clocks that start when they decide. Players are scored on time to detect synthetic media, payments stopped and disclosures on time. The spec reuses the media environment toolkit of spec 0458 (verification, social spread, press) and the regulatory clocks of spec 0426 instead of duplicating them.

## Requirements

### User stories

- As a treasury manager, I want to be on a video call where the CFO asks me for an urgent transfer, so that I practice the call-back on a known number instead of complying.
- As a fraud investigator, I want to see how fast the team gets the recall request to the bank after the fraud is discovered, and what it recovered.
- As an AI governance lead, I want an exercise where our customer-facing assistant gives harmful advice, so that we decide whether it is a serious incident, pause the feature, and know which clocks started.
- As a general counsel, I want the exercise to show which disclosure duties apply and which do not (a deepfake attack on us is a fraud incident; an incident in a high-risk AI system we provide may carry a regulator report), so the team does not file the wrong thing or miss the right one.
- As a communications director, I want a fake spokesperson video in the feed and a reporter asking about it, so that we verify before we respond.
- As a board member, I want a short tabletop that shows what the board decides in the first hour of an AI incident.

### Functional requirements

**Domain**

- **FR-1 AI incidents domain.** An `ai_incidents` domain profile with the roles, systems, outside parties, media channels and phrasing in the research dossier (sections 2–3), with variants for an enterprise security and fraud team, an AI governance and product team (an organization that provides or deploys AI systems), a trust and safety team on a platform, and a board; aliases as listed.
- **FR-2 Threat families and arcs.** Synthetic impersonation fraud, synthetic media about the organization, AI system malfunction or misuse, data poisoning and model tampering, AI vendor or supply chain breach, and a shared **service degradation** family (monitoring blind spot, expired evaluation pipeline, detector outage), each with the phase arc in the dossier (section 9), using extensible families (spec 0448 FR-15).

**AI incidents toolkit**

- **FR-3 Toolkit definition and knowledge.** An `ai_incidents` toolkit (spec 0448 FR-1) with outside parties (bank, payment processor, platform trust and safety, market surveillance authority, data protection authority, AI vendor, law enforcement), optional advisor roles (for example "AI governance advisor"), document references, decision forms (FR-7), metrics (FR-9), lint rules (FR-4) and generator knowledge: how deepfake lures work, why detectors are probabilistic, why out-of-band verification works, what a serious incident is under the EU AI Act, which clocks apply to whom, and the scope point that duties differ between a provider of a high-risk system, a deployer, and a victim of fraud. It composes with `media_environment` (spec 0458, which supplies verification tasks and press), the cyber content of the data center and IT domain, and the corporate governance epic. It is proposed by the generator when a brief mentions deepfake, synthetic media, voice cloning, chatbot, model, AI vendor or AI-generated content.

**Products and figures**

- **FR-4 Templates and format rules.** New exact, legible templates: model incident report, AI system inventory entry, serious incident notification draft (fields follow the Commission's draft reporting template where public, including a field for parallel sectoral reports), customer notice, regulator notice, public statement (drawing on the crisis communications products), platform takedown request, bank payment recall request, vendor incident notice, vendor questionnaire. Existing templates (wire_transfer_request, voicemail, phone_call, text_message, chat_transcript, email, email_header_analysis, siem_alert, breach_notification_letter, regulatory_notice, regulatory_report_form) are reused. Lint rules: a serious incident draft states the system, the date of awareness, the causal link assessment, the harm and the status; a notice never states a clock that does not match the scenario's configured clock; the classification of an event as an AI incident follows the scenario's chosen jurisdiction rules; all organizations, vendors, people and bank names are fictional (naming rule).
- **FR-5 Figures.** Figure kinds (spec 0448 FR-4): evaluation series with drift and threshold (harmful-output rate over time), moderation queue volume, detector score distribution with a stated uncertainty and the false positive and false negative counts, payment and approval timeline, and an AI system inventory table; plus the generic kinds. Each has a text summary and a data table. Figures draw only from simulated case data labeled as such (FR-6 of spec 0448 applies: no AI pixels for charts).

**Synthetic media**

- **FR-6 Synthetic media injects with safeguards.** The scene content of a deepfake inject (a voicemail, an audio clip, a video meeting still or short clip) may be produced by the configured voice and video providers, because it is photographic or audio scene content (project rule 5), under these safeguards: (a) voices and faces are **fictional** and generated from a prompt, never cloned from or modeled on a real person, and never a public figure; (b) every item is labeled as exercise material in its metadata, in the packet, and visibly in the facilitator view, and exports carry a marking in the filename and a header page; (c) the items stay in the project and are excluded from public pack exports; (d) critical information (amounts, account numbers, instructions) is carried by template text (the payment request, the chat side-channel) rather than by synthesized audio alone; (e) the verification clue set (spec 0458 FR-7) says whether a credential is present, valid, invalid or absent, with a detector score shown with uncertainty and the rule that a detector can be wrong. Where no media provider is configured, a transcript or a described still stands in.

**Exercise play**

- **FR-7 Structured decisions.** Decision forms (spec 0448 FR-14): hold or release a payment (amount, reason), verify by callback on a known number (who, result), declare an AI incident (type, severity), classify as a serious incident (yes, no, undecided, basis), pause or disable a feature or model (kill switch, rollback to a version), preserve evidence (logs, model version, prompts, data), notify a regulator, notify customers, notify the bank and law enforcement, issue a statement, request a takedown, notify the vendor. Available to players in live play and to the facilitator in Facilitate; each decision is time-stamped and feeds the metrics.
- **FR-8 Regulatory clocks.** The clock set of spec 0426 gains AI incident clocks, each with its trigger and a short plain explanation: the EU AI Act Article 73 clocks (15 days from awareness, 2 days for the widespread or critical infrastructure kinds, 10 days for a death; an initial incomplete report allowed; for providers of high-risk AI systems), SEC Form 8-K Item 1.05 (four business days after determining materiality), and a pointer to the privacy clocks already in spec 0426. Clocks are configured per scenario (jurisdiction, role as provider, deployer or victim); the application dates of the AI Act are data in the clock definition, with the source and the date checked, because they changed in 2026 (Regulation (EU) 2026/1744) and may change again. The app does not give legal advice and says which of the organization's own plans the user should check.

**Evaluation**

- **FR-9 Metrics.** **Time to detect synthetic media:** from the first exposure to the first flag and to the formal declaration (decision timing, spec 0448 FR-12). **Payments stopped:** value and count held or recalled against those attempted, time from instruction to hold, and use of the callback. **Disclosures on time:** each configured clock met or missed with its trigger and the time of the decision. **Containment:** time from detection to kill switch or rollback, and whether evidence was preserved first. **Verification before response** (from spec 0458). The AAR shows each metric with its inputs and the caveat that they are discussion aids.
- **FR-10 Core capabilities.** EEGs for Cybersecurity, Public Information and Warning, Operational Coordination and Intelligence and Information Sharing with critical tasks specific to the field (for example "verify a payment instruction by a callback on an independently held number", "preserve model and prompt logs before changing the system", "decide whether the event meets the serious incident definition and record the basis"), citing the organization's own AI incident and fraud procedures when they are in the project.

**Knowledge and reuse**

- **FR-11 Document library.** A public-domain library pack: the NIST AI Risk Management Framework and the Generative AI Profile, the FinCEN deepfake alert, the FCC ruling on AI voices in robocalls, FBI IC3 public service announcements on AI impersonation, and CISA material on synthetic media where it exists; the EU AI Act is linked to the Official Journal text and not copied; the AI Incident Database is linked, not bundled. Each license and URL is verified when the pack is built.
- **FR-12 Examples.** (1) A fictional manufacturer's finance team receives a deepfaked video meeting and a series of urgent transfers (modeled on public reports of such fraud, with fictional names, amounts and banks). (2) A fictional retailer's customer-facing assistant gives harmful advice; the team decides whether it is a serious incident, with the clocks for a provider in the EU and for a deployer. (3) A fake spokesperson video reaches a fictional regional newsroom (shared with spec 0458).
- **FR-13 Reuse by other domains.** `ai_incidents` added to the suggested toolkits of financial services, elections, campus, healthcare, municipal, emergency communications, telecom and data center and IT; crisis communications and corporate governance reuse the exercises.

### Non-functional requirements

- **NFR-1 Cost:** no new paid services; media providers are the ones the user already configured; the simulators run locally.
- **NFR-2 Privacy and safety:** no real person's face or voice is used or cloned; no real organization is impersonated; synthetic items never leave the project except in a marked export; nothing about the user's plans is sent to any service other than the configured providers (project rule 3).
- **NFR-3 Accessibility:** every audio or video inject has a transcript and a text description; figures have summaries and tables; detector scores are shown in words with the number.
- **NFR-4 Accuracy:** the regulatory content is checked against the legal text on the date of building the pack and shows its source and date; a review by an AI governance lead and a fraud investigator before release (owner to arrange), and a compliance specialist's check of the clock rules.
- **NFR-5 Currency:** clock definitions carry a "checked on" date and the source; the app warns when a clock definition is older than twelve months.

### Out of scope

- Generating deepfakes of real people, or tools that make synthetic media easier to produce outside exercises.
- Running or evaluating a real detector model; the detector in the exercise is a simulated score.
- Red-teaming a real AI system, or testing a real organization's controls.
- Legal advice, or filing anything with a regulator.

## Design

- **Domain:** `packs/domains/ai_incidents.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/ai_incidents/` (toolkit JSON, templates, knowledge fragments, lint rule configuration, clock definitions as data for spec 0426).
- **Templates:** `templates/injects/{model_incident_report,ai_inventory_entry,serious_incident_notice,takedown_request,payment_recall_request,vendor_incident_notice}/` with golden images.
- **Figures:** `src/main/render/figures/ai/` (drift series, queue volume, detector distribution, payment timeline).
- **Simulation:** `src/main/toolkits/ai/simulate.ts` (evaluation series with a changepoint, queue volumes, detector scores with overlapping classes so errors exist, payment timelines).
- **Media safeguards:** a `synthetic: true` flag and marking on inject media records; the exporter adds the header page and filename marking; the pack exporter refuses flagged media; the generator prompt rules forbid real names and likenesses; the media prompt builder rejects prompts that name a real person from the maintained list.
- **Clocks:** AI clock definitions under `src/shared/regulatory/clocks/ai.ts` (or as pack data) with `sourceUrl` and `checkedOn`.
- **Metrics:** `src/main/evaluation/metrics/{time_to_detect,payments_stopped,disclosures_on_time,containment}.ts` over decision timing and threshold timing (spec 0448).

## Security and privacy

As specs 0448 and 0458. Synthetic items are marked in metadata and exports; provider calls follow the existing provider network rules, and the preview and redaction of spec 0433 applies before any scenario text that could contain real names goes to a cloud provider. Payment and account details in injects are fictional and fail validation if they match real bank identifier formats of a configured allow list of test values.

## Testing

Golden images for each new template and figure; clock tests (15, 2 and 10 day counts from awareness; four business days from a materiality decision, with weekends; the "checked on" warning); lint tests for notification drafts; simulation tests (detector scores have overlapping classes, drift changepoint is detectable); metric tests on worked examples (payments stopped with partial recall); safeguard tests (flagged media excluded from pack export, real-name prompt rejected, markings present); example projects generated end to end with the local model before release.

## Tasks

1. **#758** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#760** AI incidents toolkit definition and generator knowledge (FR-3).
3. **#763** AI incident templates (FR-4).
4. **#766** AI incident figures (FR-5).
5. **#769** Synthetic media injects with exercise safeguards (FR-6).
6. **#773** Structured decisions for AI incidents (FR-7).
7. **#777** Regulatory clocks for AI incidents (FR-8).
8. **#781** Metrics and core capabilities (FR-9, FR-10).
9. **#785** Document library (FR-11).
10. **#788** Examples and reuse in other domains, user guides (FR-12, FR-13).

## Open questions

- **Which regime applies.** Article 73 binds providers of high-risk AI systems; most exercising organizations are deployers or fraud victims. Recommendation: the scenario asks the role (provider, deployer, victim) and the clocks follow it; a compliance specialist reviews the explanations.
- **Application dates.** The Digital Omnibus changed the AI Act's dates in 2026; secondary sources disagree on some. Recommendation: confirm against the consolidated text before building the clock definitions, and store the dates as data. Confirmed against the Official Journal on 2026-11-05 (#1102): Regulation (EU) 2026/1744, Article 1(40)(b), sets 2 December 2027 (Annex III) and 2 August 2028 (Annex I) for Chapter III, Sections 1 to 3; Article 73 keeps the general date, 2 August 2026.
- **Commission guidance status.** The draft Article 73 guidance and template (September 2025) may have been finalized; recommendation: check when the templates are built.
- **Practitioner review.** An AI governance lead and a fraud investigator review the templates, safeguards and examples before release.
- **Synthetic media providers.** Whether to ship deepfake-style audio and video at all in the first release. Recommendation: first release uses transcripts and described stills; synthesized fictional voices follow once the safeguards in FR-6 are built and tested.
