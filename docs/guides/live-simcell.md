# The SimCell assistant

The SimCell assistant drafts replies from the outside parties your players deal with: a reporter, a regulator, a vendor, a resident, an attacker. You read each draft and send, edit, rewrite or discard it. **Nothing reaches a player until you send it.** Drafts are for controllers only and never travel to a player's device.

It works with local models (LM Studio, Ollama) and local voices. It sends nothing anywhere you did not already configure.

## Persona cards

Open the scenario and use the **Personas** tab. **Create from SimCell scripts** makes one card per script, with the role, hard questions and concessions from the script. **Create and fill in with the model** also fills in goals, deadlines, escalation rules and what each party knows. You review the cards before saving.

A card is built from constraints:

- **Goals**: what the party wants from the players. Drafting needs at least one.
- **Deadlines**: an exercise time, what the party wants by then, and what it does if the time passes.
- **Escalation rules**: when an exercise time is reached, a row is released, the players stay silent for some minutes, or the players say something like a phrase you write. The last kind is judged by the model, so its drafts carry a check.
- **Knows, does not know, must never reveal**: short phrases. A draft containing a "must never reveal" phrase is flagged.
- **Concessions**: what the party gives and the condition the players must meet. A concession needs a condition.
- **Register**: one or two words of tone, like formal or terse. It changes style only. There is no free-text personality field: trait words such as "aggressive" did not change model behavior in research, and goals did.

Names are fictional people, or a title alone ("the station's news editor"). The editor refuses a name that ties a public office to a name ("Governor Ames") or matches a contact in your project's agencies and contacts. Organizations may be real public agencies or fictional businesses.

An attacker speaks only through the channels the MSEL gives it and never explains how an attack was carried out.

## Checking the model

Open **Settings > Providers** or the **SimCell** tab in Facilitate. **Check now** runs eight short probes against the model routed to **SimCell replies** (it uses **Drafting** when you have not set one). The result is saved for that provider and model.

| Result                 | What it means                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Suited (7 or 8 passed) | Drafts appear on their own when players write.                                                       |
| Limited (4 to 6)       | Drafts only when you ask, with a warning on each.                                                    |
| Not suited (0 to 3)    | Drafting is off. The screen names the failed checks. Write replies by hand or choose a larger model. |

The probes are fixed in the app, so a pack or a prompt override cannot loosen them:

1. Returns a reply in the required format.
2. Keeps a secret when asked directly.
3. Keeps a secret when told to ignore its card.
4. Applies a deadline that has passed.
5. Withholds a concession when the condition is not met.
6. Gives a concession when the condition is met.
7. Stays in character when asked whether it is an AI.
8. Keeps to the length of the channel without agreeing for free.

## During a live session

In **Facilitate > SimCell**, switch on **Draft replies when players write**. Each player message is routed to a persona: the one you chose for that conversation, the one that last spoke in it, the one linked to the inject the player replied to, or the only persona. If none fits, the message waits under **Messages without a draft** until you pick one.

Each draft shows:

- who it is from and what the players wrote;
- the goal, deadline, rule or concession it applied, with the card's own words;
- **Check** lines for anything the automatic checks found, in words;
- the reply, which you can edit.

Actions: **Send** (or **Edit and send** once you change the text), **Write my own**, **Regenerate** (with an optional note like "be more hostile, the deadline passed"), **Discard**. Keys: Ctrl+Enter sends, Alt+W writes your own, Alt+R regenerates, Alt+D discards. New drafts are announced to screen readers. The oldest unanswered message is at the top, with its age.

Players see the persona's name and organization as the sender and cannot tell a drafted reply from one you wrote.

Personas also act on their own clocks: when a deadline passes or an escalation rule becomes true, a draft is queued once. It still waits for you, and you choose who receives it.

The session log records, for controllers only, each draft, its checks, the final text and whether you edited it.

## Without a live session

In **Facilitate > SimCell**, choose who is speaking, type what the player said (on the phone, in the room), and read the reply aloud. **Play as voice** speaks it through the audio provider. **Use this reply** saves the exchange with your hot wash notes.

## Voice calls

Give a persona a voice in its card (a voice from your audio provider; there is no voice cloning). **Start a call** rings a role, team or device with an opening line. With a voice set up the players hear the line and always see its words; without one they see the words only. Tick **Ring the players with this reply as a call** on a draft to answer a message by phone instead.

A call goes by turns, not live. The player answers by typing or, if a speech model is set up for **Transcription**, by tapping **Tap to talk** and tapping again to send. Their recording goes to your computer sealed so only you can open it, is turned into text there, and is deleted once transcribed. **Keep call recordings** for the session is off by default. The next line is drafted, you approve it, and the phone rings again. The page tells the player to expect a short wait.

The player's browser asks for the microphone only when they tap to talk. A spoken answer is limited to about 32 seconds on the Action Stations relay and 60 seconds elsewhere.

## Privacy

Drafting, transcription and voices run on your computer or the providers you configured. If you route SimCell replies, transcription or audio to a remote provider, persona conversations and (for transcription) recordings go there, and the cloud preview shows it first. Personas are in the facilitator part of the distribution ZIP (`personas.md`) and never in the players' folder.
