# ADR-0125: Human services is a domain with four toolkits, and safeguards are toolkit data

Date: 2026-11-05 · Status: Accepted · Issues: #706, #714 · Spec: [0464](../specs/0464-human-services.md) · Related: ADR-0074 (toolkits)

## Context

The human services field covers crisis lines, mass care shelters, family reunification and child welfare. The spec calls for one human services toolkit, but a toolkit's knowledge is capped at 3000 characters (6000 across all toolkits in one prompt). Crisis line routing rules, shelter and access and functional needs rules, reunification and child welfare rules and the safeguards for sensitive content do not fit in one fragment, and the safeguards must also reach exercises in other domains (justice, nursing, K-12).

## Decision

- **One domain, four toolkits.** The `human_services` domain keeps the role teams of the four variants. The toolkits are `behavioral_safeguards` (this change), then `crisis_line`, `mass_care` and `reunification_child_welfare`. Each stays under the knowledge cap uncut. All ship in one bundled pack, `ai.actionstations.human-services`.
- **Safeguards are data on the toolkit.** `ToolkitSchema` gains an optional `safeguards` block: trigger words, a content notice, wellbeing check lines and a stop-and-step-out rule. `safeguardNotice` (shared) decides whether a scenario's text hits a trigger. The export reads it once into `ExportModel.safeguards`, puts the content notice at the front of the player briefing, repeats it in the Exercise Plan and gives facilitators the wellbeing check and the step-out rule in the handbook.
- **Safe messaging and helpline rules are field lint rules.** `hs_safe_messaging` (method or means detail near a suicide reference, suicide as a solution, language to avoid, single causes), `hs_exercise_helpline` (a real helpline number on a public-facing type needs the EXERCISE banner) and `hs_no_real_line_for_players` (never ask a player to contact a real line). They run in the repair round, so the model fixes what they flag. They are pattern checks and catch the common failures, not every one; a clinician review stays a release gate.
- **Threat family ids carry the field prefix** (`hs_crisis_surge`, `hs_service_degradation`) so other fields cannot collide with them.
- **Psychological first aid** is an original summary of the eight core actions, with the source named. The field guide itself is linked, not copied, until its license is read from the PDF.

## Consequences

- A scenario that turns on any one of the four toolkits can add the others; the domain suggests the safeguards toolkit by default.
- The safeguards apply wherever the toolkit is on, so justice and nursing exercises can reuse them without code.
- The trigger words are broad ("abuse", "988") and can show a notice that a facilitator does not need; a false notice costs a paragraph, a missing one costs more.
- Four toolkits mean the user turns on up to four switches; the domain's suggestion list and the guide say which.
