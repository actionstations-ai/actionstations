# ADR-0056: SimCell drafts need a person's approval

Date: 2026-10-29 · Status: Accepted · Issue: #429

## Context

During play the SimCell answers for outside parties (a reporter, a regulator, a vendor). A model can write those replies, but a weak model in a live role gives players wrong facts, gives away what a character must hold back, or agrees too easily. Research on role-played adversaries found that trait prompts ("aggressive", "pacifist") did not change model behavior in a measurable way, while goals and constraints did.

## Decision

- **Personas are constraints, not adjectives.** A card holds goals, deadlines, escalation rules, what the character knows, does not know and must never reveal, and concessions with a condition each. "Register" is one short style word. There is no free-text personality field.
- **A person approves every draft.** A draft is staff-only (sealed with the staff key on the wire, kept in the controller's `simcell.jsonl`). It reaches a player only through `simcell:resolve` with `send`, `edit` or `rewrite`. There is no auto-send setting.
- **The approved reply is signed by the host controller key** as an ordinary controller message; the persona is a display name. Players cannot tell a drafted reply from a hand-written one, and the player-side check stays one rule.
- **A capability gate chooses how much the model may do.** Eight probes, scored by code, run against the model routed to the `roleplay` task (which falls back to `draft`). Suited (7 or 8) drafts on its own; Limited (4 to 6) drafts only when asked and warns on each draft; Not suited (0 to 3) is off. The result is cached per provider and model. The probes live in code, not in a prompt, so a pack or an override cannot weaken the gate.
- **Each persona is drafted from its own view.** `context.ts` builds the prompt variables from an allow-list: the card, that persona's thread, the clock, and the events of linked rows that were released. Expected actions, controller notes and other personas' threads are never inputs.
- **Checks are flags, not blocks.** Text on the never-reveal list, a concession without its condition, agreement with nothing cited, broken character, an unknown person's name, and an over-long reply each show as a line of text beside the draft.
- **Voice calls go turn by turn.** `call.ring` carries the line as text and, when a voice is set up, as audio; the player answers by text or recording; the next line is drafted, approved and rung. Recordings reach the controller sealed to it, are transcribed on this computer, and are deleted afterwards unless the controller keeps them for the session.
- **Names are fictional.** The card editor and the generator refuse a name that binds a public office to a name or matches an agency contact in the project's facts.

## Consequences

- A busy controller still decides every reply; the assistant saves typing, not judgment. A queue of 10 drafts is 10 decisions.
- A small local model may be Limited or Not suited. The screen names the failed probes and suggests a larger model.
- The player page now asks for the microphone, only when the player taps to talk. `Permissions-Policy` for the LAN server, the relay and the harness changes from `microphone=()` to `microphone=(self)`.
- The player page converts a recording to a 16 kHz mono WAV in the browser (the browser has the decoders; the main process has none). That caps a spoken answer at about 32 seconds on the relay (1 MiB blob limit) and 60 seconds elsewhere.
