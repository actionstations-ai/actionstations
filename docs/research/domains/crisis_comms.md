# Domain dossier: `crisis_comms` (crisis communications and journalism)

Research for the crisis communications epic (#691, spec 0458) and the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session (found in secondary summaries or from general knowledge).

## 1. Scope

**Covers:** teams whose job is to tell the public, the press and stakeholders what is happening during a crisis, and teams whose job is to find out what is true before they publish: corporate and agency communications and public affairs teams, Public Information Officers (PIOs) and joint information centers (JICs), newsrooms and journalism and communications programs.

It is also the **media environment toolkit** that every other domain reuses: the news cycle, social spread and verification that surround any incident.

**Exercise types this domain needs:**

- **Organizational crisis:** a breach, product recall or executive misconduct; the communications team writes the holding statement, clears messages with legal and executives, answers reporters and corrects errors.
- **Joint information center in a disaster:** several agencies' PIOs produce consistent, coordinated messages for the public.
- **Viral misinformation:** a false claim spreads; the team decides whether, when and how to respond.
- **Press conference under hostile questions:** preparation and live questioning.
- **Newsroom breaking-news desk:** unverified reports, user-generated video and manipulated media arrive under deadline; editors verify, hold or publish, and correct.
- **Social media and rumor control** during any incident.

**Aliases:** communications, comms, public affairs, public information, PIO, JIC, JIS, media relations, press office, spokesperson, newsroom, news desk, journalism, reporter, editor, social media team, crisis communications, risk communication.

## 2. Organization and roles

**Communications team (organization):**

| Title                                    | Abbrev. | What they decide                                                                                              |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| Communications / public affairs director | COMMS   | Strategy, message approval route, who speaks, when to hold a press conference                                 |
| Spokesperson                             | SPOKES  | Delivers statements and answers questions; says what is known, unknown and being done                         |
| Media relations lead                     | MEDIA   | Returns reporter calls, tracks deadlines, offers background or declines                                       |
| Social media manager                     | SOCIAL  | Posts and replies, monitors sentiment and false claims, requests platform takedowns                           |
| Content / writer                         | WRITER  | Drafts holding statements, Q&A, news releases, internal notes                                                 |
| Legal counsel                            | LEGAL   | Reviews statements for liability and disclosure duties                                                        |
| Executive / incident commander (outside) | EXEC    | Approves release; PIOs do not release incident information on their own authority **[U: FEMA ICS reference]** |
| Customer service / call center lead      | CS      | Scripts and escalation for inbound calls                                                                      |

**Joint information center (government):** Lead PIO, PIOs from each agency, a social media/monitoring team, a rumor control cell, a media briefing coordinator, a writer, and liaison to the incident commander or EOC. FEMA describes the Joint Information System (JIS) as the NIMS structure that integrates incident information and public affairs, the JIC as the physical or virtual facility where JIS work happens (standalone, part of an EOC, or virtual), and the PIO cycle as gathering, verifying, coordinating and disseminating information **[U: FEMA NIMS PIO guidance as seen in search summaries; the PDF returned 403 this session]**.

**Newsroom:**

| Title                            | Abbrev. | What they decide                                                        |
| -------------------------------- | ------- | ----------------------------------------------------------------------- |
| News director / executive editor | ED      | What runs, standards for publishing unverified information, corrections |
| Assignment editor / desk editor  | DESK    | Dispatches reporters, triages incoming tips and user-generated content  |
| Reporter                         | REP     | Gathers facts, calls sources, files copy                                |
| Social/verification editor       | VERIF   | Checks provenance of photos, video and accounts                         |
| Producer (broadcast)             | PROD    | Rundown, live shots, graphics, what goes to air                         |
| Digital producer                 | DIGI    | Web updates, push alerts, live blog                                     |
| Standards editor / ombudsman     | STD     | Corrections, ethics questions                                           |

**Outside parties:** reporters from other outlets, wire services, social platforms' trust and safety teams, fact-checking organizations, the public, elected officials, regulators, customers, employees and, in every other domain's exercise, the organization's own communications staff.

## 3. Systems

- **Social platforms** (microblogs, photo and video feeds, forums, messaging), **social listening** and **media monitoring** tools, **wire services**, **news websites and push alerts**, **broadcast rundown and graphics systems**, **newsroom content management systems**, **press briefing rooms and livestreams**, **mass notification and alerting** (IPAWS/WEA/EAS and campus alerts, covered by the existing CAP and EAS templates), **status pages**, **email and SMS lists**, **call center scripts**.
- **Verification tools:** reverse image search, metadata and EXIF inspection, geolocation by landmarks and shadows, account history review, archive lookups, and **Content Credentials (C2PA)**. A C2PA manifest is a set of provenance information made of assertions, one claim and a signature; a hard binding of cryptographic hashes lets a validator check that the manifest belongs to the asset and that the asset was not modified; validation addresses whether the data is well formed, associated with the asset and untampered, and the trust model rests on the signer's identity, not on proof that the claims are true **[V: C2PA Technical Specification 2.0, spec.c2pa.org; which version is current was not settled this session]**. Implication: a missing credential proves nothing, and a valid one says who signed, not that the content is true.

## 4. Products (what injects look like)

Existing templates in `templates/injects/` that this field builds on **[V: repo]**: `tweet` (with replies, reposts, likes, views), `facebook_post`, `instagram_post`, `reddit_post`, `tiktok_video_card`, `news_article`, `news_chyron_still`, `press_release`, `reporter_email`, `media_inquiry_phone_slip`, `voicemail`, `text_message`, `chat_transcript`, `email_header_analysis`, `leak_site_post`, `service_status_page`, `cap_alert`, `eas_broadcast`, `pa_announcement`, `breach_notification_letter`, `boil_water_notice`, `reunification_notice`, `rider_service_alert`, `sitrep`. The facilitator tools already grow likes, shares and replies over time on these (spec 0428).

| Product                                                     | From              | Status / render                                                |
| ----------------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| Holding statement; full statement                           | comms team        | new text template                                              |
| Message map / Q&A document (key messages, hard questions)   | comms team        | new text template                                              |
| Media advisory (press conference notice)                    | comms team        | new text template                                              |
| News release                                                | comms team        | exists (`press_release`)                                       |
| Correction / retraction notice                              | newsroom, comms   | new text template                                              |
| Wire alert (flash, bulletin, update) in wire-service style  | wire              | new text template (fictional wire name)                        |
| Broadcast rundown and segment script                        | producer          | new text template                                              |
| News site article, live blog, push alert                    | newsroom          | exists (`news_article`); live blog and push alert variants new |
| Social post, thread, reply storm, video card                | public            | exists                                                         |
| Social listening report (volume, sentiment, top narratives) | monitoring        | new figure/table                                               |
| Reporter call slip and email                                | reporters         | exists                                                         |
| Verification note (what was checked, result, confidence)    | verification desk | new text template                                              |
| Press conference question list; hostile question script     | SimCell           | knowledge + SimCell script (exists)                            |
| JIC status board and briefing schedule                      | JIC               | exists (`status_board`, `sitrep`) plus schedule variant        |

## 5. Doctrine, standards and documents

- **CDC Crisis and Emergency Risk Communication (CERC):** six principles (be first, be right, be credible, express empathy, promote action, show respect); the manual was first published in 2002 with a 2012 edition **[U: from CDC-hosted documents in search summaries; the manual PDF exceeded the fetch limit this session]**. A US federal work, so a public domain candidate **[U: confirm license on the document]**.
- **NIMS public information doctrine:** JIS, JIC, PIO functions, release authority **[U: see section 2]**. FEMA NIMS PIO guidance (December 2020) is a public domain candidate.
- **SEC Form 8-K Item 1.05** requires a public company to disclose a material cybersecurity incident within four business days of determining it is material (the clock starts at the materiality determination, not at discovery), with a national-security delay possible by the Attorney General's finding **[U: SEC final rule 33-11216 and staff guidance as seen in search summaries]**. Communications must coordinate with legal on this clock (see the regulatory clocks spec 0426).
- **Journalism ethics:** the Society of Professional Journalists' Code of Ethics asks journalists to verify information before releasing it, to use original sources where possible, and to update and correct throughout a story's life; it is voluntary and has no enforcement. SPJ published a proposed revision (August 2026) that would require verifying the provenance and authenticity of information and sources, in part for AI-generated content; adoption was not confirmed **[U: spj.org search summaries]**. Linked, not bundled (copyrighted).
- **Verification Handbook** (European Journalism Centre; third edition "For Disinformation and Media Manipulation", edited by Craig Silverman) is free online; the 2014 edition covered user-generated content in emergencies **[U: search summaries]**. Linked, not bundled unless its license permits.
- **HSEEP Core Capabilities:** Public Information and Warning, Operational Communications, Situational Assessment **[V: used in the repo's EEG model, spec 0421]**.

## 6. Real events and after-action lessons

- **Hawaii false ballistic missile alert, 13 January 2018 [V: FCC Report and Recommendations, April 2018].** A live alert went out at 8:07 a.m.; a cancellation of the alert message was sent at 8:13; HI-EMA's first public correction was a post on its Twitter account at 8:20 ("NO missile threat to Hawaii"); the correction through the alert systems (a Civil Emergency Message) came at 8:45, 38 minutes after the false alert. The FCC found the agency had no standard procedures for correcting a false alert and recommended safeguards; a cancellation does not send an all-clear or recall messages already displayed. Use: time-to-correction, channel choice and who may issue a correction are exercisable decisions.
- **AP Twitter account hack, 23 April 2013 [U: press reports].** A false tweet claimed explosions at the White House; the Dow fell about 143 points and recovered; the White House denied it. Use: verification before amplification, and impersonation of a trusted source.
- **Boston Marathon bombings, April 2013 [U].** Analysis of Boston Police use of Twitter and Facebook found it corrected misinformation passed to the media and that success relied on trust built earlier; major outlets reported incorrect information in the first hours. Use: speed against accuracy, and correction practice.

## 7. Data sources (free, public)

| Data                                              | Source                                  | Notes                                                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| News volume and tone over time for any past event | GDELT Project                           | Terms: unlimited and unrestricted use for academic, commercial or government purposes, with a citation and link back to GDELT **[U: gdeltproject.org/about via search summary; update cadence unclear]** |
| Fact-check dynamics (notes and ratings)           | X Community Notes public data downloads | Described as open by design **[U: official download page not opened; terms to confirm]**                                                                                                                 |
| Timelines of real communications failures         | FCC reports, state after-action reports | Public domain US government documents (Hawaii report **[V]**)                                                                                                                                            |

There is no free source of social posts for replay that is clearly licensed for this use; simulated social data is the main path (spec 0458 FR-6). Real accounts, outlets and people are never reproduced; exercises use fictional outlets, handles and spokespeople (naming rule).

## 8. Evaluation (how the field scores itself)

- **Time to first holding statement** from the first public signal; CERC's "be first" and the Hawaii timeline illustrate the value of a pre-approved correction path.
- **Accuracy and consistency:** statements agree with the facts known at the time and with one another across spokespeople, channels and agencies (the message-consistency metric of spec 0448 FR-12).
- **Corrections:** errors found, corrections issued, time from discovery to correction, channel used.
- **Reporter handling:** calls and emails returned before deadline, "no comment" avoided where a fact could be given, background versus on-record discipline.
- **Verification before publication (newsroom):** the share of published items with a documented verification step; time from receipt to verdict; false items published; false items correctly held.
- **Sentiment and spread:** instructor/facilitator view of how the simulated narrative moved after each action (a simulation output, not a field standard).

## 9. Threat families and scenario arcs

- **Organizational crisis:** breach, recall, accident, misconduct, labor action. Arc: first signal → internal confirmation → holding statement → stakeholder notifications → press questions → updates and corrections → recovery and reputation.
- **Disaster public information (JIC):** arc: event → JIC activation → first release → rumor control → briefings → recovery messages.
- **Information disorder:** viral misinformation, impersonation, manipulated media, hacked official account. Arc: appears → spreads → decision to respond → correction → residual belief.
- **Newsroom breaking news:** arc: tip or video → triage → verification → publish/hold → updates → correction.
- **Service degradation of the communications function:** social account compromised, alert system outage, spokesperson unavailable, press conference disrupted.

## 10. Reuse by other domains

Every exercise has a media environment: the airport's outage trends on social media, the utility's outage map draws reporters, the hospital's cyber incident reaches the press. The **media environment toolkit** supplies the news cycle, social spread, reporter calls and verification tasks to all domains; each domain profile lists it as a suggested toolkit. It is reused directly by the AI incidents epic (#700, spec 0467: synthetic media verification), elections (misinformation), emergency communications, municipal, campus, K–12 schools, healthcare, financial services, public health, stadium and venue, and the corporate governance epic (#692).

## Expert review (2026-11-11)

Model-led expert review from the point of view of a crisis communications director and former newsroom editor. It is not a review by a licensed or employed practitioner.

**Checked:** the crisis communications domain (roles, threat families and their guidance), the media environment toolkit (glossary, product conventions, realism rules, decision forms, measures), the news cycle simulator, the holding statement, press release, wire alert and social post templates and their preview data, the lint rules, and the media environment user guide.

**Sources:** CDC Crisis and Emergency Risk Communication (the six principles: be first, be right, be credible, express empathy, promote action, show respect); FEMA NIMS Joint Information System and the PIO cycle; FCC report on the 2018 Hawaii false alert (correction through the channel the error used); news agency practice for alert priorities (a flash kept for the gravest news, a bulletin as the usual first alert, then urgent items and write-throughs); AP style datelines (Ohio is never abbreviated); C2PA Technical Specification 2.3 (trust rests on the signer's identity; a manifest shows who signed and that the asset is unchanged, not that it is true).

**Changed:**

- The news cycle opened every story above the smallest with a wire flash. A wire desk keeps a flash for the gravest news; an incident at a fictional company opens with a bulletin. The simulator now schedules a bulletin and then an update, and a flash only for a severity 5 national story. The glossary, the product convention and the wire alert schema say the same, and the user guide describes the new schedule.
- The wire alert preview showed an URGENT priority line under a FLASH header, a lower priority than the level. The priority line is removed from that preview, the schema says never to put a lower priority under the level, and the flash golden was regenerated.
- The disaster public information arc told the generator to use only fictional agencies and a fictional county. A joint information center works with real public agencies; the guidance now keeps the exercising organization, its people and the outlets fictional and lets real cities and public agencies appear in their real roles, never with a real person's name or words.

**Defaults set:** time to holding statement window of 60 minutes (kept: it matches the first-hour target common in crisis plans and CERC's "be first"); holding statement under 150 words (kept).

**Caveats:** the airport press release preview attributes a quote to "the Airport Director" without a name, which reads oddly in a release; it belongs to the airport field and was left alone. Social post counters never fall in the spread model, a simplification the guide states.
