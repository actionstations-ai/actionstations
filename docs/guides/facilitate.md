# Facilitate: recording the hot wash

Facilitate runs the exercise: the clock, the MSEL timeline, the presentation window, ratings
and notes. This page covers recording the hot wash and turning it into quotes for the AAR.

## Before the first recording

1. Open **Settings › Speech to text** and download a model. whisper-base is the default;
   whisper-small is recommended on computers with 16 GB of memory or more. The download is the
   only network request transcription makes, and each file is checked against a pinned hash.
2. To use a whisper.cpp or speaches server instead, add it under **Providers** and choose it
   for **Transcription** in **Providers › Routing**. Only servers on this computer are accepted.

## Record

1. In Facilitate, press **Record hot wash** (or **R**).
2. Confirm that everyone present was told the discussion is being recorded, give the recording
   a title and press **Start recording**. On macOS the system asks for microphone access once;
   if it was turned off, allow Action Stations in System Settings › Privacy & Security ›
   Microphone. On Windows, check Settings › Privacy & security › Microphone.
3. While recording, the bar shows **Recording** or **Paused**, the time, the microphone and the
   input level in words. **R** pauses and resumes, **Shift+R** stops. The window title starts
   with "● Recording", and the presentation screen shows "This discussion is being recorded"
   unless you turn that off under Recordings.

Leaving Facilitate stops the recording. If the app closes while recording, the audio up to the
last second written is kept and the recording is marked **Recovered after the app closed**.

Recorded on a phone? Use **Import audio…** in **Hot wash › Recordings** (wav, mp3, m4a, ogg or
webm, up to 1 GB and two hours).

## Transcribe and mark quotes

1. In **Hot wash › Recordings**, choose the language (multilingual models) and press
   **Transcribe**. Progress and **Cancel** show on the recording; a later **Transcribe**
   continues where it stopped.
2. **Open transcript** lists the segments with recording time and clock time. Play a segment,
   **Edit** its text (the model's text stays visible), set the speaker, **Merge with next** or
   **Split at cursor**.
3. Tick **Quote for the AAR** and link the quote to an objective, MSEL rows and a Core
   Capability. The AAR draft cites quotes as T1, T2, ….
4. **Redact** replaces a segment's text with [redacted] everywhere, including the AAR input.

## Retention

The audio is deleted once its transcript is saved. To keep it (for example to re-check quotes
against the recording), tick **Keep the audio after its transcript is saved** under
Recordings. **Delete audio** removes it at any time and keeps the transcript. New projects
list hot wash audio in their `.gitignore`.

## Branching decisions

A scenario with branches (see the MSEL editor's **Branches** panel) adds a **Decisions** tab to Facilitate.

1. Deliver the decision row. The rows after it wait ("Waits for the decision") and the decision opens in the tab.
2. Count the room's votes: type how many hands went up for each option, then press **Decide by rule**. The rule you set when you designed the decision picks the option; a tie or no votes gives the default. Under the "controller decides" rule, or whenever the room's discussion deserves it, press **Controller chooses** and an option.
3. The branch not taken shows "Not taken" in the timeline and cannot be delivered. Deliver the chosen branch's rows as usual.
4. Changed your mind? **Override…** is offered until the first row of the chosen branch has been delivered. It needs a short reason, and the earlier decision stays in the record.
5. A decision with a timeout closes by itself when the time is up, using the votes entered so far.

**Propose next inject** (at the foot of the tab) asks the model for one more row in a branch that is playing. Read the card: **Accept** adds the row to the branch (it is still not delivered), **Reject** throws it away. Both are recorded.

**Replay check** replays the recorded decisions and deliveries against the scenario and says whether they match what the app recorded; if the scenario was edited after the run it says so instead. The record is `scenarios/<id>/live/local/log.jsonl` and holds counts, never names.

To print what happened, export **MSEL of one path** (the decisions taken and the path played) from the Export page.

## Controller tools

### Clock control

- **−5, −1, +1, +5, +15** move the clock. The keys `[` and `]` move it one minute and `Shift+[` and `Shift+]` five minutes (they follow the single-key shortcuts switch).
- **Rate** runs the clock faster or slower than real time: 0.5×, 1×, 2×, 4× or 10×. Type a rate up to 60× in the **Rate** box next to **Set time** for a quick demonstration. A change applies from that moment on.
- Moving the clock back past rows you already delivered asks what to do: **Keep them delivered** (the default) or **Mark them not delivered**, which clears their delivered time and, with live play, takes them off players' devices. **Reset** asks once rows have been delivered.
- Every change is written to a clock log (when, from and to which exercise time, rate, reason) in `facilitator.json`.

### Delivering to a team or role

A row can address a team ("Operations team") as well as roles; choose teams in the **To** cell of the MSEL editor. **Deliver to…** (`Shift+D`) lets you change the recipients for one delivery: the plan is preselected and your choice is stored with the delivery. Chips above the timeline show only the rows for a team or role (rows for everyone always show); the choice is remembered for the scenario. The hand-out line reads "Print / hand to Operations team (3 seats)".

### Engagement on social posts

For a tweet, Facebook, Instagram, Reddit or TikTok post, the inject editor has an **Engagement** section: how the counts grow (surge, steady or fade), when they peak, and replies that appear at set times. Misinformation and pressure injects start with a surge. After you deliver the post, the **Inject** tab shows the counts as they are now, and **Refresh on screen** redraws the post with them on the presentation window; **Auto-refresh** does it every 5 or 10 exercise minutes, at most once every 20 seconds. The template draws all the text. The pictures are a cache in the project's `.cache/engagement` folder and are deleted when you leave Facilitate.

### Tracker

The **Tracker** tab lists what needs a look:

- an inject that expects an answer (core narrative, pressure, misinformation, clue, technical hurdle, decision point, operational friction) and has had none 10 minutes after delivery (set a different window on the row);
- a commitment whose due time has passed, or that has been open 30 minutes with no time;
- at the end of a phase, an expected action nobody recorded (shown as a note).

**Mark answered** (`A`) records who and a line on the answer. **Add a commitment** (`C`) takes what was promised, who promised it and a time such as `10:30` (scenario time) or `+20`. Notes you type are read on this computer for promises ("we'll notify the FAA by 10:30"); matches appear under **Suggestions** and nothing is added until you press **Add**. **Prompt the table** shows a line for you to say aloud; the tracker never sends anything to players. New items are announced once to screen readers. The report of response times and commitment outcomes (`tracker:report`) feeds the after-action draft.
