# Regional exercises

Several organizations, for example an airport, the city around it and a hospital, plan one
exercise while each keeps its plans on its own computer. You exchange only exercise material in
signed `.asexercise` files. Open **Regional** in the project menu.

## Before you start

1. On each computer, create an **identity** (organization name and a short prefix such as `AIR`).
   The app makes a signing key and keeps it in the computer's secure storage. If the computer has
   no keychain, it refuses.
2. Read your fingerprint (8 groups of 4 characters) to your partners by phone or in person.

## Rounds

1. **Host**: open the scenario, choose **Set up a regional exercise**, list the partners and
   **Review frame to send**, then **Save bundle**. The frame holds the title, overview, objectives,
   phases, roles and shared rows (STARTEX, ENDEX).
2. **Partner**: **Join an exercise**, open the frame, check the host's fingerprint with the host,
   type it and join. A new scenario appears in your project. Write your rows in your own project
   from your own documents. Your rows get your prefix (`AIR-I-05`).
3. **Partner**: **Review my slice to send** shows every file, what each row carries, every row or
   inject that cites your plans, and rows you marked private. Save and send it to the host.
4. **Host**: **Open a bundle** to pin a partner's key the first time (type the fingerprint they
   gave you), then **Merge slices**. The review shows rows added, changed and removed against the
   last merge, rejected items and warnings. Accept the slices you want.
5. **Host**: **Review merged exercise to send**. Partners **Open a bundle** and import it. Repeat
   until the host marks the exercise **Final**.

You cannot edit rows another organization owns. Record a **proposed change**; the owner accepts
(the change is made in their row) or declines with a note.

## What is shared

Rows, injects, instructor notes, expected actions and media. Citations are reduced to the document
title and heading unless you turn on **Share plan quotes**. A **private** row reaches partners as a
placeholder with a one-line public description. Plan documents, the search index, facility facts,
prompts and settings never leave.

## Partner rows are read-only

In the MSEL editor a row another organization owns shows **Owned by** and its prefix. You can read
it, check its sources and add a row after it, but not edit, move, lock, duplicate or delete it:
propose a change instead. Generating, re-running a step, repairing the MSEL and the critique
revision leave those rows exactly as their owner wrote them; they are still read as context for the
rows you own.

## Warnings and rejections

Rejected: a row that is not yours or outside your prefix, an older revision, a duplicate id. Warnings:
a slice built on an older frame, two rows to one role at one time, a row outside its phase, a row to
another organization's role, a dependency that is missing or now comes later.

## Live session

The app builds the controller roster from the pinned keys (`regional:roster`): each partner is listed with its row prefix and the roles it owns, so a partner's controller can release only its own rows. Connecting partner controllers to a session from the Facilitate page is not in this release. At the end the host writes one **log slice per organization**: exercise-wide events,
that organization's rows and roles, and the cross-organization channels it takes part in. The full
log goes to everyone only if the host turns on **Share the full session log** after all agree.

If a partner reports "Key changed", do not trust the new bundle until you have verified the new
fingerprint with them.
