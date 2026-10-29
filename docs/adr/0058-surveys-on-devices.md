# ADR-0058: Surveys on devices reuse the live session; QR delivery is a survey-only session

Date: 2026-10-29 · Status: Accepted · Issue: #422 · Spec: [0422](../specs/0422-surveys.md) · Related: ADR-0026 (anonymous surveys), ADR-0027 (protocol), ADR-0051 (connection choice)

## Context

Surveys core (definitions, paper entry, results) was built first. Participants also need to answer on their phones, during live play or after an exercise that was not run live, without a second server and without the answers leaving the room's network.

## Decision

- **No second server.** A survey goes to devices as `survey.open` through the running live session (`src/main/live/surveys.ts`). For an exercise that was not run live, the facilitator starts a session with `surveyOnly`: one "Participant" seat (the observer seat), every other feature off in `welcome.features`, and the join QR and link of the normal session. The listener runs only until the session ends.
- **Anonymous by construction.** The controller reads the sender once, to find the seat (is it in the survey's targets) and to let a second answer from the same device replace the first. That device-to-response map is memory only. The log entry and the stored response hold the answers and the time to the minute: no client reference, seat, role or display name.
- **The wire survey id is a per-opening delivery id.** It is stored on each response (`deliveryId`) so a survey can be sent more than once. Scale end labels are written into the question text, since `survey.open` has no label fields.
- **Mirroring.** Each accepted answer is written to the log, then appended to the survey's `.responses.jsonl` with `channel: 'live'` (or `'qr'` in a survey-only session). Results, the anonymity threshold and the AAR feed read that file as before.
- **Seats.** Any seat in the survey's targets may answer (players, evaluators, observers), so the evaluator debrief can go to evaluators only.

## Consequences

- Rebuilding the response file from the log after a crash is not built; the file is written as answers arrive.
- A survey-only session on a phone is as private as live play: the same encryption, the same loopback guard in tests.
- Two devices answering from one browser profile count once (they share a device id).
