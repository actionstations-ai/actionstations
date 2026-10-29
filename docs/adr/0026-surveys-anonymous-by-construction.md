# ADR-0026: Surveys are anonymous by construction

Date: 2026-10-28 · Status: Accepted · Issue: #422 · Spec: [0422](../specs/0422-surveys.md) · Related: [spec 0406](../specs/0406-live-protocol.md), [spec 0419](../specs/0419-aar-ip-draft.md)

## Context

Scenarios get surveys (HSEEP Participant Feedback Form, before/after knowledge check and confidence self-assessment, staff debriefs). HSEEP exercises are non-attributional, and participants answer more frankly when nothing they write can be traced to them. Rooms are small: with two or three respondents, a per-question mean or a list of comments in arrival order can identify who said what even without names. Responses arrive on paper today and from phones in live play later; the After-Action Report draft (#419) reads the results.

## Decision

**No identity in the data.** `SurveyResponse` is a strict schema with no field for a name, device, network address or user agent; a request that carries one is refused, not trimmed. A response stores the survey id, an optional live delivery id, the channel (`paper`, `manual`, `live`, `qr`), the time rounded down to the minute, an optional self-selected team (only when the survey asks, and only from the scenario's teams, never single roles) and the answers.

**Aggregates only, above a threshold.** Results are computed on the computer by one pure function, `summarizeSurvey()`. Below `AppSettings.surveys.minResponses` (default 3) a survey shows counts only; a question answered fewer times than the threshold shows its count only; a before or after mean is shown only when that side reaches the threshold. Before/after editions are compared by `pairKey` (confidence) or question id (knowledge check) across the two groups, never by matching one respondent's answers. Free text is listed in a seeded shuffle (stable between views, never in arrival order).

**One store, every channel.** Responses live in `scenarios/<id>/surveys/<surveyId>.responses.jsonl`, append-only, with the last line per response id winning. Paper entry writes there now; the live-play work mirrors `survey.response` messages into the same file through `src/main/surveys/wire.ts`, which takes no sender information and so cannot store any. Correct answers and citations are stripped before a survey reaches a device (`toWireSurvey`) and never printed on a participant form; the answer key is printed only in the facilitator's results PDF.

**Distribution.** Participant forms may go into the ZIP's `players/` folder by name; debriefs and results are refused there by the same allow-list check as the MSEL and handbook.

## Consequences

- A facilitator in a two-person room sees only counts; the results view and the guide say why and where the threshold is set.
- Nobody can follow up with a respondent, and a duplicate paper entry cannot be detected automatically; the paper-entry form offers "Remove the last entry" instead.
- The AAR record (#419) gets summaries, not responses, and cites survey evidence as `survey:<surveyId>:<questionId>`.
- Live delivery adds a transport, not a new storage or privacy model.
