# Plan redlines and regression drills

After an exercise, the after-action report says which plan sections did not work. **Redlines**
turns those findings into proposed wording, in a form the plan's owner can accept or reject.
**Drills** then replay only the injects that failed, after the plans were changed, and record
whether the gap closed.

Nothing here changes the plans you imported. Proposals are written to files in a folder you
choose, and the plan's owner applies them.

## Propose changes to the plans

1. Open the scenario's after-action report and choose **Propose plan redlines**.
2. Tick the areas for improvement to work on. Only findings that cite a plan section are listed.
3. **Draft proposals.** For each cited section, the text of that section and the finding go to
   the provider set for drafting (a cloud provider asks for your approval first, as everywhere
   in the app). Each proposal quotes the current words exactly and gives new wording and a
   two-sentence reason. A quote that is not in the section is sent back once and then dropped.

Each card shows the plan, section and page, whether the plan can carry tracked changes, the
source check for the new wording (Grounded, Needs review or Unsupported), and the words that
change: deleted words are struck through (read as "deleted: ..."), new words are underlined
("inserted: ..."). **Edit proposed text** changes the new wording, **Show section** shows the
section around it. Accept or reject each proposal.

To propose a change yourself, select words in a document's **Text** tab and choose **Propose
redline from selection**, or use **Add by hand** on the Redlines page. The words must be in the
section the way the plan has them.

## Export

**Export accepted...** asks for a folder and writes, per plan:

- `<Plan>-redline.docx`, a copy of a Word plan with your accepted proposals as tracked changes
  (author "Action Stations"). In Word, use Review > Accept or Reject. Only the changed words are
  marked, and the formatting around them is kept.
- `<Plan>-change-memo.docx` (and a PDF if you tick it) for plans that are not Word files, and for
  any proposal that could not be marked in the Word file (text in a table or a text box). It
  quotes the current text and the proposed text, shows the marked-up difference, and gives the
  reason, the corrective actions and the exercise that found it.

The result lists which proposals went where. Exported proposals show the file and cannot be
edited; make a new one instead.

Each heading in a plan's **Headings** tab on the Documents page shows how many proposed changes (not counting rejected ones) sit at or under it. When a regression drill has tested a proposal, its card shows the verdict of the latest run (Passed, Partly passed or Failed), judged from the criteria the proposal was meant to fix.

### Checking the file in your word processor

The exported Word file opens in Word 2016 and later, LibreOffice 7 and later, and Pages without a
repair prompt. After a change to the export code, check this by hand:

1. Open `<Plan>-redline.docx`; the review pane lists the revisions with author "Action Stations".
2. Accept All: the text reads as the proposals say. Reject All: the text is the original.
3. The headings, numbering and fonts outside the marked words are unchanged.
4. Record the program and version you used in the pull request.

## When the plan is updated

Import the new version of the plan, open it in **Documents** and set **This plan replaces** to
the old version. The accepted proposals are read against the new text: **Applied in the new
plan** (the old words are gone and the new ones are there), **Not applied** (the old words are
still there) or **Needs review**. **Check against updated plans** on the Redlines page reads them
again.

## Regression drills

1. Rate each inject's criteria in Facilitate during the exercise (or type in the paper forms).
2. On **Drills**, **Create drill** (or **Plan a regression drill** in the report). Every inject
   whose criteria were last rated not met or partial is ticked; add or remove injects. The drill
   lists the corrective actions and redlines that answer them and the plans it expects to be
   updated.
3. **Build drill scenario.** A new draft scenario holds only those injects, with the same ids so
   results line up, an opening STARTEX card that says where things stand, a time jump wherever the
   exercise skipped more than 20 minutes, an ENDEX card, and one phase. Citations follow the
   updated plan; a section that was renamed or removed is flagged `CITATION_MOVED` with the nearest
   heading. The source scenario is not changed.
4. Play it in **Facilitate** and rate the same criteria. When the live session ends, or with
   **Record run**, the drill records each criterion's latest rating and a verdict per corrective
   action: **Pass** when every observed criterion is met, **Fail** when any is not met, otherwise
   **Partial**. A criterion nobody observed is left out; if none was observed the verdict is
   Partial with the note "not observed".
5. With a program open, **Record in program** writes the verdicts to the corrective actions: a
   pass verifies the action, anything else is kept as an attempt without changing the status.
   Nothing is written to the program until you choose this.

The runs table shows every run over time, with a line for the share of criteria met and the same
numbers in words. **Export results** writes `drill-results.csv` and a one-page PDF.

### Fidelity check log

Sample: the `samplePlan` fixture with one accepted proposal (the PIO sentence), exported through
`applyTrackedChanges`, author "Action Stations".

| Date       | Program and version                                       | Insertions and deletions                                                             | Author and date                                      | Result                 |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------- |
| 2026-10-30 | Word for Mac (16.x)                                       | Shown as tracked changes: "may", "release", "consulting" deleted, new words inserted | Margin balloons read "Action Stations, Deleted: ..." | Pass, no repair prompt |
| 2026-10-30 | LibreOffice 26.8.2                                        | Shown as tracked changes (strike-through and underline, coloured by author)          | Author is Action Stations                            | Pass                   |
| 2026-10-30 | Pages (macOS)                                             | Tracked changes recognised: the review bar reads "6 Changes" with Accept and Reject  | Author kept                                          | Pass                   |
| 2026-10-30 | LibreOffice 26.8.2, `soffice --headless --convert-to pdf` | The PDF shows deleted and inserted words side by side with the unchanged text intact | Not shown in PDF                                     | Pass                   |

The exporter writes insertions and deletions only; it does not write Word comments, so none are
expected in the file.
