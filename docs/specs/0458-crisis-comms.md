# Spec 0458: Crisis communications and journalism — and the media environment toolkit

Issue: #691 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/crisis_comms.md](../research/domains/crisis_comms.md)

## Summary

Action Stations can exercise the people who tell the public what is happening and the people who decide what is true enough to print: corporate and agency communications teams, Public Information Officers working in a joint information center, press offices facing hostile questions, and newsrooms covering breaking news with unverified reports and manipulated media. The same capability ships as the **media environment toolkit**, which every other domain can add: a simulated news cycle (wire alerts, articles, broadcast segments), social feeds whose spread and sentiment change over time, reporter calls and press conference questions, and verification tasks with provenance clues. It builds on the social and news templates that already exist and on the engagement growth of the facilitator tools (spec 0428). Players are scored on what communications teams are scored on: time to a holding statement, accuracy and consistency, corrections, and verification before publication.

## Requirements

### User stories

- As a communications director, I want a data breach exercise where reporters call, a rumor spreads and legal wants to delay, so my team practices the holding statement under pressure.
- As a lead PIO, I want a joint information center exercise where three agencies must give the same message and correct a false rumor.
- As a news director, I want a breaking-news desk exercise with a viral video of uncertain origin, so editors practice verifying before publishing and correcting afterward.
- As a spokesperson, I want to rehearse a press conference with hostile and off-topic questions and see which of my answers contradicted the fact sheet.
- As an airport (or utility, or hospital) exercise designer, I want realistic news coverage and social media reaction in my scenario without building a communications exercise.
- As a journalism instructor, I want students to verify, hold, publish and correct stories under deadline (with the classroom capability, spec 0453).

### Functional requirements

**Domain**

- **FR-1 Crisis communications domain.** A `crisis_comms` domain profile with the roles, systems, outside parties, media channels and phrasing in the research dossier (sections 2–3), with variants for an organizational communications team, a joint information center, a newsroom and a press office; aliases as listed.
- **FR-2 Threat families and arcs.** Organizational crisis, disaster public information, information disorder (viral misinformation, impersonation, hacked official account, manipulated media), newsroom breaking news, and a **service degradation** family for the communications function (compromised social account, alert system outage, unavailable spokesperson), each with the phase arc in the dossier (section 9), using extensible families (spec 0448 FR-15).

**Media environment toolkit**

- **FR-3 Toolkit definition.** A `media_environment` toolkit (spec 0448 FR-1) with outside parties (reporters, wire service, local TV, fact-checkers, platform trust and safety, the public), optional advisor roles a domain can add (for example "Media relations liaison"), generator knowledge (news cycle timing, deadline conventions, quoting and attribution style, correction practice, holding statement structure, CERC principles), decision forms (FR-8), metrics (FR-9) and lint rules (FR-4). It is added to the suggested toolkits of every domain profile (FR-14) and is proposed by the generator when a brief mentions media, press, social media, rumor, misinformation or a viral post.

**Products**

- **FR-4 Templates and format rules.** New exact, legible templates: holding statement, full statement, message map and Q&A, media advisory, correction or retraction notice, wire alert (flash, bulletin, update) in a fictional wire service's style, broadcast rundown and segment script, live blog and push alert variants of the news article, social listening report, verification note, JIC briefing schedule. Existing templates (tweet, facebook_post, instagram_post, reddit_post, tiktok_video_card, news_article, news_chyron_still, press_release, reporter_email, media_inquiry_phone_slip, voicemail, service_status_page, cap_alert, eas_broadcast, sitrep) are reused, not copied. Lint rules check: every attributed claim has a source, dates and times are consistent with the exercise clock, a correction names what was wrong and what is right, a holding statement contains what is known, what is not known and what is being done, and outlets, handles and people are fictional (naming rule; no real outlet or person is impersonated).
- **FR-5 News cycle simulation.** A deterministic, seeded model of how coverage develops: given a trigger event time, severity and visibility, it schedules the pickup of the story by fictional outlets with deadlines (a wire flash within minutes, local TV at the next hour, a web article, a morning print edition), calls and emails from reporters at plausible times, and follow-up stories that react to what the player's organization said or failed to say. The schedule becomes inject proposals the generator writes up (headlines, ledes, quotes) and the facilitator can adjust. Everything is labeled simulated.
- **FR-6 Social spread and sentiment.** Simulated engagement and sentiment curves for the scenario's social posts, building on the engagement fields of spec 0428: given a seed, a post's reach, a spread rate and a peak, the counters (views, reposts, replies, likes) grow along the curve as exercise time passes; replies and quote posts are drafted by the generator with a controlled mix (supportive, skeptical, hostile, false claims, jokes). A player's response changes the curve by documented parameters (a timely correction reduces further growth of the false claim by a fraction; a late one reduces it less; silence changes nothing). The spread and sentiment appear as figures (spec 0448 FR-4) and a social listening report (volume, sentiment mix, top narratives), each with a text summary and data table. The parameters are simple and explained to the facilitator; the toolkit does not claim to predict real spread.
- **FR-7 Verification tasks.** A verification task is an inject (a photo, a video card, a screenshot, an account, a document) with a hidden ground truth (authentic, misattributed, manipulated, synthetic, satire, unverifiable) and a set of **provenance clues** the players can request, each costing exercise time: reverse image result, metadata and file properties, geolocation clues, account history, first-appearance timeline, original-source contact, and credential check. The credential check reports Content Credentials (C2PA) as present and valid, present and invalid, or absent, with the rule shown to players that absence proves nothing and a valid credential says who signed, not that the content is true. Players record a verdict (verified, false, unverified, hold) and a confidence, which the verification metric scores. Clue data for each task is authored (by the generator, edited by the facilitator) and is plain text and template figures; no real person's image or voice is used.

**Exercise play**

- **FR-8 Communications decisions.** Structured decisions (spec 0448 FR-14): issue holding statement (channel, approver, text), approve release (who approved), respond to reporter (on the record, background, decline, no comment; the call or email it answers), issue correction (what, channel), schedule press conference, escalate to legal or the executive, request a platform takedown or label, hold or publish (newsroom), request a second source. Available to players in live play and to the facilitator in Facilitate; each decision is time-stamped and linked to the inject it answers.

**Evaluation**

- **FR-9 Metrics.** From the decision log and the scenario's ground truth: **time to holding statement** from the first public signal (decision timing with a configurable window, spec 0448 FR-12); **accuracy and consistency** (message consistency, spec 0448 FR-12, plus a fact check of each statement against the scenario's fact sheet, evaluator-scored with generator help and shown with its inputs); **corrections** (errors found, corrections issued, time from discovery to correction); **reporter handling** (queries answered before the stated deadline, share answered); **verification before publication** (published items with a recorded verification step, false items published, false items correctly held, time from receipt to verdict). The AAR shows each metric with its inputs and the caveat that they are discussion aids.
- **FR-10 Core capabilities.** EEGs for Public Information and Warning, Operational Communications and Situational Assessment with critical tasks specific to communications (for example "issue a holding statement within the time in the communications plan", "coordinate messages across agencies before release", "correct a false statement through the channel it spread on"), and the citation of the organization's own communications plan when it is in the project.

**Data**

- **FR-11 Optional calibration data.** The toolkit can, with consent and a size estimate (spec 0448 FR-8), fetch the shape of real coverage of a past event from GDELT (news volume and tone over time, open for any use with a citation) to calibrate the news cycle model's volume curve, and cite it in the case data provenance. Real news text, accounts and people from the archive are not placed in injects. Community Notes public data may be added after its terms are confirmed. Both connectors are optional; the simulated models work without them.

**Knowledge and reuse**

- **FR-12 Document library.** A public-domain library pack: the CDC CERC manual, FEMA NIMS public information and JIC guidance, the FCC's Hawaii false alert Report and Recommendations as a communications case study (verified public domain), and example JIC and public information plans; the SPJ Code of Ethics and the Verification Handbook are linked, not bundled. Each license and URL is verified when the pack is built.
- **FR-13 Examples.** (1) A fictional manufacturer's data breach: holding statement, reporters, a rumor, an 8-K coordination with legal (using the cyber and regulatory clock content). (2) A joint information center for a fictional coastal county's hurricane using the weather toolkit (spec 0449). (3) A fictional regional newsroom handling a viral video of uncertain origin (shared with the AI incidents epic, spec 0467).
- **FR-14 Reuse by other domains.** `media_environment` added to the suggested toolkits of every existing domain profile (airport, campus, chemical, commercial facilities, data center, elections, emergency communications, energy utility, financial services, food and agriculture, freight rail, gas pipeline, healthcare, industrial, K–12, municipal, port and maritime, public health, stadium and venue, telecom, transit, unmanned systems, water and dam, water utility, meteorology and geoscience), and as a built-in for the field epics that follow.

### Non-functional requirements

- **NFR-1 Cost:** only free public data; no accounts or keys; the simulators run on the computer.
- **NFR-2 Privacy and naming:** the optional connectors contact their hosts only when the user fetches data and send nothing about the user's plans; every outlet, handle, reporter and spokesperson is fictional; the generator is told never to imitate a real outlet's branding or a real person (project naming rule).
- **NFR-3 Accessibility:** every social and news figure has a text summary and a data table; sentiment colors are paired with labels; screenshots of posts carry alt text; templates meet the contrast rules of the template library.
- **NFR-4 Accuracy and tone:** formats checked against AP-style and wire conventions in a review by a communications director and a newsroom editor before release (owner to arrange); the simulators are labeled as teaching models.
- **NFR-5 Safety:** misinformation injects are clearly exercise material in every export; no injected false claim is about a real person, a real organization, or a real ongoing event.

### Out of scope

- Posting to real social platforms, sending real press releases or emailing real reporters.
- Predicting real-world virality or sentiment; live social media monitoring.
- Image or video generation of real people; deepfake generation is covered with safeguards in spec 0467.
- Legal advice on disclosure; clocks come from the regulatory clocks feature (spec 0426).

## Design

- **Domain:** `packs/domains/crisis_comms.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/media_environment/` (toolkit JSON, templates, knowledge fragments, lint rule configuration, verification task examples).
- **Templates:** `templates/injects/{holding_statement,message_map,media_advisory,correction_notice,wire_alert,broadcast_rundown,verification_note,jic_schedule}/` plus variants for `news_article`; each with `meta.json`, `schema.json`, golden images.
- **Simulation:** `src/main/toolkits/media/simulate.ts` (seeded news cycle schedule and social spread curves), pure functions with fixtures; spread curves use a simple logistic growth with a response modifier. Engagement writes through the existing engagement fields (spec 0428 `src/shared/facilitator/engagement.ts`).
- **Figures:** `src/main/render/figures/media/` (spread and sentiment time series, narrative bar chart, listening summary, coverage timeline) using the generic kinds of spec 0448 where possible.
- **Verification tasks:** task schema in the toolkit (`ground_truth`, `clues[]` with cost and text, `credential_status`); a live-play frame for requesting a clue and answering a verdict.
- **Metrics:** `src/main/evaluation/metrics/{holding_statement_time,statement_accuracy,corrections,reporter_handling,verification}.ts` building on decision timing and message consistency (spec 0448).
- **Connectors:** `src/main/toolkits/connectors/{gdelt,community_notes}.ts` with estimate, fetch and recorded-response tests; fixed hosts.

## Security and privacy

As spec 0448: fixed hosts per connector, size limits, files only in the scenario folder, consent before fetching. Generated text is sanitized like other injects; reporter and spokesperson names are fictional, and the linter flags names of real outlets and real public figures from a maintained list. Verification clue text never includes working links to real sites.

## Testing

Golden images for each new template and figure; simulation tests (the same seed gives the same schedule; a timely correction reduces later growth; counters never decrease); lint tests for correction notices, holding statements and attribution; metric tests on worked examples (holding statement time with and without a window; verification scoring with a false item published); verification task tests (clue costs, credential status wording); connector contract tests with recorded responses and opt-in live tests; example projects generated end to end with the local model before release.

## Tasks

1. **#743** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#745** Media environment toolkit definition, knowledge and suggested toolkit for every domain (FR-3, FR-14).
3. **#747** New communications templates (FR-4).
4. **#748** News cycle simulator (FR-5).
5. **#749** Social spread and sentiment simulation and figures (FR-6).
6. **#750** Verification tasks and provenance clue sets (FR-7).
7. **#751** Communications decisions (FR-8).
8. **#752** Metrics and core capabilities (FR-9, FR-10).
9. **#754** Optional calibration data connectors (FR-11).
10. **#755** Document library (FR-12).
11. **#756** Examples and reuse in other domains, user guides (FR-13, FR-14).

## Open questions

- **Practitioner review.** Recommendation: a communications director (corporate or public information) and a newsroom editor review the templates, simulators and examples before release.
- **Spread model.** Whether a logistic curve with response modifiers is enough, or whether instructors want the curve shape editable. Recommendation: ship the simple model with a visible, editable peak and rate.
- **Community Notes data.** Terms and format not confirmed this session; recommendation: confirm before building the connector, or drop it.
- **Real outlet list for the linter.** Recommendation: a short built-in list of the largest national outlets and wire services, plus project-level additions.
