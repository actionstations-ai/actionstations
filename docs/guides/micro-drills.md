# Micro-drills

A micro-drill is fifteen minutes of practice on one section of one plan, for one person or a
small team around one screen. It gives a short situation and three to five questions. After each
answer a facilitator checks it against what the plan says and, if something is missing, offers a
hint. New staff use it to find their way around an annex before their first full exercise.

**How much to trust this.** The evidence for short drills with graded hints is thin. The one
study we know of had four graduate students, played alone, and measured whether they meant to
use it, not whether they learned. A micro-drill is a prompt to open the plan and a way to see
which sections people find hard. It does not show that anyone has learned the plan, and it does
not replace an exercise. The screen and the debrief say the same.

These are not the regression **Drills** (see the [redlines guide](redlines.md)), which replay
injects that failed. Micro-drills are in the sidebar as **Micro-drills**.

## Build a drill

1. Open **Micro-drills**, choose a plan document and a section of it (the annex). A section over
   about 12,000 tokens cannot be chosen; pick a narrower one.
2. Set the audience (new staff or refresher), the planned length (10, 15 or 20 minutes), one
   person or a team of two to six, the number of questions (3 to 5) and, if you like, a focus
   such as "notification deadlines".
3. **Build drill.** Only the text of that section goes to the provider set for drafting (a cloud
   provider asks for your approval first). The mock provider works too.

The editor opens on the draft. Every question, expected point, hint and model answer can be
edited. Each question has three hints, written now and never at run time:

- **Level 1** points to the kind of thing to consider ("Who has to be told, and how soon?").
- **Level 2** points to the plan section by heading and page.
- **Level 3** says what the plan requires and quotes the plan line.

Checks run each time you save: every expected point and hint must cite a passage inside the
annex, the Level 3 quote must be in the passage it cites word for word, no question may contain
its own answer, the number of questions must fit the length, and a person's name that is not in
the plan is flagged (use a role or a fictional name). A drill with problems cannot be marked
**Ready** unless you tick **Mark Ready even though the problems above remain**. Editing a drill
returns it to Draft until you mark it Ready again.

## Run a drill

**Run** opens the situation and the people. A team lists two to six labels (names are optional;
leave them empty to stay anonymous) and one person types. Then one question at a time:

- Write the answer and choose **Check my answer**. The facilitator lists the expected points the
  answer covered and how many are still open, and may ask one follow-up question. It says
  nothing about points that are open beyond that, so hints still help.
- A hint is offered after an answer that misses a point, and you can ask for one at any time.
  Hints are the drill's own text, in order, and each is recorded.
- The clock counts up against the planned length. It never stops the drill. It can be paused.

**Fading.** The app remembers, for each participant label and plan section, how many hints each
question needed. On a repeat run, when nobody needed a Level 3 hint last time, hints are offered
after the second missed answer instead of the first; and a question answered without hints in
the last two runs no longer offers the plan quote (Level 3). People can still open the plan. The
run screen states the rule that applies.

**Without a model.** If no drafting provider is set up, or the model misjudges any of three fixed
test answers it is given before the run, the run uses a checklist: you write your answer, tick
the expected points you covered, and see the model answer. Hints and fading work the same. The
run says why it uses the checklist.

**Scoring.** A question's score is the share of its expected points covered (partly covered
counts half), reduced by the highest hint used: none for Level 1, a quarter for Level 2, a half
for Level 3. Results are shown as points covered and hints used, never as pass or fail. The
screen says: "This drill is practice. Results show which plan sections need review; they are not
a measure of individual performance."

## Debrief

At the end the debrief lists, per question, what was covered, what was missed with its plan
section and page, the model answer, the hints used, and one line on which sections to review.
**Save as PDF** writes it to the project's `exports` folder. If a model checked the answers,
compare with the model answers: a model can misjudge.

## In the program

When the project is linked to an [exercise program](program.md), each finished run adds a
summary to the project's snapshot there: the date, the plan section, the Core Capabilities of the
drill's objectives, the number of people, minutes, share of points covered and hints used. No
answer text and no names go to the program. **Program > Health** shows it as **Practised in
drills** next to the exercise counts for each plan section. It is counted separately and never
adds to "times cited", because a drill and an exercise test different things.

## Privacy

Drills, answers and names stay in the project folder (`micro-drills/`, `micro-drill-runs/`,
`micro-drill-hints.json`). **Remove names from runs** on a drill takes every name off its runs
and keeps the labels and results. Only the section text, a question, its expected points and the
answer go to a model, and only to the provider you set for drafting.

## From a scenario

On the Build panel, **Make drills from this scenario** builds one draft drill for each plan
section the scenario says it tests (up to five), using the settings above and the scenario's
situation in shortened form. Sections too large for a drill are skipped and counted. Every drill
is a draft: read it before you mark it Ready.

## As evidence for a corrective action

When you mark a corrective action Verified, the status dialog lists finished drill runs on a plan
section the action cites. Choosing one sets the check to Review, suggests a result from the share
of expected points covered, and writes a note that names the run. Only the totals the program
keeps are used, never answers or names. You can change the result and the note.

## On players' own devices

While a live session runs (Facilitate, Live), a Ready drill has a **Send to devices** button.
Each player sees a **Join the drill** button, reads the situation, and answers one question at a
time on their own phone. Your computer checks every answer against the plan and replies to that
phone only; hints are the drill's prewritten ones, and a player sees the expected points of a
question only after they have answered it. Other players never see an answer.

The **On players' devices** panel shows each participant by label ("Participant 1"), whether the
device is connected, how many questions they have answered and how many hints they used. **Close
the drill and finish every run** ends it: each device's run is finished, added to the program's
practised count, and opens in the debrief list like any other run. If no model can check answers
reliably (the same three test answers as on this computer), players tick the points they covered
instead. A session for surveys only cannot carry drills.
