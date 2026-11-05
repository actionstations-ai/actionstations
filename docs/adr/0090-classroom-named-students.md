# ADR-0090: Classroom mode is an opt-in exception that lets scores name students

Date: 2026-11-04 · Status: Accepted · Issue: #718 · Spec: [0453](../specs/0453-classroom.md) · Related: ADR-0016 (forward-compatible files), ADR-0018 (packs), ADR-0077 (field metrics)

## Context

The evaluation model (`src/shared/schemas/evaluation.ts`) says ratings are discussion aids, never grades of people, and no observation names a player. That rule protects participants in a real organization's exercise. An instructor running a course has the opposite need: a grade is a statement about one student, backed by evidence about that student. Spec 0453 asks for named-student scoring without weakening the default for ordinary exercises.

## Decision

- **Classroom is a project setting, off by default.** `project.classroom = { enabled, noticeAcceptedAt }`. Turning it on records the notice "scores name students; ratings become grades only when the instructor confirms them" with a timestamp. Nothing else in the app changes while it is off.
- **The anonymous record never learns a name.** Evaluators still post ordinary observations to `scenarios/<id>/evaluation.json`. When an observation carries a `studentId` (allowed only when Classroom is on; the evaluation store and IPC handler reject it otherwise), the observation is stored without the id and the link `{ observationId, studentId, criterionId }` is stored as an evidence entry in `classroom/evidence.json`. The AAR, the live dashboard, program snapshots and exports therefore read the same anonymous data as before and need no change.
- **All student records live in `classroom/`** inside the project folder: roster, scores, evidence, reflections, accommodations. `duplicateProject` skips the folder, exercise bundles and pack exports never read it, and a test asserts both. Deleting a student removes their roster entry, evidence, scores, reflections and accommodations in one call.
- **No model decides a grade.** The scoring engine suggests a rubric level by a documented rule from the evidence; the score is the instructor's choice and keeps the evidence and the override. Anything sent to a model passes the preview and redaction of spec 0433 first, and the app never offers to send student records to a service.
- **Attribution is for instructors only.** Live-play devices see their own seat's forms and never other students' evidence. Accommodations record adjustments, not diagnoses, and show elsewhere only as a count.
- **Practice runs write nothing** to the gradebook export or the dashboard.

## Consequences

- The default rule in the evaluation schema stays true by construction: the file the existing code reads has no student ids, so no existing reader can leak one.
- Student-linked evidence is a second file to keep consistent with `evaluation.json`: removing an observation removes its evidence link, and a link whose observation is gone is ignored.
- Sharing a project folder by copying it shares `classroom/` unless the sharer leaves it out; the Classroom screen says so, and duplicating from the app leaves it out.
- Records are held under the institution's policy, not the app's: FERPA treats grades as education records, so an export is the instructor's act and the export screen says so.

## Live play (added with #724 and #739)

- **The roster goes to evaluator devices only.** `eval.assign` carries `students` (id and display name) in Classroom mode, sealed to the evaluator under the staff key; `eval.observation` may carry a `studentId`. The controller keeps the id only when the roster has it, saves the observation without it and links it in `classroom/evidence.json`. The session log never carries a student id.
- **Reflections are the one attributed survey.** A survey marked `classroomReflection` is announced to devices as not anonymous. The controller maps the answering seat to a student (the session's seat table by role id, else an exact display-name match) and stores the answer as evidence in `classroom/`. The survey response file stays anonymous as for every survey. A seat that matches nobody is not attributed.
- **Extra time is per device.** A student with a time multiplier gets a later close on surveys and a longer drill time; the shared clock and other devices are unchanged. Votes and decision forms are group acts and are not extended.
