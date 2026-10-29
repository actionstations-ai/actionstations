# Source check and plan conflicts

Two checks help you trust what the generator wrote and the plans it read:

- **Source check** labels every expected action, controller note, overview section and scenario idea that makes a claim about your plans: **Grounded**, **Needs review** or **Unsupported**, with the reason one click away.
- **Plan conflicts** compares your own plans, policies and forms and lists the places where two of them disagree, with both passages side by side.

Both run on your computer without a model. A model check is optional and goes through the provider you set for reviews (**Providers → Routing → Critique**). The design is recorded in [ADR-0028](../adr/0028-deterministic-grounding-first.md) and the full behaviour in [spec 0423](../specs/0423-grounding-and-plan-conflicts.md).

## What the labels mean

| Label            | When                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grounded**     | Every sentence of the claim matches the cited passages, and every role, agency, identifier, deadline, number, section and plan action it names (notify, activate, approve, authorize, isolate, evacuate, declare, shut down, report) is in them or in your facility facts. |
| **Needs review** | The passages support part of the claim, or something it names is not in them. Read the passage before the exercise.                                                                                                                                                        |
| **Unsupported**  | Nothing is cited, the cited passage is no longer in the index, the passage does not address the claim, or it says something different (another deadline, number or role in the same statement).                                                                            |

Items that make no claim about the plans (start and end cards, time jumps, a background event with no expected action) get no label.

Each label is a word with an icon in the app's status colours, so colour is never the only signal, and screen readers hear "Source check: Needs review (automatic check)".

## Where you see them

- **MSEL**: a badge under each row's citations. The **Source check** bar above the grid shows the counts ("41 grounded · 6 to review · 2 unsupported"); **Show rows to check** lists the rows to look at, unsupported first, with **Go to row** and **Details**. A row's **Actions** menu has **Source check…** too, so everything works from the keyboard.
- **Inject editor**: under the controller note.
- **Overview**: on each "Core sections tested" chip.
- **Ideas**: next to "Why it teaches".
- **Warnings** (Scenario checks): the counts, each unsupported item as a check and each item to review as a tip. None of them block saving, export or the Ready status; the progress bar mentions how many items have no plan support.

## Details, your label and the model

**Details** shows each claim sentence, the closest cited passage, how much of the claim's wording is in the cited passages, the terms found and not found, and any passage that says something different.

- **Mark grounded** / **Mark unsupported** set your own label, with an optional note. It stays until the item's text or citations change; then the check runs again.
- **Verify with model** asks the review model whether each claim follows from the passages. Every answer must quote the passage word for word; an answer whose quote is not in the passage is ignored (and logged in the job), so text hidden in a document cannot fake support. The model can lower Grounded to Needs review, or raise a label to Grounded when every claim is supported with a quote. The automatic label stays visible next to the model's.

The **Verify with model** button on the Source check bar checks every labelled row and inject of the scenario (the weakest first, at most 120).

## How the check works and where it is wrong

The check compares wording, not meaning. It reads the full text of each cited chunk, not the short quote shown on hover. A plan that says the same thing in other words gives Needs review; a claim that copies plan words without following the plan can come out Grounded. With an embedding model set in **Settings → Embeddings**, similar meaning also counts; the built-in keyword embedder is not used for this.

Labels are recomputed when the claim, its citations, the cited text (a document imported again) or the checker change. After you edit a row, its label updates with the save.

## Exporting the labels

**Export → Add a Source check column to the MSEL** adds the label of each row to the MSEL PDF. The MSEL is controller material; player documents never show the labels. The option is off by default.

## Plan conflicts

On **Documents**, under **Plan conflicts**, **Check plans for conflicts** reads every document of kind plan, policy or form and looks for statements that answer the same question differently:

- who approves public releases, or another action;
- how soon an agency must be notified, or a report sent;
- the phone number of a role;
- the level at which a centre is activated;
- who leads a function.

Two statements are a candidate when they come from different documents, are about the same subject and give different values ("within 1 hour" and "within 4 hours"; 60 minutes and one hour count as the same). **Also compare sections within one document** adds pairs inside one plan; it is off by default because an annex often overrides the base plan on purpose.

The check also lists **references to documents the project does not have**, such as "see Annex F" when no document has an Annex F.

With **Confirm each conflict with the model** on, each candidate (at most 80 per run, approvals and deadlines first) goes to the review model with both passages; it must quote both word for word or its answer is ignored. The option is on by default when reviews run on this computer and off when they go to a cloud service, since a full check can send up to 160 passages. Without a model, candidates are listed as found by matching the wording.

Each finding shows both passages with the value highlighted, the document, section and page, and the model's verdict when there is one:

- **Open passage** opens the document at that chunk.
- **Not a conflict** and **Confirmed** record your decision, with an optional note; **Reopen** undoes it.
- **Copy for plan owner** copies both citations and quotes as plain text.

Results are saved in `plan-conflicts.json` in the project folder. Running the check again keeps your decisions for passages that did not change; findings whose passage changed or was removed are marked outdated and shown only under **All, including outdated**. When a project has two or more plans and no check has run yet, the section offers to run one.

## Testing the seams between your plans

A conflict between two plans is good exercise material: players who follow one plan will clash with players who follow the other. On **Generate**, the brief form lists your open and confirmed conflicts and missing documents under **Plan seams to test** (confirmed conflicts first, then unconfirmed ones, then missing documents). Pick up to three. With no plan check yet, **Run plan check** runs one without a model.

- **Give me ideas** with **From plan seams** on asks for ideas built around the seams; each idea card says which seams it tests, and **Develop this** picks them in the brief.
- The phase plan places each seam in a phase (a notification deadline early, an approval where the pressure peaks). Both passages are always in that phase's prompt, and the MSEL gets at least one row that puts players in the seam. The inject does not tell players the plans disagree; finding that out is the point. When the model writes no such row, the best row of the phase is chosen and the check list says **An event was chosen to test a plan seam**; read it and re-run the phase if it does not fit.
- The seam inject's **instructor note** ends with a block that quotes both passages with document, section and page and says what to watch for. It is generated from the plans: the inject editor shows it read-only under the note you can edit, and it is rebuilt when the inject is regenerated.
- The **controller handbook** gets a **Plan seams this exercise tests** section: the two passages, the rows that test them and lines for your observations. The **hot wash** gets one question per seam ("Which did you follow, and which should the plans say?"). Take the answers to the plan owners.
- In the **MSEL** grid seam rows carry a **Seam** tag (hover or a screen reader gives the passages). In **Facilitate**, the controller panel shows a **Plan seam** tag and both passages; the presented screen never does. The player briefing and the player edition of the Situation Manual never mention seams.
- If the plan owners fix the plans and the next plan check no longer lists the seam, Scenario checks say **The plans no longer disagree where this scenario tests them**. Keep the inject as history or re-run the phase.
