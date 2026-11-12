# ADR-0171: Clinical simulators in play: decision hooks and events from forms

Date: 2026-11-11 · Status: Accepted · Issue: #1130, #1131

## Context

The clinical systems toolkit had a downtime model, consequence rules and timed reconciliation discrepancies (`src/shared/clinical/downtime.ts`, `reconciliation.ts`), and the clinical care and clinical systems measures compared decisions with ground-truth events. Nothing ran the model in generation, live play or Facilitate, and no generator, screen or form created most of the events the measures read, so the measures reported their events missing. Other fields' simulators are pure generators whose output only the evaluation reads; the downtime model is different, because decisions players make during the exercise change it, and its discrepancies have to reach players while back-entry is still open. The measures also compared simulated case times with wall-clock decision times.

## Decision

- **Generator.** `clinical-downtime` (`src/main/toolkits/clinical-systems/generators.ts`) writes the queue series and a ground-truth dataset, `clinical-systems-events`. Its first event, `downtime_start`, carries the model's parameters, so every reader rebuilds the same case with `downtimeSetupFrom` (`src/shared/clinical/downtime-play.ts`) rather than storing derived state. The patient trajectory generator also writes `patient-events` (the first urgent early warning score and the first critical lab).
- **Decision hooks.** `src/main/live/decision-hooks.ts` lets a field run code after each decision a running session logs (`onDecisionRecorded`), with every decision so far, the log and a way to message every team as an outside party. A failing hook is logged and never fails the decision. The clinical systems toolkit uses it to send each seeded discrepancy once, when the units' reported back-entry reaches its threshold; what was sent is read back from the log, so a resumed session does not resend.
- **Facilitate.** `toolkits:clinical-downtime` returns the model's figures before and after the decisions, the rules that fired, back-entry and the discrepancies, computed from the session's and the facilitator file's decisions. The facilitator overrides a rule with a decision form (`override_consequence`), so an override is in the log like any other decision.
- **Events from forms.** Things players do get forms (`report_unit_on_downtime`, `communicate_critical_result`, and the existing `reconcile_unit`). Things the controller scripts get a controller log form per toolkit (`log_systems_event`, `log_clinical_event`) whose choices map to the event kinds the measures read (`src/shared/clinical/play-events.ts`).
- **One input provider.** `clinicalInputsProvider` serves every clinical measure that reads events: it merges the scenario's clinical datasets, the events from forms and the model's derived events (message outcomes, surfaced duplicates, expected duplicates), and puts decisions on the case clock (the scenario's time mapping, else exercise minute 0 at the outage). The clinical care metrics no longer name a `groundTruth` dataset, so a scenario without one still runs them from the controller's log.
- **Facilitate decisions in the evaluation.** `runToolkitMetrics` now also reads the decisions the facilitator file holds, so an exercise run in Facilitate without devices is scored; a decision in both the log and the file counts once.

## Consequences

- A field can react to live decisions without touching the session code; the hook runs in the main process and must stay quick.
- The forms and the event kinds are one contract: renaming a choice changes what the measures count. The integration tests in `src/main/toolkits/clinical-systems/measures.test.ts` and `live.test.ts` pin it.
- Simulated events and decisions now compare on one clock. Other fields still compare wall-clock decision times with case times; they can adopt `onCaseClock` when they need it.
