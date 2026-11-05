# ADR-0079: Media simulators are small seeded models with documented parameters

Date: 2026-11-05 · Status: Accepted · Issues: #748, #749 · Spec: [0458](../specs/0458-crisis-comms.md) · Related: ADR-0075 (figures), ADR-0076 (case data)

## Context

The media environment toolkit needs a news cycle and social feeds that change while an exercise runs. There is no licensed source of real posts to replay, and a model that claims to predict virality would mislead. Facilitators need to see why a number moved.

## Decision

- **Pure, seeded functions** in `src/main/toolkits/media/`. The same input gives the same schedule and the same counters (mulberry32 seeded random source; no clock, no network).
- **News cycle:** a schedule of inject proposals from the trigger time, severity (1 to 5) and visibility (local, regional, national): wire flash two to six minutes after the trigger, a bulletin, local TV at the next top of the hour (a newscast less than 15 minutes away is skipped; the producer's deadline is 15 minutes before), a web article within the hour, a push alert for severe stories, the morning print edition, reporter calls and emails with deadlines, and follow-up stories that react to the player's holding statement, corrections and press conferences or to silence. Every item carries `simulated: true` and the reason it was scheduled. Outlets come from a fixed list of fictional names.
- **Social spread:** views follow a logistic curve normalized to zero at the start and the full reach at the end. A response removes a share of the growth that comes after it: for a correction 40 % when within 60 minutes of the post, 15 % within four hours, 5 % later; labels 30/10/3 %; takedowns 50/20/8 %; a statement or silence changes nothing. Slowdowns compound but stop at 35 % of the unanswered growth. Because only future increments are scaled, counters never decrease. Likes, reposts and replies are fixed rates of views with a seed-fixed jitter.
- **Sentiment:** reply mix over supportive, skeptical, hostile, false claim and joke. A timely correction cuts the false-claim weight to 60 % and a late one to 85 %; two hours of silence raises the hostile weight by 30 %. Counts are apportioned by largest remainder so they add up to the replies.
- **Counters reach the posts through the existing engagement fields** (spec 0428), not a second mechanism.
- **Figures** `media.spread`, `media.sentiment`, `media.narratives` and `media.coverage_timeline` delegate to the generic kinds, put "Simulated" in the title, add a one-line statement that this is a teaching model to the summary, label the data table simulated and mark false-claim narratives in words.
- **Generators** `media-social-spread` and `media-news-cycle` run through the case-data framework, which writes the simulated provenance.

## Consequences

- The parameters are constants in one object (`SPREAD_PARAMETERS`) shown to the facilitator; changing the model is a code change with a test.
- The model has no network effects, platform differences or audience structure. It is a discussion aid, and the figures say so.
