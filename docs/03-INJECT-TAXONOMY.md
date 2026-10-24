# 03 — Inject Taxonomy

Every inject carries the common envelope (see `05-DATA-MODEL.md`): `id` (`I-07`, `I-07b` for side injects), `time` (exercise clock `H:MM`), `phase`, `from`, `to` (target role), `purposeTag`, `expectedAction`, `instructorNote`, `deliveryMode` (hand-to-role, display-on-main-screen, play-audio, read-aloud), and 0..n `assets`.

## Purpose tags (from Scenario 3)

| Tag | Meaning | Example |
|---|---|---|
| `CORE_NARRATIVE` | Advances the main storyline | I-06 FIDS board shows "Flight 666 to Purgatory" |
| `NOISE` | Distraction unrelated to the incident; tests triage | I-02a vending machines spitting cans |
| `RED_HERRING` | Plausible but false lead; drains resources | I-05b parking deck fire alarm |
| `PRESSURE` | External stakeholder demands a response now | I-12 Channel 5 "going live in 15 minutes" |
| `MISINFORMATION` | Rumor the PIO must counter | I-06b "ISIS has the tower" Facebook post |
| `CLUE` | Forensic/attribution breadcrumb | I-08b intern admits phishing click |
| `TECH_HURDLE` | Recovery complication | I-14b backup tape not mounted |
| `DECISION_POINT` | Forces a high-consequence call | I-09 authorize FIDS shutdown ("Go Dark") |
| `OPERATIONAL_FRICTION` | Tenant/partner conflict | I-13b airline threatens to pull staff |
| `CONFUSION` | Physical-security side effect | I-10b TSA stops screening |
| `TIME_JUMP` | Facilitator control card | "It is now 10:00. 20% of flights wrong." |
| `STARTEX` / `ENDEX` | Exercise boundaries | — |

## Inject types

Each type = fields + default render (template vs. AI vs. audio) + export behavior. `T` = HTML template → PNG/PDF. `AI` = ComfyUI image/video. `TTS` = ComfyUI/other voice. Composite types combine (AI photo dropped into a tweet template).

### Social media
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `tweet` | handle, displayName, avatarStyle, text, timestampRel, metrics{replies,reposts,likes,views}, attachedImageBrief?, verified? | T (+AI for attached image) | X/Twitter dark & light variants; thread variant |
| `facebook_post` | groupName, authorName, text, shares, reactions, comments[]?, attachedImageBrief? | T (+AI) | Public group / personal profile variants |
| `instagram_post` | handle, caption, likes, imageBrief | T + AI | |
| `tiktok_video_card` | handle, caption, viewCount, thumbnailBrief, videoBrief? | T + AI/video | Still card by default; optional short clip |
| `reddit_post` | subreddit, title, body, upvotes, commentCount | T | |
| `social_video` | platform, caption, videoBrief, durationSec | AI video | Shaky-phone footage style |

### News & press
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `press_release` | org, dateline, headline, subhead, body, mediaContact, boilerplate | T (PDF) | Also used as *expected player output* template |
| `news_chyron_still` | station, headline, lowerThird, anchorBrief, liveBadge | T + AI | Looks like a TV screenshot |
| `news_article` | outlet, headline, byline, dek, body, heroImageBrief | T + AI | Web article mockup |
| `media_inquiry_phone_slip` | to, from(outlet, desk), time, message, deadline | T | "WHILE YOU WERE OUT" slip |
| `reporter_email` | outlet, reporterName, subject, body, deadline | T | |

### Internal communications
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `email` | from, to, cc, subject, body, attachments[], headersVisible? | T | Outlook-like |
| `email_forward` | wraps `email` with forwarder note | T | I-08b |
| `memo` | from, to, subject, urgency, body, signatureBlock | T (PDF) | I-07 BHS memo |
| `helpdesk_ticket` | ticketNo, priority, requester, subject, description, status, assignee | T | I-02a |
| `chat_transcript` | platform(Teams/Slack/SMS), participants, messages[{sender,time,text}] | T | |
| `text_message` | fromLabel, bubbles[] | T | Phone screenshot style |
| `voicemail` | caller, durationSec, transcript, voiceStyle | TTS (+T transcript card) | |

### Voice & radio
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `radio_call` | channel, callsign, transcript, background(ramp/terminal/vehicle), voiceStyle | TTS + T transcript | Add radio squelch/compression post-processing |
| `phone_call` | caller, callee, transcript (dialogue), voiceStyles | TTS multi-voice + T transcript | SimCell can also read aloud |
| `pa_announcement` | text, voiceStyle(robotic/human), terminalAmbience | TTS | I-06 "Flight 666 boarding at all gates" |
| `911_cad_entry` | time, caller, location, narrative | T | |

### Technical evidence
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `system_log` | systemName, host, ip, os, lines[{ts,level,msg}] | T (mono) | I-09 AODB SQL log |
| `siem_alert` | product, severity, rule, source, dest, details | T | |
| `console_dump` | prompt, commands[], output | T (mono) | |
| `error_dialog` | os, title, message, buttons | T | I-14b tape library |
| `network_diagram` | mermaid source | T (render mermaid) | ASP Appendix D style |
| `email_header_analysis` | raw headers, highlights[] | T | phishing CLUE |
| `ransom_note` | text, wallet, timer, style | T | |
| `screenshot_generic` | appName, windowTitle, imageBrief | AI or T | |
| `service_status_page` | orgName, serviceName, overallStatus, incidentTitle, components[{name,status}], updates[{status,time,text}] | T | Public status page; variant `site_banner` puts the outage banner on the org's own site or portal (#324) |
| `leak_site_post` | siteName, victimName, victimDomain, dataSize, deadline, countdown, status, description, fileList[{name,size}] | T | Ransomware data-leak site listing with countdown (#324) |
| `security_advisory` | publisher, advisoryId, title, tlp, released, severity, cves[], affectedProducts[], summary, iocs[], mitigations[] | T (PDF) | CISA / ISAC advisory with TLP 2.0 marking; variant `vendor` for a PSIRT advisory (#324) |
| `hl7_interface_monitor` | engine, site, clock, interfaces[{name,direction,source,destination,messageType,status,queueDepth,lastMessage,error}], alerts[] | T | Interface engine dashboard with stalled HL7 feeds. **Healthcare only**, in the healthcare pack (#331) |
| `election_results_page` | jurisdiction, electionName, lastUpdated, url, precinctsReporting, contests[{name,choices[{name,party,votes,percent}]}], pageStatus, banner | T | Election night results site; variants `official`, `spoofed` (lookalike copy). **Elections only**, in the elections pack (#331) |

### Operational displays & physical
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `fids_board` | rows[{flight,dest,time,gate,status}], anomalies[], boardStyle | T | I-06; mark bad rows. **Airport only** (`domains: ['airport']`) |
| `bhs_scada_screen` | belts[], alarms[], state | T | **Airport only** |
| `info_display_board` | boardTitle, siteName, clock, rows[{primary,secondary,time,position,status,remarks,anomaly}], ticker | T | Generic passenger/customer information display; variants `airport` (departures), `transit_bus` (bay arrivals), `rail` (platform) |
| `scada_hmi` | systemName, site, state, mode, equipment[{tag,kind,state,value,units,setpoint}], readings[], alarms[] | T | Generic process HMI; variants `water`, `water_chemical`, `water_distribution`, `dam`, `power`, `transit_traction` (the model picks one through `variant` in its inject_text reply). A wrong value is not highlighted |
| `uas_detection_alert` | systemName, site, tracks[{id,remoteIdSerial,altitudeFt,distanceM,operatorLocation,zone,threatLevel}], zones[], events[] | T | Counter-UAS / Remote ID console with an inline-SVG radar; no external tiles |
| `avl_fleet_map` | systemName, agency, routes[], vehicles[{id,route,status,lastReport,x,y}], alerts[] | T | Transit dispatch AVL map drawn with inline SVG |
| `incident_alert_notification` | sender, headline, body, issuedAt, areaAffected, instructions[], severity | T | Mass notification as received; variants `wea`, `sms`, `email`, `siren_pa` |
| `pacs_alarm_panel` | doors[], alarms[] | T | |
| `cctv_still` | camera, timestamp, sceneBrief | AI + T overlay | Timestamp/camera-ID overlay via template |
| `scene_photo` | sceneBrief, style(phone/press), caption, credit | AI + T | I-10 crowded terminal, blank screens; photo framed by the `scene_photo` template (phone or press variant) |
| `map_annotation` | baseMapAsset, markers[], labels[] | T over image | Uses project's terminal map |
| `signage_photo` | text, placement | AI + T | Whiteboard at gate, etc. |
| `alarm_summary` | systemName, site, clock, operator, counts, alarms[{time,priority,tag,source,description,value,state}] | T | Alarm list of a DCS, NOC or BMS console; variants `dark`, `light` (#324) |
| `nws_weather_warning` | office, product, issued, warningFor[], until, at, hazard, source, impact, locations[], actions[] | T (mono) | National Weather Service warning text product (#324) |
| `notam` | notamNumber, facility, location, effectiveStart, effectiveEnd, text, tfr{type,reason,radiusNm,floor,ceiling,restrictions[]} | T | NOTAM text or TFR detail; variants `text`, `tfr`. **Airport, stadium and unmanned systems** (#324) |
| `rider_service_alert` | agency, routes[{id,mode}], effect, cause, headline, description, activePeriod, alternatives[] | T | Rider alert (GTFS-Realtime cause / effect); variants `web`, `app`. **Transit only**, in the transit pack (#324) |
| `gcs_telemetry_screen` | aircraft{id,type}, mode, altitudeAgl, groundSpeed, battery, gnss{satellites,hdop,fix}, link{rssi,quality}, warnings[], messages[] | T | UAS ground control station screen. **Unmanned systems only**, in the unmanned systems pack (#331) |
| `track_bulletin` | railroad, subdivision, number, date, issuedTo, items[{type,limits,restriction}], dispatcher, okTime | T (PDF) | Track bulletin or track warrant (neutral form); variants `bulletin`, `warrant`. **Freight rail only**, in the freight rail pack (#331) |

### Documents & forms
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `official_letter` | letterhead, to, from, body | T (PDF) | FBI, TSA, insurer letters |
| `regulatory_notice` | agency, type(SD/EA/NOTAM), text | T | |
| `ics_201_prefill` | incidentName, situationSummary, objectives, orgChart | T (PDF, FEMA layout) | Blank version for players |
| `ics_203_prefill` | assignments | T (PDF) | |
| `status_board` | resources[{name,status,notes}] | T | Player briefing resource table |
| `sitrep` | number, time, summary, actions | T | |
| `field_report` | organization, reportNo, date, location, inspector, reportType, summary, findings[{item,condition,notes}], actionsTaken[], recommendations[] | T (PDF) | Field / inspection / patrol report |
| `ics_213_general_message` | incidentName, to, from, subject, date, time, message, approvedBy, reply | T (PDF, FEMA layout) | Blank version for players (#324) |
| `ics_214_activity_log` | incidentName, opPeriod, name, icsPosition, homeAgency, resources[], entries[{time,activity}] | T (PDF, FEMA layout) | Blank version for players (#324) |
| `chain_of_custody_form` | org, caseNo, items[{itemNo,description,serial}], collectedBy, collectedAt, location, transfers[{dateTime,releasedBy,receivedBy,purpose}] | T (PDF) | Evidence, election material, downed UAS (#324). Long lists continue on continuation sheets (#331) |
| `regulatory_report_form` | agency, formName, reportType, reportId, submittedAt, organization, sections[{heading,items[{label,value}]}], narrative | T (PDF) | Filed incident report: OE-417, NRC, NORS, PHMSA, CIRCIA, FAA 107.9, bank notice (#324). Long reports print on several pages (#331) |
| `lab_result_report` | labName, client, sampleId, sampleLocation, sampledAt, reportedAt, results[{analyte,result,units,limit,method,flag}], comments | T (PDF) | Certified lab report / certificate of analysis (#324) |
| `breach_notification_letter` | org, date, recipientName, whatHappened, whatInformation, whatWeAreDoing, whatYouCanDo, forMoreInformation, signerName | T (PDF) | Model-form breach notice to individuals (#324) |
| `downtime_notice` | org, systemName, status, startedAt, expectedRestore, affected[], procedures[], contact | T (PDF) | EHR / MES / SIS downtime notice; variants `unplanned`, `planned` (#324) |
| `boil_water_notice` | utility, pwsId, noticeType, issuedAt, affectedArea, whatHappened, whatToDo[], whatIsBeingDone, expectedResolution, contact | T (PDF) | EPA Tier 1 public notice; variants `boil_water`, `do_not_drink`. **Water utility, public health, municipal** (#324) |
| `wire_transfer_request` | org, requestNo, requestedAt, amount, beneficiary{name,bank,aba,account}, purpose, initiatedBy, approvals[], callback | T (PDF) | Outgoing wire request or vendor bank change request (BEC); variants `wire_request`, `vendor_bank_change` (#331) |
| `sds_excerpt` | product, supplier, signalWord, pictograms[], hazardStatements[], ingredients[], firstAid, properties[], exposureLimits[] | T (PDF) | Safety Data Sheet, sections 1–4, 8, 9 (#331) |
| `emergency_declaration` | jurisdiction, declarationNo, issuedAt, whereas[], declaration, powers[], effective, expires, signer | T (PDF) | Local declaration of emergency (#331) |
| `reunification_notice` | org, site, headline, issuedAt, situation, reunificationSite, steps[], bring[], contact | T (PDF) | Family reunification notice; variant `card` for the request / release card (#331) |
| `msib_cotp_order` | sector, number, issuedAt, subject, marsecLevel, portCondition, body, restrictions[], effective, until, poc, signer | T (PDF) | USCG Marine Safety Information Bulletin or Captain of the Port order; variants `msib`, `cotp_order`. **Port and maritime only**, in the port pack (#331) |

### Facilitator control
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `startex_card` | exerciseTime, weather, load, status | T | |
| `time_jump_card` | newTime, narration, worldState[] | T | |
| `scenario_update` | narration | T | Read aloud |
| `endex_card` | resolution, transition to hot wash | T | |
| `simcell_script` | role being played, hard questions[], concessions[] | T (handbook only) | "Agent Smith: do you have a PCAP?" |

## Domain tags (ADR-0014)

An inject type may carry `domains: ['airport', …]` in `src/shared/taxonomy.ts`. A tagged type is offered only to projects whose domain profile has one of those ids: the MSEL prompt lists the domain's types (the profile's preferred types first), and `chooseInjectType` treats a tagged type as unavailable elsewhere and follows the fallback chain to the generic equivalent (`fids_board` → `info_display_board`, `bhs_scada_screen` → `scada_hmi`). Untagged types belong to every domain.

## Types from packs and user templates (ADR-0018)

`INJECT_TYPES` in `src/shared/taxonomy.ts` is the built-in list. A template in the user layer (`userData/templates/injects/<type>/`) or in an enabled pack whose type is not built in joins the taxonomy through the `taxonomy` block of its `meta.json` (`category`, `render`, `defaultDelivery`, optional `domains` and `paper`; a user template without the block joins as a hand-to-role document). Main registers these with `registerInjectTypes` (`src/main/render/template-registry.ts`) at startup and after every pack change; `injectTypeInfo`, `injectTypes()`, `injectTypesForDomain`, `chooseInjectType` and the prompts' taxonomy variables read the registry, so domain tags apply to pack types too. The renderer keeps its own copy from `templates:taxonomy` and refetches on `templates:changed`. A registered type never replaces a built-in entry: a pack template that shadows a built-in type keeps the built-in taxonomy. A project's own templates (including copies of pack templates kept after the pack is uninstalled) are listed by `templates:taxonomy { projectPath }`, and an inject's stored `type` is any type id (`^[a-z0-9_]+$`) so such injects keep loading.

## Rendering rules

1. Text that players must read exactly (handles, flight numbers, IPs, timestamps) is **always** template-rendered. AI imagery is backgrounds, people, places, screens-from-a-distance.
2. Every template ships `schema.json` (zod-compatible), `preview.json`, and renders in `templates/injects/<type>/` at 2× scale; export to PNG and, for paper types, PDF.
3. Templates accept project branding (org name, logo, airline names, city) via a `brand` object so NCIA/Akron/Cleveland references aren't hard-coded.
4. Audio: 44.1 kHz WAV master + MP3; optional post-FX chain (radio band-pass, phone compression, terminal ambience bed) defined in the type.
5. Video: ≤ 15 s default, 720p, H.264 MP4; always also produce a poster PNG for the deck.
6. Each asset records provenance: provider, model, workflow hash, prompt, seed — so it can be regenerated.

## Minimum viable set for M2

`tweet`, `facebook_post`, `helpdesk_ticket`, `email_forward`, `memo`, `radio_call` (transcript only), `media_inquiry_phone_slip`, `system_log`, `error_dialog`, `fids_board`, `startex_card`, `time_jump_card`, `endex_card`, `ics_201_prefill`. These reproduce every inject in `reference/scenario-3/master-inject-deck.md` except the AI photos.
