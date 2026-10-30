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

### Import an existing list from a CSV file

**Import CSV…** on the Actions page reads a spreadsheet of corrective actions you already keep. The first row names the columns: `Title` or `Corrective Action`, `Issue/Area for Improvement`, `Core Capability`, `Capability Element`, `Primary Responsible Organization`, `Organization POC`, `Email`, `Start Date`, `Completion Date`, `Status`, `Priority` and `Notes` (the column names of the Improvement Plan export also work, so an exported list imports back). A preview shows each row as it will be created, with a warning for anything left out (an unknown capability, a date that is not `YYYY-MM-DD` or `M/D/YYYY`, an unrecognised status) and the reason a row cannot be imported. Rows whose title is already in the program are skipped, so importing the same file twice adds nothing. A leading `=`, `+` or `@` in a cell is removed so nothing can run as a spreadsheet formula later. Files are limited to 1 MB and 1000 rows. Status Verified needs a verification record, so it imports as Completed.

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

## Health

**Program > Health** answers the questions leadership and grant reviewers ask: which Core Capabilities and plan sections have been exercised, when, and what has never been tested. It is built from the program folder only (the snapshots of each linked project, the schedule and the corrective actions), so it works when some project folders are on other computers. A line at the top shows when each snapshot was taken; a snapshot older than 30 days, or for a project that is not on this computer, is marked "Out of date" and **Refresh from projects** is highlighted.

- **Core Capabilities by quarter.** One row per capability with a status in words: _Current_ (exercised in this cycle and within the stale window), _Stale_ (last exercised before the cycle began, or more than the chosen number of months ago; 24 by default), _Planned only_ (not exercised, but a planned exercise names it) and _Never exercised_. Each quarter cell is the number of exercises; click it to see them and open the scenario (when the project is on this computer) or the corrective actions for the capability. Met, partly met and not met are counts from observation, not a score. Exercises that predate Core Capability mapping are counted in a notice above the table.
- **Plan sections.** Sections to three levels of each plan (read from the project's index when the snapshot is taken, so headings late in a long plan are listed, up to 400 per plan), with how many exercises cited them and the last date. The same plan ingested into two projects is one row.
- **Corrective actions.** Counts by status, how long open actions have been open, the overdue list and open actions by organization.
- **Never tested.** Capabilities a program priority names that no exercise addressed, plan documents with no cited section, uncited plan sections at the top two levels, and planned exercises whose quarter has passed.
- **Filters.** Project, year, mission area and plan document apply to every panel and are kept in the address, so you can bookmark a filtered view.

**Export report** writes a dated PDF and a ZIP of five CSV files (`capabilities`, `sections`, `corrective-actions`, `never-tested`, `timeline`) with the same rows as the screen. Tick _Leave out owner names_ before sharing outside your agency.

## Privacy

Owner names and emails are stored in the program folder you chose and shown in its exports. They
are not logged and are not sent to any model. Nothing in the program makes a network request.
