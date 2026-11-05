# Spec 0453: Classroom and course use — learning outcomes, rubrics and grading

Issue: #686 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/classroom.md](../research/domains/classroom.md)

## Summary

Instructors in every field can run any exercise as a class session. They map exercise objectives to course and program learning outcomes, score students with rubrics per role from what evaluators observed, what each student decided and what they said in the hot wash, collect reflections, export grades to the gradebook as CSV, and see attainment, reliability and participation across sections. Students rotate through roles over a term, practice before a graded run, and take make-up versions. Accommodations apply per student. Classroom is cross-cutting, not a domain or a toolkit: it is a setting that any project can turn on. It is built on the evaluation guides (spec 0421), surveys (spec 0422) and live play, and it keeps every student record on the instructor's computer.

One design tension is settled here on purpose: today's evaluation model says ratings are discussion aids "never grades of people" and observations never name a player. Classroom mode is an explicit, opt-in exception for named students, recorded in an ADR (FR-1), and it never changes the default for ordinary exercises.

## Requirements

### User stories

- As an emergency management instructor, I want each student's role in the exercise scored against a rubric tied to my course outcomes, so that I can grade the session without separate paperwork.
- As a cybersecurity instructor, I want students to rotate through incident commander, communications lead, analyst and evaluator over the term, so that each one practices every role once.
- As a teaching assistant, I want to record an observation against one student and one rubric criterion in a few taps while the exercise is running.
- As a student, I want a practice run that does not count, and a report afterward showing my scores with the evidence behind them.
- As an instructor with a student approved for extended time, I want the clock, the packet and the response method adjusted for that student without announcing it to the class.
- As a program chair, I want to compare outcome attainment between the three sections that ran the same exercise.
- As an instructor, I want to upload the scores to our LMS gradebook without retyping them.

### Functional requirements

**Course set-up and attribution**

- **FR-1 Classroom mode.** A project setting **Classroom** (off by default) adds a course (name, term), sections, and a roster of students per section (typed, pasted or imported from a CSV; fields: a display name, an optional institution student identifier, an optional email; nothing else). In a session the instructor assigns students to seats (spec 0418 seats); attribution of decisions, observations and contributions to a student is only on in Classroom mode and is shown only to instructors and teaching assistants. Turning Classroom mode on records an ADR-backed notice in the project ("scores name students; ratings become grades only when the instructor confirms them"). Outside Classroom mode, the rule in `src/shared/schemas/evaluation.ts` (no observation names a player) is unchanged. Rosters and scores live in the project folder and are excluded from shared exports, exercise bundles and pack exports by default (FR-12).
- **FR-2 Learning outcomes.** A course has learning outcomes (code, text, optional Bloom level, optional program outcome code it supports). Exercise objectives, Core Capabilities and critical tasks of the evaluation guide (spec 0421) map to outcomes many-to-many; the mapping is shown beside the objectives and edited in the scenario's Objectives tab. The generator can propose a mapping from the outcome text and the objectives, as a suggestion the instructor confirms. Outcome sets can be saved and reused across terms, and imported or exported as JSON.

**Rubrics, evidence and scoring**

- **FR-3 Rubrics per role.** A rubric belongs to a role (or "team") and has criteria with a weight, and 3 to 6 levels each with a descriptor and points. Criteria link to outcomes (FR-2) and optionally to critical tasks. Bundled starter rubrics are original works (communication, decision quality, role clarity, use of plans, coordination, situational awareness, evaluator observation quality); rubrics from other institutions are not bundled when their license forbids it (the AAC&U VALUE rubrics are CC BY-NC-SA 4.0 and need AAC&U's written permission for commercial software uses, so they are named and linked, not shipped). Rubrics export and import as JSON and print as a PDF handout.
- **FR-4 Evidence capture.** Three kinds of evidence attach to a student and a criterion: (a) **evaluator observations**, an extension of the evaluator form (spec 0421/#416) with a student picker, a criterion, a level and a note, on a device or in Facilitate; (b) **decisions**, where each structured decision or message a player sends (specs 0418, 0448 FR-14) is recorded against the seat's student and can be linked to a criterion by the instructor afterward; (c) **hot wash contributions**, tallied in Facilitate with one tap per contribution per student (count and a short note), never auto-attributed from the audio transcription (spec 0425), which stays unattributed. Evidence keeps its time in exercise time and links to the inject it responds to.
- **FR-5 Scoring.** A student's score per criterion is chosen by the instructor or TA from the rubric levels, with a suggestion computed from the evidence (a rule-based roll-up: highest level supported by at least two pieces of evidence, or one if only one exists, shown with its basis; no model decides a grade). Team criteria give every team member the team score unless overridden. Weighted totals, outcome scores and the final points per student are computed; every score shows the evidence it rests on and the instructor's override and comment. A student score report (PDF, FR-4 evidence quoted) can be generated per student.
- **FR-6 Reflection prompts.** After the hot wash, each student answers 2 to 5 reflection prompts (defaults: what decision would you change, what did your role depend on from others, how does this connect to the course outcome; instructor-editable, bundled in the survey template set of spec 0422). Reflections are collected through live play, a QR page or a printed sheet, are attributed to the student only in Classroom mode, and can be scored with a reflection rubric (FR-3). Reflections never go to a cloud model without the preview and redaction of spec 0433.

**Rotation and variants**

- **FR-7 Rotation, make-ups and practice.** A **rotation plan** assigns students to roles across the sessions of a term so that each student plays each required role once (a simple assignment algorithm with the constraints "every role covered each session" and "no repeated role until all others played"), editable by hand. A **make-up version** regenerates an exercise with the same objectives, mapped outcomes, rubrics and difficulty but different facts, names and inject content, using the normal generation stages with the objectives and outcome mapping held fixed (the variant is a new scenario in the same project). A **practice run** is a session flagged ungraded: evidence is collected for the student's own report but writes nothing to the gradebook export or the dashboard.

**Export and integration**

- **FR-8 Gradebook CSV export.** Export a section's scores as CSV: one row per student, columns for the student identifier (as imported), the points per assignment column and optional per-outcome and per-criterion columns; a generic layout plus one named layout per supported LMS, each verified against that LMS's current import rules when built (a task per LMS, verified before shipping). The export previews on screen and warns about students without a score, practice runs excluded, and identifiers missing. Only scores and, if chosen, short comments leave the app; nothing is sent over the network.
- **FR-9 LTI 1.3 (later step).** A feasibility spike decides whether grade passback by LTI 1.3 with Assignment and Grade Services (1EdTech, Final Release 2019: Line Item, Score and Result services; OpenID Connect launch, OAuth 2.0 client assertion, HTTPS) can fit a local-first desktop app. The constraint: the LMS must reach a registered tool over public HTTPS, and a desktop app has no public endpoint. The spike compares (a) staying with CSV, (b) a small instructor-run relay or a hosted tool that holds only the grade payload for one launch (needs a hosting and privacy review and an ADR; project rules on cost and no telemetry apply), and (c) 1EdTech OneRoster CSV import and export. No LTI code ships before the ADR is accepted.

**Dashboard and metrics**

- **FR-10 Instructor dashboard.** A Classroom view across sections and sessions: outcome attainment (share of students at or above the instructor's threshold level, per outcome, per section, per term), score distributions, role coverage in the rotation, practice versus graded runs, missing evidence, and students with no score yet. Tables have text equivalents and CSV export.
- **FR-11 Accommodations.** Per student, private to the instructor: extended time (a multiplier applied to that student's timed responses and to individual prompts, not the shared clock), an alternate response method (written instead of spoken, or the reverse), screen-reader packet or large print by default, breaks, a quieter role (observer or evaluator with equivalent rubric), and a free-text note. The record stores adjustments, not diagnoses, and never appears in shared files, the AAR, or the dashboard beyond a count. Applied accommodations are listed to the instructor at session set-up so they are not forgotten; a student's approved adjustment is applied as written, not generalized to the class.
- **FR-12 Privacy of student records.** Student names, identifiers, scores, reflections and accommodations are stored in the project folder (not in the exercise bundle, packs, the program folder or backups meant for sharing), excluded from anything sent to a model unless the preview and redaction of spec 0433 pseudonymizes them, and deletable per student or per term in one action. The app never offers to send student records to a service.
- **FR-13 Reliability and equity metrics.** (a) **Outcome attainment** per student, section and term. (b) **Rubric reliability**: when two or more evaluators rate the same student and criterion, show percent exact agreement, percent within one level, weighted Cohen's kappa for two raters and intraclass correlation for three or more, with the number of paired ratings, and list the criteria with lowest agreement. (c) **Participation equity**: each student's share of decisions, messages and hot wash contributions against an even share, shown as a plain bar chart and a count of students below half the even share; labeled an instructor aid, never a grade input unless the instructor links it to a criterion. Statistics have worked-example tests; the app states that small samples make these numbers unstable.

**Knowledge and reuse**

- **FR-14 Document library, examples and guides.** A public-domain library pack for teaching exercises (HSEEP, FEMA Emergency Management Institute independent study material, CISA tabletop packages, with the license and URL of each verified when the pack is built) and original instructor guides: choosing outcomes, writing rubrics, rotating roles, fair grading of a group exercise, accommodations, FERPA basics. Examples: (1) an emergency management course sequence of four exercises with role rotation; (2) a cybersecurity incident response course where students rotate and one acts as evaluator, graded on observation quality; (3) a journalism verification lab using the crisis communications toolkit (spec 0458).
- **FR-15 Reuse.** Classroom mode is available in every domain and with every toolkit. The Classroom setting is added to the project wizard and to each domain's guide page; micro-tabletops (spec 0437) can run as practice runs; the corrective-action program (spec 0424) is not used for students.

### Non-functional requirements

- **NFR-1 Cost:** no accounts, no paid service; LTI relay (if ever) must be free to run or the instructor's own (project rule 1 and ADR on hosting).
- **NFR-2 Privacy:** local-only student records (FR-12); no telemetry; no student data in model prompts without pseudonymization; FERPA treats grades as education records held by the institution, so exports are the instructor's act, and the app says so on the export screen.
- **NFR-3 Accessibility:** every screen meets WCAG AA; rubric entry works by keyboard; the observation form is usable on a phone with large touch targets; dashboard charts have text tables; accommodations include screen-reader packets and extended time.
- **NFR-4 Fairness and accuracy:** no automated grade is final; scores are the instructor's, with the evidence shown; a second-evaluator check is offered for high-stakes assessments; rule-based suggestions are explained. Review by two instructors from different fields before release (owner to arrange).
- **NFR-5 Limits:** up to 500 students per project and 20 sections; evidence and notes use the same caps as the evaluation schema (spec 0421).

### Out of scope

- A learning management system, an online assignment platform or plagiarism checking.
- Automatic grading by a model; model-written feedback sent to students without the instructor's review.
- Proctoring, identity verification or surveillance of students.
- LTI code before the ADR in FR-9 (the spike is in scope).
- Accreditation reporting formats (outcome tables export as CSV; formats for specific accreditors can follow).

## Design

- **Schemas:** `src/shared/schemas/classroom.ts` (zod): `Course`, `Section`, `Student` (display name, optional institution id, optional email), `Outcome`, `OutcomeMapping`, `Rubric`, `RubricCriterion`, `RubricLevel`, `Evidence` (kind, studentId, criterionId, level, note, time, injectRef), `ScoreEntry`, `Accommodation`, `RotationPlan`. Stored in `classroom/` inside the project folder, not in the scenario files that go into exercise bundles. Forward compatible (ADR-0016).
- **Observation extension:** `Observation` in `src/shared/schemas/evaluation.ts` gains an optional `studentId` allowed only when the project has Classroom mode on; the schema refinement rejects it otherwise, so the existing rule holds by default.
- **Scoring and metrics:** `src/shared/classroom/{scoring,rotation,reliability,equity}.ts`, pure functions with worked-example tests. Weighted kappa and ICC implemented with documented formulas.
- **Capture UI:** the evaluator form (live play) and Facilitate gain a student picker and a one-tap hot wash tally; a Classroom route in the renderer for rosters, rubrics, scoring and the dashboard (`src/renderer/src/routes/classroom/`).
- **Export:** `src/main/export/gradebook-csv.ts` with layouts as data files; report PDFs through the existing render path (spec 0448 figures for the dashboard charts).
- **Packs:** starter rubrics and outcome sets as pack content (`packs/classroom/`), data only (ADR-0018).
- **ADRs:** (1) Named-student attribution in Classroom mode. (2) LTI feasibility (FR-9).

## Security and privacy

Student records never leave the project folder except through an explicit export the instructor starts; exports have a preview; CSV cells beginning with `=`, `+`, `-` or `@` are escaped to prevent spreadsheet formula injection; reflection and evidence text is sanitized like other user text; live-play devices see only their own seat's reflection form, never other students' evidence; delete-per-student removes evidence, scores and accommodations together. The roster import validates size and columns and discards unknown columns.

## Testing

Schema tests (the refinement that blocks `studentId` outside Classroom mode); scoring tests on worked examples (suggested level from evidence, weighted totals, overrides, team scores); rotation tests (every role covered, no repeats until all played, impossible constraints reported); reliability tests against textbook kappa and ICC examples; equity tests; CSV export golden files per layout including formula-injection escaping; privacy tests that rosters are absent from exercise bundles and pack exports; accessibility tests for the capture UI; an end-to-end example class generated before release.

## Tasks

1. **#718** Classroom mode: course, sections, roster and seat-to-student attribution, ADR (FR-1, FR-12).
2. **#720** Learning outcomes and mapping of objectives and critical tasks (FR-2).
3. **#722** Rubrics per role (FR-3).
4. **#724** Evidence capture and reflection prompts (FR-4, FR-6).
5. **#727** Scoring engine with instructor override and evidence trace (FR-5).
6. **#730** Role rotation, make-up versions and practice runs (FR-7).
7. **#733** Gradebook CSV export (FR-8).
8. **#736** Instructor dashboard, attainment, reliability and equity metrics (FR-10, FR-13).
9. **#739** Accommodations per student (FR-11).
10. **#794** LTI 1.3 grade passback feasibility spike and ADR (FR-9).
11. **#742** Document library, examples, reuse and user guides (FR-14, FR-15).

## Open questions

- **Named-student attribution.** Recommendation: opt-in Classroom mode with an ADR and a visible notice, as in FR-1, instead of changing the default evaluation rule.
- **LTI path.** A desktop app cannot receive an LMS launch by itself. Recommendation: ship CSV first; decide on a relay or hosted tool only after the spike and a privacy review.
- **LMS layouts.** Which gradebook layouts first. Recommendation: the generic CSV plus the two or three LMS products the first reviewing instructors use.
- **Instructor review.** Two instructors from different fields (for example emergency management and cybersecurity) review the rubrics, scoring rules and examples before release (owner to arrange).
- **Evidence for tabletops.** The dashboard should help instructors build their own evidence of learning (pre/post checks, rubric scores); the app makes no effect-size claim for tabletops.
