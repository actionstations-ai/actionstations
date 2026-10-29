# The exercise program

An exercise program keeps the corrective actions from every exercise in one list, with an
owner, a due date and a status, and holds the multi-year schedule (the Integrated Preparedness
Plan, IPP). It is optional: a project works exactly as before without one.

## Create or open a program

1. Open **Program** in the sidebar.
2. **Create a program**: name it, set the first year and length of the cycle (1 to 5 years),
   and choose where the folder goes. Nothing is created until you press **Create program**.
   Put the folder on a shared drive if colleagues will use it; there is no server and no
   account. **Open a program folder** opens one that already exists.

The program is a plain folder named `<Name>.asprogram` with one JSON file per corrective action.
You can back it up, move it, or keep it in a synced folder.

## Link projects

On the overview, **Link project** lists your recent projects. A project links to one program.
Linking records the project's scenarios, the plan sections they cite, their ratings and the list
of documents in a snapshot inside the program, so the program still works when the project is on
another computer. **Refresh** rereads the projects; the snapshot is also refreshed when the
program opens and when a live session ends. **Unlink** keeps the corrective actions that came
from the project.

## Corrective actions

**Corrective actions** lists every action as a table. Click a column header to sort, filter by
status, capability, owner or project, and tick rows to change status, owner or due date together.
Open an action to edit it, change its status and read its history.

Status moves from Open to In progress to Completed to Verified. Deferred and Cancelled need a
note. Verified needs a verification: a drill, or the place it was seen working in an exercise
or review. **CSV** writes the list in the HSEEP Improvement Plan columns; **Export** also writes
Word and PDF.

### Import from an after-action report

On the report page, **Send corrective actions to program** (or **Import from AAR/IP** here)
shows each corrective action the report proposes, with its capability and plan sections. Tick
the ones to add, and fix wording, owner or due date. An action already imported is marked and is
never added twice; one whose report text changed since is offered as an update that keeps the
status, owner and due date you set in the program. The report then shows which program action
each item became.

### If two people edit the same action

Saving checks that nobody else saved first. If someone did, you see their version and choose
**Use their version** or **Keep mine**. When another computer has the program open, the screen
says "Also open by" with its name; you can keep working. The notice comes from a small
`.lock.json` file with the computer's name, which you can turn off in the program's settings.

## The schedule

**Schedule** shows a year-by-quarter grid for the cycle. **Priorities** records what the cycle
must achieve, with the capabilities, the reason and where it came from. **Add exercise** plans a
seminar, workshop, tabletop, game, drill, functional or full-scale exercise, with the priorities,
capabilities and corrective actions it serves. Link the scenario built for it; once the scenario
has been run, the exercise shows as completed with the date. **Export** writes the schedule as
Word, PDF or CSV.

## Propose next exercise

The overview ranks the Core Capabilities and plan sections the next exercise should test. Open
and overdue actions, years since the capability or section was last exercised (never is highest),
priorities no completed exercise has addressed, and an exercise already planned this or next
quarter all add to the score, and each item lists its reasons. The same program always gives the
same list. **Start a scenario from this proposal** opens the Generate brief with the constraints
filled in ("Must test ... ; Verify CA-0012: ..."). Only those sentences go to the brief; owner
names and emails never do. Review the brief before generating.

## Privacy

Owner names and emails are stored in the program folder you chose and shown in its exports. They
are not logged and are not sent to any model. Nothing in the program makes a network request.
