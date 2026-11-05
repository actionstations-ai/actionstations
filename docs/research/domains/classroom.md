# Domain dossier: `classroom` (course use, cross-cutting)

Research for the classroom epic (#686, spec 0453) and the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session (found only in secondary summaries or from general knowledge).

`classroom` is cross-cutting: it is not an organization being exercised but a way of running any exercise (any domain, any toolkit) as a class session. It ships as a **learning outcomes and grading** capability plus a thin domain profile for courses whose subject is exercise design itself (emergency management, homeland security, public administration).

## 1. Scope

**Covers:** instructors and students in community colleges, universities, training academies and professional programs who use tabletop exercises as a teaching method: emergency management and homeland security programs, cybersecurity and information systems courses, nursing and medical schools, public health, journalism and communications, meteorology, engineering, public administration, law and business schools.

**Session types this capability needs:**

- **Graded class session:** one exercise run in a class period, with student role assignments, individual and team assessment.
- **Practice run:** the same exercise ungraded, before the graded run; no scores kept, or scores shown to the student only.
- **Role rotation across sessions:** each student plays different roles over a term (for example incident commander in week 3, public information officer in week 6, evaluator in week 9).
- **Make-up version:** an exercise with the same objectives, critical tasks and difficulty but different facts, for students who missed the session or who must retake it.
- **Capstone or multi-section comparison:** several sections run the same exercise and the instructor compares outcome attainment.
- **Evaluator role as learning:** a student acts as an evaluator and is assessed on the quality of their observations.

**Aliases:** course, class, lab, seminar, training course, academy, cohort, section, semester, term, practicum, simulation course, instructor, professor, trainer.

## 2. Roles

| Title                         | Abbrev. | What they decide                                                                                                      |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Instructor of record          | INST    | Course outcomes, rubrics, final grades, accommodations applied, make-up policy                                        |
| Teaching assistant / co-lead  | TA      | Runs the exercise, records observations, scores with the rubric                                                       |
| Exercise facilitator          | FAC     | Runs the session (often the instructor); controls the clock and injects                                               |
| Student player                | PLAYER  | Plays a role in the scenario; contributes decisions and hot wash comments                                             |
| Student evaluator / observer  | EVAL    | Rates a role or team against the guide; may be assessed on observation quality                                        |
| Disability services office    | DSO     | Determines approved accommodations (the instructor implements them) **[U: office name and process differ by school]** |
| Program or department chair   | CHAIR   | Program outcomes, accreditation evidence, section comparisons                                                         |
| Registrar / LMS administrator | ADMIN   | Gradebook, roster and integration set-up                                                                              |

**Outside parties:** accreditors and program reviewers who ask for outcome evidence; the practitioners who guest-evaluate (county emergency manager, hospital CISO); students' employers in cohort programs.

## 3. Systems

- **Learning management systems (LMS)** hold the roster, the gradebook and assignments. Instructors move scores into them by CSV upload or by an integration.
- **LTI (Learning Tools Interoperability) 1.3**, published by 1EdTech (formerly IMS Global), Final Release, document version 3, 16 April 2019; platforms are OpenID Providers and LTI messages are signed tokens (OpenID Connect and JWT); service access uses OAuth 2.0 with a JWT client assertion; HTTPS with TLS is required; roles use the LIS vocabulary (Instructor, Learner, Mentor, Administrator, ContentDeveloper) **[V: imsglobal.org/spec/lti/v1p3]**.
- **LTI Assignment and Grade Services (AGS) 2.0**, 1EdTech Final Release, 16 April 2019, builds on LTI 1.3: a Line Item service (usually one gradebook column; a tool can create line items), a Score service (the tool posts scores to the platform, write-only; scores can carry maximum points, activity progress and grading status), and a Result service (the tool reads grades, read-only). Access is by scopes (`lineitem`, `lineitem.readonly`, `result.readonly`, `score`), and a tool sees only the gradebook entries of its own deployment **[V: imsglobal.org/spec/lti-ags/v2p0]**. Implication for a local-first desktop app: AGS needs a tool that the LMS can reach over public HTTPS and that holds registered keys, which a desktop app does not have by itself (spec 0453 FR-9 and open questions).
- **OneRoster (1EdTech)** exchanges roster and gradebook data, including a CSV binding with files such as `classes.csv`, `enrollments.csv`, `lineItems.csv` and `results.csv` **[U: found in search summaries of the 1EdTech CSV binding; v1.2 field definitions not read]**.
- **CSV gradebook import** is how most instructors will actually get scores in; each LMS has its own column rules (student identifier column, assignment column name, points possible) **[U: per-LMS formats to be verified when the export is built, one task per format]**.
- **Accessible delivery:** the exercise materials and player view already have screen-reader packets and large-print versions (specs 0435, 0446); accommodations extend them per student.

## 4. Products (what the capability produces)

| Product                                          | From       | Render                                              |
| ------------------------------------------------ | ---------- | --------------------------------------------------- |
| Course syllabus insert (outcomes, exercise plan) | instructor | text template                                       |
| Rubric (per role, per criterion, levels)         | instructor | table; printable PDF; JSON for reuse                |
| Student role sheet with rubric                   | instructor | PDF per student                                     |
| Evaluator observation form                       | evaluator  | extends the EEG form (spec 0421) with a student row |
| Reflection prompts (after the hot wash)          | instructor | form; PDF; live-play survey                         |
| Student score report                             | scoring    | PDF per student: scores, evidence, comments         |
| Section report                                   | dashboard  | table and figures: attainment, distribution         |
| Gradebook export                                 | scoring    | CSV                                                 |
| Accommodation plan (per student, private)        | instructor | internal record, never in shared files              |

## 5. Standards, regulations and evidence base

- **FERPA** (Family Educational Rights and Privacy Act, 34 CFR Part 99). "Education records" are records directly related to a student and maintained by the institution or a party acting for it **[V: eCFR 34 CFR 99.3]**. Directory information is information "not generally considered harmful" if disclosed (name, address, email, enrollment status, dates of attendance) and does not include a Social Security number or, generally, a student ID number **[V: 99.3]**. Disclosure without consent is allowed to school officials, including teachers, with legitimate educational interests **[V: 99.31(a)(1)(i)(A)]**. Grades are generally not directory information **[U]**. Implication: student scores belong to the institution's records; Action Stations keeps them local, in the instructor's project, and exports only what the instructor chooses.
- **Section 504 and the ADA (Title II)** require postsecondary schools to provide appropriate academic adjustments; examples include extended time, note-takers and recordings; schools may set documentation procedures **[U: from OCR guidance reproduced by schools and OCR case resolutions; the ed.gov pamphlet was not retrievable this session]**. An OCR resolution found that giving every student the same extra time did not satisfy an individual's approved time-and-a-half accommodation **[U]**. Implication: accommodations are per student and must be applied, not generalized.
- **Active learning evidence:** Freeman and colleagues' meta-analysis of 225 studies of undergraduate STEM courses found exam scores about 0.47 standard deviations higher under active learning than under traditional lecturing (158 comparisons) and an odds ratio for failing of 1.95 under lecturing (67 comparisons), roughly a 1.5 times higher risk of failing **[V: PNAS 111(23), 2014, PMC4060654]**. This supports active learning in general, not tabletops specifically.
- **Evidence specific to tabletops and simulation in higher education** is growing but mostly small and single-site: a 2025 study of 326 senior medical students using a tabletop on mass casualty incident management reported gains on all core competencies; a 2024 systematic review of 140 papers on cybersecurity tabletops found most exercises are linear and few collect data about trainees' learning; a quasi-experimental comparison of full-scale exercises with tabletops found high learning in both **[U: from search summaries of BMC Medical Education 2025, the ITiCSE 2024 review and a comparative study; none read in full]**. Implication for the product: collect learning data (pre/post checks, rubric scores) so instructors can show attainment; do not claim an effect size for tabletops.
- **Rubrics:** the AAC&U VALUE rubrics (16 outcomes, written by faculty teams) are licensed CC BY-NC-SA 4.0; commercial uses (assessment software, course packets sold to students) need AAC&U's prior written permission, and approved uses reproduce the rubric whole and unmodified with the permission statement **[V: aacu.org/value/how-to-cite]**. Implication: do not bundle VALUE rubrics in packs; name them and link; ship original rubrics.
- **Program evidence:** FEMA's Higher Education Program keeps a College List of emergency management and related degree programs (533 listings in the 2014–2015 edition, five subject areas); FEMA says it does not rank or recommend schools **[U: from an FIU review and archived FEMA pages; current list not checked]**. These programs are the first audience.
- **HSEEP** (exercise doctrine) and the app's existing EEG model are the source of the objective → Core Capability → critical task structure that outcomes map onto **[V: repo specs 0421, 0422]**.

## 6. Data sources

There is no public dataset to replay. Classroom data is created in the app: roster (typed or imported from CSV), outcomes, rubrics, evidence and scores. All of it stays in the instructor's project folder (project rule 3). The only external inputs are optional imports of a roster CSV from the LMS and optional rubric JSON from colleagues.

## 7. Evaluation (how the field scores itself)

- **Outcome attainment:** the share of students at or above a threshold level on each learning outcome, per section and per term; the standard measure in program assessment **[U: general practice]**.
- **Rubric reliability between evaluators:** percent agreement, Cohen's kappa (weighted for ordered levels) for two raters, intraclass correlation for more **[U: standard statistics, not a regulatory requirement]**.
- **Participation equity:** how evenly speaking turns, decisions and hot wash contributions are spread across students and roles; an instructor aid, not a grade **[U: product-defined]**.
- **Pre/post knowledge change** from the existing survey templates (spec 0422).
- **Rule inside the app today:** EEG ratings (met, partial, not met, not observed) are "discussion aids for the hot wash and the AAR, never grades of people", and no observation names a player **[V: `src/shared/schemas/evaluation.ts` header]**. Classroom mode is therefore a deliberate, opt-in exception for named students that needs an ADR (spec 0453 FR-1).

## 8. Session arcs

- **Before:** outcomes and rubrics chosen; roles assigned (rotation plan); accommodations applied; optional pre-check.
- **During:** evaluators and the instructor record observations against rubric criteria; decisions are attributed to seats; the facilitator tallies hot wash contributions.
- **After:** reflection prompts; scores computed from evidence; instructor reviews and overrides; export; section dashboard; feedback to students.

## 9. Reuse by other domains

Every domain profile gains an optional **Classroom** setting (not a toolkit): the same rubric and scoring machinery works for a hospital's nursing students, a county's new-hire training, a cybersecurity course or a journalism lab. Training programs outside universities (academies, onboarding) use it for competency sign-off. It composes with the evaluation guides (spec 0421), surveys (spec 0422), corrective actions (spec 0424) and micro-tabletops (spec 0437, practice runs).
