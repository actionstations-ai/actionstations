# ADR-0108: Animal disease decisions, metrics and the APHIS replay

Date: 2026-11-05 · Status: Accepted · Issue: #863, #864, #865

## Context

Decisions in this field are timed against clocks (quarantine, control area, the 24 hour depopulation goal, sampling due dates, permit service targets) and the replay data on offer is thin: the APHIS dashboard is a Tableau view, and the only export verified here is the CSV of its main view, which has confirmations per month by flock type and nothing finer.

## Decision

Twelve decision forms are toolkit data with the `animal_` prefix; their ids are the decision kinds the metrics read (the choice option ids of the permit form, `issue`, `issue_with_conditions` and `deny`, are part of that contract). Quarantine and control area timing use the generic `decision_timing` metric against `presumptive_positive` events. Four metrics are new, in `src/main/evaluation/metrics/animal-disease.ts`: depopulation timing per premises against a goal (default 24 hours, the HPAI Red Book), surveillance on schedule, continuity of business and disposal backlog; targets that are not in a plan (permit service target, sampling grace, disposal wait) are the designer's. Completions and samples are recorded by controllers through `animal_record_depopulation` and `animal_record_sample`, as epidemiology records contact outcomes. The `animal-premises-spread` generator writes the events the metrics read.

The `aphis-hpai` connector reads only the verified monthly export, from one fixed host, and says in its notice that no county, flock size or premises is in it. County detail and NASS farm inventories are not fetched: the export has no county rows and NASS Quick Stats needs a key. Premises always come from the scenario's fictional placement. The mapping from the toolkit's critical tasks to the 20 VS FAD PReP critical activities is left out until their names are verified.

## Consequences

A metric and its form are one contract. Replay sets pace and scale by month. If APHIS publishes a county export, the connector gains a second dataset without changing the privacy rule.
