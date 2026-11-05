# Spec 0452: Nursing and clinical care, and the clinical care toolkit

Issue: #685 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #684 (clinical systems, spec 0451) · Research: [docs/research/domains/nursing.md](../research/domains/nursing.md)

## Summary

Nurses are in every hospital emergency scenario, and nursing programs may use high-quality simulation for up to half of clinical hours (NCSBN) following the INACSL simulation standards. This epic adds a `nursing` domain (the unit and the classroom view of a hospital, extending the existing `healthcare` profile) and the **clinical care toolkit**: bedside monitor and early warning score figures, lab results, medication administration records, SBAR handoffs, triage tags (START and SALT), staffing grids, evacuation lists and isolation boards. It supports two ways to play with one library of patients and data: **tabletop play** (a facilitated unit surge, evacuation, outbreak or downtime shift) and **unfolding case studies**, in which a patient's story reveals itself in stages and the learner makes a decision at each stage aligned to the NCSBN Clinical Judgment Measurement Model (recognize cues, analyze cues, prioritize hypotheses, generate solutions, take action, evaluate outcomes). Evaluation follows how nursing measures itself: clinical judgment by step, handoff quality, time to escalation, and INACSL-style prebriefing and debriefing. The toolkit is shared: pharmacy (spec 0463), EMS, public health, campus and school nursing can use the same vitals, results and triage products.

## Requirements

### User stories

- As a charge nurse, I want a surge exercise on my unit in which I assign beds and nurses, triage arrivals, and escalate shortages, and see how my choices played out.
- As a nursing faculty member, I want a 45-minute unfolding case study on a deteriorating patient that I can run with a student group, with a prebrief, decisions at each stage and a structured debrief.
- As a hospital nurse educator, I want to turn last quarter's rapid response event into a de-identified case study for orientation.
- As a nurse manager of an ICU, I want to rehearse a vertical evacuation, deciding patient order, equipment and staffing, and see what is left undone.
- As a long-term care director, I want a power and heat failure scenario that tests our checks on residents and our call to the health department.
- As a school of nursing, I want to show an accreditation visitor how scenario objectives, prebriefing, facilitation and debriefing were documented.

### Functional requirements

**Domain**

- **FR-1 Nursing domain.** A `nursing` domain profile that **extends** `healthcare` (inherits roles, outside parties, media and phrasing, adds nothing it can inherit) with the unit-level roles in the dossier (section 2), variants for a hospital nursing unit, a long-term care facility, and a nursing program simulation lab (fictional teaching hospital unit and faculty), and the aliases in the dossier (section 1). A hospital exercise can run `healthcare` and `nursing` together.
- **FR-2 Threat families and arcs.** Scenario families for unit surge and mass casualty, vertical and horizontal evacuation, outbreak on a unit, medication error and disclosure, staffing crisis, active threat on a unit, downtime care, heat and power loss in long-term care, plus a **clinical event** family for case studies (deteriorating patient, fall, workplace violence), each with the arc in dossier section 9 and an inject purpose mix, using extensible families (spec 0448 FR-15).

**Clinical care toolkit: products**

- **FR-3 Products as templates.** Exact, legible templates for the products in dossier section 4: lab results panel with reference ranges and critical flags; medication administration record; SBAR handoff and read-back; triage tag and triage board; staffing grid and assignment sheet; rapid response call record; patient event report and disclosure notes; isolation and cohort board; evacuation priority list and tracking sheet; debriefing guide and learner feedback form. Existing templates (`status_board`, `sitrep`, `ics_201_prefill`, `phone_call`, `downtime_med_admin_form` and the social and press templates) are reused, not rebuilt.
- **FR-4 Format rules.** Lint and generator knowledge: units and reference ranges present and consistent (lab values flagged correctly against the ranges shown), SBAR elements complete or visibly missing, dose and route plausibility checks on scenario medications (flag implausible doses so the generator does not invent them, without presenting itself as a drug reference), triage categories consistent with the findings on the tag, early warning score arithmetic correct for the configured score.

**Clinical care toolkit: figures**

- **FR-5 Instrument figures.** Figure kinds (spec 0448 FR-4) for: bedside monitor display (waveform-style trends for heart rate, blood pressure, respiratory rate, oxygen saturation, temperature, with alarm limits), vital-signs flowsheet (trend table and chart over hours), early warning score chart (parameters, total, trigger, recommended response), lab trend chart, staffing versus demand time series, unit census and bed board, evacuation progress. Each has the text summary and data table of spec 0448 FR-5 and states values numerically; none are AI images, and no waveform is presented as a real patient's.
- **FR-6 Early warning score configuration.** The score is a configuration (parameters, bands, trigger levels, recommended responses) stored as pack data. A neutral default is bundled; a named published score (for example NEWS2 or a pediatric score) is added only after its terms are confirmed (dossier section 3), with the source cited on the chart.

**Clinical care toolkit: data and simulation**

- **FR-7 Patient trajectories.** A simulated patient generator (synthetic names and records, coherent age, history, medications, allergies) with named physiologic **trajectories** (sepsis, hemorrhage, respiratory failure, cardiac event, post-operative deterioration, hypoglycemia) that produce consistent vitals and lab time series; the trajectory has branch points where the learner's actions (reassess, escalate, give a treatment, delay) change the course. Value ranges come from published ranges and the open reference datasets in dossier section 6. All data is labeled simulated.
- **FR-8 Unit and staffing simulation.** For tabletop play, a simple unit model (beds, acuity, nurse-to-patient assignment, arrivals per hour, supplies) keeps census, staffing grid and backlog consistent across injects; the facilitator can see and change its parameters.

**Case study mode and tabletop play**

- **FR-9 Unfolding case study.** A case study is an ordered list of **stages**; each stage shows new patient data (figures and tables from FR-5, a family or provider statement) and one or more **prompts** tagged with a Clinical Judgment Measurement Model step (recognize cues, analyze cues, prioritize hypotheses, generate solutions, take action, evaluate outcomes). Prompt types: select the relevant cues, rank hypotheses, choose actions, short free-text rationale, and evaluate the outcome after an action. The next stage follows from the learner's choices (branching, spec 0430). Cases are authored by hand, imported, or generated from a clinical scenario with the local model and then reviewed by the author; generated cases are never released to learners without the author's review step.
- **FR-10 Keys, scoring and rationale.** Each prompt has a key (acceptable and best answers, with partial credit) and a rationale shown after answering. The score is this app's own scale and is reported per step (FR-14); it makes no claim of equivalence to NCLEX scoring, and the toolkit does not reproduce NCLEX items.
- **FR-11 Individual and group use.** Case studies run for an individual (self-paced), a small group (consensus answers with each member's pre-vote recorded), or a whole class driven by the instructor in Facilitate, with live results using the live-play infrastructure (specs 0406 through 0418) where a class is connected.
- **FR-12 Tabletop decisions.** Structured decisions (spec 0448 FR-14): "Assign nurse" (patient, nurse, ratio), "Call rapid response", "Escalate staffing shortage" (to whom), "Set evacuation order" (ranked patients with reasons), "Triage arrival" (category), "Isolate or cohort", "Request transfer", "Disclose event" and "Notify" (who, what, when). They enter the session log and feed the metrics.
- **FR-13 Simulation education practice.** A prebrief template (objectives, scenario summary, ground rules including confidentiality and psychological safety, orientation to tools and roles), a facilitation guide with cue cards, and a debrief guide (structured phases and questions) follow the structure of the INACSL standards' four cornerstones; the app records that each was done and by whom and exports the record. Standards text is cited, not copied (copyrighted).

**Evaluation**

- **FR-14 Metrics.** Using spec 0448 FR-12 plus clinical care measures: clinical judgment score per step with a profile across the six steps; handoff quality (SBAR completeness and read-back); time to escalation (first abnormal early warning score to the rapid response call; critical lab to provider notification); triage accuracy (under- and over-triage against the scripted key); evacuation order against a priority list; staffing ratio exceedances over time; infection control decisions; disclosure timing against the scenario's target; time to downtime workflows (with spec 0451). Each shows its inputs.
- **FR-15 Core capabilities.** EEGs for Mass Care Services, Public Health Healthcare and EMS, Operational Coordination, Operational Communications and Situational Assessment, with nursing-specific critical tasks.
- **FR-16 Education outputs.** A learner report (steps strong and weak, decisions made, rationale read), a facilitator summary (class patterns by step), and a program record (objectives, prebrief, debrief, hours of simulation) that a program can attach to its own documentation. Hours are counted for the program's use; whether simulation counts toward clinical requirements is set by the program and its state board, which the app does not decide.

**Knowledge and reuse**

- **FR-17 Document library.** A public-domain library pack: AHRQ TeamSTEPPS and CANDOR materials, AHRQ hospital evacuation decision guide, ASPR TRACIE mass casualty triage and evacuation resources, CDC infection control guidance, CMS emergency preparedness interpretive guidance, FEMA healthcare facilities and power outages, with each license and URL verified when building the pack; NCSBN, INACSL and published score documents are named, not bundled.
- **FR-18 Examples.** (1) An unfolding case study: a deteriorating post-operative patient, six stages, with prebrief and debrief. (2) A tabletop: surge of 20 casualties arriving at a med-surg unit during a partial downtime. (3) A tabletop: vertical evacuation of a fictional hospital's NICU and ICU in a hurricane. (4) A long-term care heat and power loss scenario.
- **FR-19 Reuse by other domains.** Suggested toolkits added to `healthcare`, `health_informatics` (spec 0451), pharmacy (spec 0463), public health, campus and K-12 (school nurse), stadium and venue (medical tent), cruise and hospitality (shipboard medical) and EMS and fire (shared triage tags with the MCI toolkit; whichever epic lands first defines the tag templates once).

### Non-functional requirements

- **NFR-1 Cost:** only free public sources; no keys; reference tables bundled.
- **NFR-2 Privacy:** no real patient data. Hospital educators converting an event into a case study use a de-identification step: the app warns on direct identifiers in imported text, offers redaction (spec 0433) and keeps the original out of the shared pack. Learner responses stay local unless the instructor connects a class session; individual learner results are visible to the instructor, which the app states before the learner starts.
- **NFR-3 Accessibility:** every figure has a text summary and data table; alarm states and score bands carry words as well as color; case study mode is keyboard operable and screen-reader usable; time limits are optional and adjustable for accommodations.
- **NFR-4 Accuracy:** clinical content reviewed by nursing faculty and a hospital nurse educator before release (owner to arrange); exercise content is marked and is not clinical guidance; trajectories and ranges cite their source.
- **NFR-5 Psychological safety:** case studies involving patient death, violence or harm to children carry a content notice and an opt-out, and the debrief guide includes a check-in prompt.

### Out of scope

- Clinical decision support for real patients, a drug reference or a medical device simulator.
- Reproducing or predicting NCLEX items or scores.
- Accreditation or board approval of a program's simulation hours.
- Physiologic modeling beyond named trajectories and rule-based branching.
- Real-time connection to monitors or manikins.

## Design

- **Domain:** `packs/domains/nursing.json` with variants as role sets, extending `healthcare` (ADR-0014).
- **Toolkit:** `packs/toolkits/clinical_care/` (toolkit JSON, templates, knowledge fragments, lint configuration, score configurations, trajectory definitions, decision forms, education templates).
- **Figures:** `src/main/render/figures/clinical_care/` (monitor, flowsheet, score chart, lab trend, staffing series, unit board).
- **Case study mode:** a case study is project content of a new kind (`caseStudy`, schema `CaseStudySchema` in `src/shared/schemas/`) with stages, prompts, keys and branches; the player view is a route in the renderer and, for classes, a live-play session mode (specs 0406 through 0418). Scoring is a pure function over answers and keys in `src/main/evaluate/casestudy.ts`.
- **Simulation:** `src/main/toolkits/clinical/trajectory.ts` (named trajectories with branch points; deterministic given a seed) and `src/main/toolkits/clinical/unit.ts` (unit model). The patient generator is shared with spec 0451.
- **Education record:** templates in the HSEEP document set pattern (spec 0420).

## Security and privacy

As spec 0448 plus: no real patient data; imported text scanned for identifiers before it is sent to any provider; class sessions follow the live-play security model (specs 0406 through 0410); learner identifiers are optional and local by default.

## Testing

Golden images for each figure; early warning score tests on worked examples (each parameter band, totals, trigger); lint tests (lab flags, SBAR, triage consistency); trajectory tests (deterministic output, branch points change the course, values stay in plausible ranges); case study scoring tests on worked answer sets (partial credit, per-step profile); unit model tests (census and ratios consistent); accessibility checks on case study mode; example projects generated end to end with the local model before release, with the generated case study held for author review.

## Tasks

1. **#886** Nursing domain profile extending healthcare, variants, threat families and arcs (FR-1, FR-2).
2. **#887** Clinical care templates and format lint (FR-3, FR-4).
3. **#889** Clinical care figures and early warning score configuration (FR-5, FR-6).
4. **#890** Patient trajectories and unit model simulation (FR-7, FR-8).
5. **#891** Case study schema, authoring and generation with author review (FR-9).
6. **#893** Case study player, keys and scoring, individual and group use (FR-10, FR-11).
7. **#894** Tabletop decisions for nursing (FR-12).
8. **#895** Prebrief, facilitation and debrief templates and the education record (FR-13, FR-16).
9. **#896** Metrics and EEGs (FR-14, FR-15).
10. **#897** Document library pack (FR-17).
11. **#898** Examples and reuse in other domains, user guides (FR-18, FR-19).

## Open questions

- **Practitioner review.** Recommendation: nursing faculty with simulation experience and a hospital nurse educator review the templates, trajectories and examples.
- **Named early warning scores.** The NEWS2 chart carries reproduction conditions. Recommendation: ship a neutral configurable score and add NEWS2 only after confirming the Royal College of Physicians' terms.
- **Class sessions and learner data.** Recommendation: instructor-visible results only in connected class sessions, with a clear notice, and local-only otherwise.
- **Case study depth.** Whether to add item types that mirror newer exam formats. Recommendation: keep the five prompt types in FR-9 and review after faculty feedback; do not mimic exam items.
