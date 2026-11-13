# Research laboratories and biosafety

The research laboratories profile and the Lab safety toolkit let you exercise the people who run and oversee laboratories: biosafety officers, responsible officials of select agent registrations, laboratory directors and principal investigators, environmental health and safety, institutional biosafety committees, occupational health, research compliance and research IT. The exercise is about incident management: what the organization decides, whom it tells and by when. It is not about how to handle, grow, make or change anything, and the app is built so that it cannot be steered there. Read the [toolkits guide](toolkits.md) first if toolkits are new to you.

Every person, institution and place in a scenario is fictional. Every product is marked as exercise material, and the theft, loss or release worksheet is marked as not the official form.

## What you can exercise

Choose **Research laboratories and biosafety** as the kind of organization. One profile serves five settings, each a set of roles: a university biosafety program, a registered entity (a select agent registration), a hospital or clinical research laboratory, an animal facility, and a company or core facility.

| Incident                                | The exercise tests                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Laboratory exposure                     | Stop-work, medical evaluation, classification, and who must be told and by when            |
| Inventory discrepancy                   | Whether an item is missing or the record is wrong, immediate notice and the written report |
| Freezer failure and sample loss         | What to save first, the call-out path, the sponsor and the insurer                         |
| Laboratory facility emergency           | Evacuation, responders, and the work left behind                                           |
| Animal facility emergency               | Isolation, welfare, committee and sponsor reports                                          |
| Research data breach                    | Containment, restore from backup, IRB, sponsor and participant notices                     |
| Workplace violence or threat            | Lockdown, access and notification                                                          |
| Monitoring or access system degradation | Compensating checks and what to report                                                     |

Each runs the same seven phases: discovery, immediate actions and containment, classify and notify, investigate, written reports, corrective action, return to work.

## Choosing clocks

The clocks are on the Clocks strip in Facilitate, on exercise time, so a time jump moves them with it. Switch on the ones that apply to the organization you are exercising:

- **Select agent theft, loss or release.** Immediate notice to CDC or APHIS (and to law enforcement for a theft or loss), then the written report (Form 3) within 7 calendar days of discovery. A release counts when it causes an occupational exposure or escapes the primary barriers of the containment area. A theft or loss is reported even if the item is found later.
- **NIH Guidelines reporting.** The institutional biosafety committee reports significant problems and accidents to NIH within 30 days. A spill or accident with an overt exposure in a BL2 laboratory, or an overt or potential exposure in a BL3 or BL4 laboratory, is reported immediately.
- **Draft NIH biosafety policy.** Proposed notice within 24 hours and a full report within 30 days. This is a draft, the app says so on the clock and in exports, and you should check whether it has changed before you rely on it.
- **Institution-set deadlines.** For example, a principal investigator reports to the biosafety officer within 24 hours. These are example values, written as data in the pack, so you can replace them.

"Immediately" has no number in the regulations. The clock marks it as one minute, and the notification board widens it to the exercise window you set (60 minutes by default) so a call made a few minutes after discovery is not scored as late. Where your registration or your institution's policy is stricter than a regulation, the stricter rule governs: say which one your exercise applies.

Each clock shows its source and the date it was checked. These are exercise aids, not legal advice. Follow your registration and your institutional policy.

## The notification board

The board lists every notice the incident requires, whom it goes to, when it is due and where it stands: not started, open, due soon, made, made late or late. Each status is a word and a symbol as well as a color. Players record each notice as a decision (who, how, when), and the board and the notification timing measure read the same record.

## Why the guardrails restrict content

The toolkit keeps technique, growth, production, enhancement and modification detail for any agent out of everything the app writes, and out of its own content. It also keeps out quantities and doses, strain names, agent-specific procedures such as decontamination parameters, and protocol steps. A generated inject that carries any of these goes back to the model once with the category named; if it still fails, it shows a warning on the inject. A toolkit that fails the check is not loaded.

Agents appear in two ways only. A scenario can say "a select agent", "a Tier 1 select agent" or "a Risk Group 3 bacterium". A designer can name an agent from a short reviewed list of organisms with public health response guidance for exposures. Naming a high-consequence agent that is not on the list is flagged. You cannot turn the check off.

The rule set is a plain text check: it can pass a paraphrase and can flag a harmless sentence. It is one layer beside the writing guidance and the review a biosafety officer should do before you use an exercise.

## Keeping an exercise at the incident management level

- Write decisions about people, records, clocks and messages: "The responsible official telephoned the program at 14:20", not what is in a vial.
- Let the question be who decides and who is told, not the clinical or scientific answer. Occupational health, the biosafety officer, the principal investigator and the committee chair can disagree, and that is the exercise.
- Most reported inventory losses turn out to be records problems: a transfer logged in one system, an unsigned destruction, a mislabeled box. Let players search before they conclude.
- Freezer viability windows are numbers you set for the exercise. They are not biology.
- Keep emergency responder sheets to facility hazards: rooms, utilities, entry and who to call.

## Editing institution policy clocks

The institution deadlines are example values: 24 hours for a principal investigator to report to the biosafety officer, 3 days for the officer to report to the committee chair and 7 days for notice to the sponsor. Clocks are pack data, so to use your own periods, make a pack of your own that carries a copy of the institution deadlines with your numbers (see [packs](packs.md)), and switch it on under **Project settings → Compliance**. The notification timing measure takes its periods from the toolkit's settings in the same way. Keep the source and the date on the copy so the next person knows where the numbers came from.

## Decisions and measures

Twelve decisions are available in live play and Facilitate: classify the incident, notify a party, stop work in an area, send a worker for medical evaluation, restrict a worker, move samples to backup, activate the incident response plan, order an evacuation, submit a written report, brief the institutional official, issue a statement and restore a system from backup.

The Evaluation tab can score notification timing for each clock (minutes early or late and the number of missed notices), exposure response against protocol times you set, how many people in and near the room were reached, how many samples were moved before your limit, how much work a restore lost, and whether the messages from the laboratory, environmental health and safety, compliance and communications agree. The limits are yours, and the results show their inputs.

## Simulated data and figures

The freezer alarm trend, the inventory reconciliation with the discrepancy flagged, the sample loss register, the access log extract and the notification board are drawn by the app from data, never by an image model. Each has a text summary and a data table. The simulations (a freezer failure with call-out delay or a failed alarm, an inventory count, an access log with door anomalies, research system backup status and an exposure follow-up list) are labeled simulated everywhere.

## The drill record for registered entities

A registered entity must test its incident response plan at least annually and review it after any drill, exercise or incident. Tag an exercise as a select agent incident response plan drill and the after-action report adds a drill record: how the plan was tested, the problems found, the corrective actions and the participants, with any missing element named and a prompt to review and revise the plan.

## Reference library

A reference library carries the select agent regulations (42 CFR part 73, 2025 edition), the Federal Select Agent Program's incident response plan guidance, Biosafety in Microbiological and Biomedical Laboratories (6th edition) and the NIH Guidelines for Research Involving Recombinant or Synthetic Nucleic Acid Molecules. The draft NIH biosafety policy is linked because it may still change, and the select agent theft, loss or release form (Form 3) is linked because it is a web form.

## Example project

The Research laboratories and biosafety pack includes an example project, **Halvorsen State University Biosafety Program**, with one exercise, _Hairline Crack_: on a Tuesday morning in October a centrifuge tube cracks in the shared third-floor BSL-2 suite in the Lindgren Life Sciences Building and a graduate student reports a possible exposure; the protocol, the clinic physician and a sponsor give conflicting advice, and the IBC chair must decide whether the event goes to the NIH.

Turn the pack on under **Packs**, then open a copy from **Projects → Examples**. The organization, its people and its businesses are fictional; the exercise comes with its injects, media, Situation Manual, evaluation guides and controller handbook, ready to read or run.
