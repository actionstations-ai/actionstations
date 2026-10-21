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

### Operational displays & physical
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `fids_board` | rows[{flight,dest,time,gate,status}], anomalies[], boardStyle | T | I-06; mark bad rows |
| `bhs_scada_screen` | belts[], alarms[], state | T | |
| `pacs_alarm_panel` | doors[], alarms[] | T | |
| `cctv_still` | camera, timestamp, sceneBrief | AI + T overlay | Timestamp/camera-ID overlay via template |
| `scene_photo` | sceneBrief, style(phone/press/cctv) | AI | I-10 crowded terminal, blank screens |
| `map_annotation` | baseMapAsset, markers[], labels[] | T over image | Uses project's terminal map |
| `signage_photo` | text, placement | AI + T | Whiteboard at gate, etc. |

### Documents & forms
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `official_letter` | letterhead, to, from, body | T (PDF) | FBI, TSA, insurer letters |
| `regulatory_notice` | agency, type(SD/EA/NOTAM), text | T | |
| `ics_201_prefill` | incidentName, situationSummary, objectives, orgChart | T (PDF, FEMA layout) | Blank version for players |
| `ics_203_prefill` | assignments | T (PDF) | |
| `status_board` | resources[{name,status,notes}] | T | Player briefing resource table |
| `sitrep` | number, time, summary, actions | T | |

### Facilitator control
| Type | Key fields | Render | Notes |
|---|---|---|---|
| `startex_card` | exerciseTime, weather, load, status | T | |
| `time_jump_card` | newTime, narration, worldState[] | T | |
| `scenario_update` | narration | T | Read aloud |
| `endex_card` | resolution, transition to hot wash | T | |
| `simcell_script` | role being played, hard questions[], concessions[] | T (handbook only) | "Agent Smith: do you have a PCAP?" |

## Rendering rules

1. Text that players must read exactly (handles, flight numbers, IPs, timestamps) is **always** template-rendered. AI imagery is backgrounds, people, places, screens-from-a-distance.
2. Every template ships `schema.json` (zod-compatible), `preview.json`, and renders in `templates/injects/<type>/` at 2× scale; export to PNG and, for paper types, PDF.
3. Templates accept project branding (org name, logo, airline names, city) via a `brand` object so NCIA/Akron/Cleveland references aren't hard-coded.
4. Audio: 44.1 kHz WAV master + MP3; optional post-FX chain (radio band-pass, phone compression, terminal ambience bed) defined in the type.
5. Video: ≤ 15 s default, 720p, H.264 MP4; always also produce a poster PNG for the deck.
6. Each asset records provenance: provider, model, workflow hash, prompt, seed — so it can be regenerated.

## Minimum viable set for M2

`tweet`, `facebook_post`, `helpdesk_ticket`, `email_forward`, `memo`, `radio_call` (transcript only), `media_inquiry_phone_slip`, `system_log`, `error_dialog`, `fids_board`, `startex_card`, `time_jump_card`, `endex_card`, `ics_201_prefill`. These reproduce every inject in `reference/scenario-3/master-inject-deck.md` except the AI photos.
