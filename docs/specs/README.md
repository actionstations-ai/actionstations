# Feature specs

Each feature on the 0.6.0–0.9.0 milestones has a spec here before it is built:
requirements → design → tasks. A spec is named after its issue: `NNNN-short-name.md`
(issue number, zero-padded). Architectural decisions a spec makes are recorded as ADRs in
[`docs/adr/`](../adr/) when the work lands.

A spec is a working document. When the code differs from it, update the spec in the same
pull request.

## Template

```markdown
# Spec NNNN: Title

Issue: #NNN · Milestone: 0.x.0 · Status: Draft · Depends on: #… · Related: #…

## Summary

Two or three sentences: what changes for the user.

## Requirements

### User stories

- As a <role>, I want …, so that …

### Functional requirements

- **FR-1** …

### Non-functional requirements

- **NFR-1** Cost: … (CONTRIBUTING, Project rules 1)
- **NFR-2** Privacy: … (Project rules 3)
- **NFR-3** Accessibility: WCAG 2.2 AA …
- **NFR-4** Offline / performance / platforms …

### Out of scope

## Design

Architecture, data model (zod schemas in `src/shared/schemas/`), IPC channels
(`src/shared/ipc/`), main-process modules, renderer screens, prompts, templates, export
changes, migrations of existing projects.

## Security and privacy

Threats and mitigations; what leaves the computer, when, and with whose consent.

## Testing

Unit, integration, e2e (Playwright), packaged smoke test, live (`LIVE=1`) where relevant.

## Tasks

Ordered, each about one pull request, naming the files it touches.

1. …

## Open questions

Decisions for the owner, each with a recommendation.
```

## Index

| Spec                                                                                                               | Issue | Milestone |
| ------------------------------------------------------------------------------------------------------------------ | ----- | --------- |
| [Live play: session protocol and end-to-end encryption](0406-live-protocol.md)                                     | #406  | 0.6.0     |
| [Live play: serve sessions from this computer over the room's Wi-Fi](0407-live-lan-server.md)                      | #407  | 0.6.0     |
| [Live play: Action Stations relay on Cloudflare's free plan](0408-live-relay-cloudflare.md)                        | #408  | 0.6.0     |
| [Live play: self-hosted session server for offline networks](0409-live-self-hosted-server.md)                      | #409  | 0.6.0     |
| [Live play: choose the connection per exercise](0410-live-connection-choice.md)                                    | #410  | 0.6.0     |
| [Live play: player web page (join, role inbox and feed)](0411-player-page.md)                                      | #411  | 0.6.0     |
| [Live play: deliver injects to players' devices](0412-inject-delivery.md)                                          | #412  | 0.6.0     |
| [Live play: messages between players and the SimCell](0413-player-simcell-messages.md)                             | #413  | 0.6.0     |
| [Live play: decision-point voting](0414-decision-voting.md)                                                        | #414  | 0.6.0     |
| [Live play: hot wash contributions from devices](0415-hotwash-contributions.md)                                    | #415  | 0.6.0     |
| [Live play: evaluator observation forms](0416-evaluator-observations.md)                                           | #416  | 0.6.0     |
| [Live play: controller dashboard and session log](0417-controller-dashboard-session-log.md)                        | #417  | 0.6.0     |
| [Live play (epic)](0418-live-play-epic.md)                                                                         | #418  | 0.6.0     |
| [AAR/IP draft from the exercise record](0419-aar-ip-draft.md)                                                      | #419  | 0.6.0     |
| [Complete HSEEP document set and Excel MSEL](0420-hseep-document-set.md)                                           | #420  | 0.6.0     |
| [Exercise Evaluation Guides, Core Capabilities and expected actions from the plans](0421-eeg-core-capabilities.md) | #421  | 0.6.0     |
| [Surveys: builder, templates, delivery and results](0422-surveys.md)                                               | #422  | 0.6.0     |
| [Update notifications (opt-in)](0442-update-notifications.md)                                                      | #442  | 0.6.0     |
| [Tip of the day](0443-tip-of-the-day.md)                                                                           | #443  | 0.6.0     |
| [Grounding labels and contradictions between plans](0423-grounding-and-plan-conflicts.md)                          | #423  | 0.7.0     |
| [Private hot wash transcription for the AAR](0425-hotwash-transcription.md)                                        | #425  | 0.7.0     |
| [Regulatory clocks and compliance mapping](0426-regulatory-clocks.md)                                              | #426  | 0.7.0     |
| [Injects aimed at the gaps between plans](0427-injects-at-plan-gaps.md)                                            | #427  | 0.7.0     |
| [Controller tools and unanswered-inject tracker](0428-controller-tools.md)                                         | #428  | 0.7.0     |
| [Preview and redact what goes to cloud models](0433-cloud-preview-and-redaction.md)                                | #433  | 0.7.0     |
| [Benchmark local models on Action Stations tasks](0434-local-model-benchmark.md)                                   | #434  | 0.7.0     |
| [Corrective-action tracking and multi-year exercise program](0424-corrective-actions-program.md)                   | #424  | 0.8.0     |
| [SimCell assistant with voice calls](0429-simcell-assistant.md)                                                    | #429  | 0.8.0     |
| [Branching scenarios decided by rules](0430-branching-scenarios.md)                                                | #430  | 0.8.0     |
| [Plan redlines and regression drills](0431-plan-redlines-regression-drills.md)                                     | #431  | 0.8.0     |
| [Micro-tabletops: short drills for new staff](0437-micro-tabletops.md)                                             | #437  | 0.8.0     |
| [Program health dashboard](0438-program-health-dashboard.md)                                                       | #438  | 0.8.0     |
| [Real-world inject formats and exports to EOC platforms](0432-real-world-formats-eoc-exports.md)                   | #432  | 0.9.0     |
| [Translation and accessible player material](0435-translation-accessible-player-material.md)                       | #435  | 0.9.0     |
| [Map view of injects](0436-map-view.md)                                                                            | #436  | 0.9.0     |
| [Optional live hazard data for scenarios](0439-live-hazard-data.md)                                                | #439  | 0.9.0     |
| [Regional exercises across organizations](0440-regional-exercises.md)                                              | #440  | 0.9.0     |
| [Community pack catalog with contributor credit](0441-community-pack-catalog.md)                                   | #441  | 0.9.0     |
