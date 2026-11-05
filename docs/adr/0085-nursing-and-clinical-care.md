# ADR-0085: Nursing is a domain, the clinical care toolkit is the reusable part

Date: 2026-11-04 · Status: Accepted · Issues: #685, #886 · Spec: [0452](../specs/0452-nursing.md) · Related: ADR-0014 (domain profiles), ADR-0074 (toolkits)

## Context

Nurses play in every hospital exercise, and nursing programs teach with unfolding case studies and simulation. The unit-level view of a hospital (charge nurse, rapid response, long-term care wing, simulation lab) is a kind of organization, but the products it uses (vital signs, lab results, SBAR, triage tags, staffing grids) are shared with pharmacy, EMS, public health, school nursing and venues.

## Decision

- **`nursing` is a domain profile** (`packs/domains/nursing.json`). The profile format has no `extends` field, so the profile repeats what a hospital exercise inherits from `healthcare` (outside parties, systems, regulation list) and a test keeps the two from drifting. Adding an `extends` mechanism would change how every profile resolves and is not needed for one case.
- **Variants are role sets.** Hospital unit, long-term care and simulation lab roles live in one profile and are told apart by the team prefix (`Hospital unit: …`), because the variants share facts, systems and families.
- **Scenario families are added by the domain** (`addedThreatFamilies`): unit surge, unit evacuation, unit outbreak, medication error, staffing crisis, active threat on a unit, downtime care, heat and power loss in long-term care, and a clinical event family for case studies. They use the arcs of the dossier and the purpose mixes of FR-2.
- **The clinical care toolkit is pack data** (`packs/toolkits/clinical_care.json`): glossary, product conventions, realism rules, outside parties, advisor roles and the nine structured decisions. Other domains list it in `suggestedToolkits`.
- **Both ship in one bundled pack,** `ai.actionstations.nursing`.

## Consequences

- The bundled domains now add threat families, so tests that assume a registry of built-ins alone clear the `bundled-domains` source first.
- Clinical content is exercise content. The toolkit's rules tell the generator to keep patients synthetic, doses plausible and never to reproduce licensed exam items.

## Amendment (#887): templates and field lint

- The eleven clinical products are templates in the nursing pack (`clinical_lab_panel`, `medication_administration_record`, `sbar_handoff`, `triage_tag`, `staffing_grid`, `rapid_response_record`, `patient_event_report` with report and disclosure variants, `isolation_cohort_board`, `evacuation_priority_list`, `debrief_guide`, `learner_feedback_form`). Their types come from `taxonomy` blocks in `meta.json`; the built-in taxonomy is unchanged.
- `lintRules` names **field lint rules**, a registry in `src/main/toolkits/field-lint.ts` whose issues join the content issues of the inject text stage (one repair round, then a warning). Rules read one inject type's fields; the clinical rules live in `src/main/toolkits/clinical/lint.ts` and the pure arithmetic in `src/shared/clinical/`. A field adds its module to `lint-rules.ts`.
- Arithmetic a template cannot do (on-duty counts and shortfall in the staffing grid) is a derived value (ADR-0046).
- The dose check lists a few common drugs with a generous single-dose ceiling and their routes; it is a guard against invented doses, not a drug reference. START is the rule for triage tags; SALT is checked for contradictions only.

## Amendment (#889): figures and the early warning score

- Seven figure kinds live in `src/main/render/figures/clinical_care/` (`vitals_monitor`, `vitals_flowsheet`, `early_warning_score`, `lab_trend`, `staffing_vs_demand`, `unit_census`, `evacuation_progress`). Each returns a summary that states the values and a data table; alarm states, flags and trigger levels are words (ALARM HIGH, H, L, CRITICAL, Trigger level: HIGH) as well as symbols. They draw simulated trends only and say so on the figure.
- They are shown through the pack template `clinical_figure`, whose schema lists these kinds (the built-in `figure` template lists the generic ones), with one golden per kind.
- The early warning score is a configuration (`EwsConfig`: parameters with bands or categories, trigger levels with responses, a required source line) in `src/shared/clinical/ews.ts`. The bundled neutral score is this app's own and says it is not a published score; a figure's data may carry another configuration. A named published score (NEWS2, a pediatric score) is not bundled until its reproduction terms are confirmed.

## Amendment (#890): simulation

- `src/main/toolkits/clinical/` holds the synthetic patient generator (`patient.ts`, names from short lists, record numbers `SIM-######`, histories coherent with the story and allergies), the named trajectories (`trajectory.ts`: sepsis, hemorrhage, respiratory failure, cardiac event, post-operative deterioration, hypoglycemia) and the unit model (`unit.ts`).
- A trajectory is a severity from 0 to 1 that rises at a rate of its own; vitals and labs are baseline plus severity times the distance to the severe value, with seeded noise, clamped to human ranges. At branch points reassessing changes nothing, delaying speeds the course, treating without escalating slows it and escalating then treating reverses it. It is rule-based, deterministic given the seed and labeled simulated; the magnitudes are typical adult values and refining them against open reference data is a later check.
- The trajectory is registered as the case data generator `clinical-trajectory` (vitals and lab series), through `src/main/toolkits/generator-modules.ts`, which a field extends with one import line.
- The unit model keeps census within beds, puts every arrival in a bed or the backlog, derives nurses needed from acuity points, flags ratios above the target and lets the facilitator change arrivals, nurses, beds and supplies.

## Amendment (#891): case studies

- A case study is project content (`case-studies/<id>.json`, schema `CaseStudy` in `src/shared/schemas/case-study.ts`): ordered stages with data (figures, tables, statements) and prompts tagged with a step of the Clinical Judgment Measurement Model. Five prompt types (select cues, rank hypotheses, choose actions, short rationale, evaluate outcome) each carry a key and a rationale; a prompt can branch the next stage on its score by a threshold.
- Cases are authored, imported or generated. A generated case is built deterministically from a named trajectory (`src/main/casestudy/from-trajectory.ts`), so it needs no model and uses the same simulated data as the figures; drafting prose with a local model is a later step. Generated and imported cases are drafts. The author's review (`casestudy:review`) records who reviewed and releases the case; editing a reviewed case returns it to draft.
- Import stops on direct identifiers (numbers, emails, dates of birth, addresses, links) until the author redacts them or says they are not identifiers (`src/shared/clinical/identifiers.ts`). This is a safety net, not a guarantee of de-identification.

## Amendment (#893): player, keys and scoring

- Scoring is a pure function over a response and the prompt's key (`src/main/evaluate/casestudy.ts`), 0 to 1 per prompt with partial credit: cues by right picks over wrong picks, rankings by displacement from the key order, actions by credit over the best possible (harmful options subtract), rationales by the share of key points whose phrases appear, outcomes by the credit of the chosen option. The per-step profile is the mean of the latest answers per step. The scale is this app's own and every screen says it is not NCLEX scoring.
- A run (`src/main/casestudy/run.ts`) takes one stage at a time and the last branching prompt of a stage decides the next stage by threshold. A learner gets only reviewed cases; `preview` lets the author try a draft and is never counted. The view sent to the renderer carries no key, and a rationale only after the prompt is answered.
- Group runs record each member's own answer before the agreed one. Whole-class sessions that use the live-play infrastructure are not built yet; instructor-visible results there need the notice the player already shows.
- The player is a route (`routes/casestudies`) with native controls, a polite live region for feedback, figures as images with their summary and a data table, no time limit and an opt-out before a case with a content notice.

## Amendment (#895): education documents and the record

- Seven documents are written from the case, its runs and the education records (`src/main/casestudy/documents.ts`) into pack templates: `simulation_prebrief`, `facilitation_guide` (one cue card per stage), the existing `debrief_guide` and `learner_feedback_form`, `learner_report`, `facilitator_summary` and `program_record`. `casestudy:export` writes any of them as a PDF to the project exports folder. Nothing calls a model.
- The education record (`education-records/<id>.json`) says whether prebriefing, facilitation, professional integrity and debriefing were done and by whom, with the hours, the debrief check-in and whether the content notice was shown. A cornerstone is marked done only with a name. The four names follow the INACSL standards, which are cited and not reproduced. Hours are counted for the program's use; the program and its state board decide whether simulation counts toward clinical requirements, and the program record says so.
- The facilitator summary counts finished runs and never preview runs, and says that individual results are visible to the instructor.

## Amendment (#897): reference library

- The documents are a catalog-only library, `ai.actionstations.nursing-library`, built from `packs/documents/manifest.json` like the other domain libraries: the AHRQ TeamSTEPPS pocket guide is new, and CMS Appendix Z and the FEMA healthcare power outage guidance are shared with the healthcare library through `alsoIn`. A file is bundled only when its status as a US government work was checked (the AHRQ pocket guide carries no copyright notice and AHRQ states its government works are public domain in the United States). ASPR TRACIE documents stay link-only by the owner's rule; the CDC isolation guideline could not be fetched to pin a hash, the AHRQ evacuation guide survives only in web archives and CANDOR is a web toolkit, so those are links. NCSBN, INACSL and published score documents are named, not bundled.
