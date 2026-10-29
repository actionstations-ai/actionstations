# Live play: the player page

The player page is what participants open on their own phone, tablet or laptop during a live exercise. It needs no install and no account: the facilitator shows a QR code (or hands out per-role cards), a player scans it, picks a seat, and sees what the exercise sends to that seat. This guide describes the page as it ships in 0.6.0; the facilitator's side (starting a session, the Live tab, role cards) is documented with the features that provide it (#407, #410, #418).

## Joining

1. Scan the room's QR code or open the link. The link carries the key to the exercise in the part after `#`, which never leaves the device: do not forward it. A per-role card preselects a seat; the controller still decides who sits where.
2. **Pick your seat.** The list shows each role with its team and, where the facilitator set one, how many seats are taken ("1 of 2 seats taken"). A full seat cannot be chosen. **Evaluator** needs the staff link the facilitator gives evaluators separately; on a players link it is shown but disabled, with that reason.
3. **Display name** is optional (up to 40 characters). Under the field the page says what happens to it: in a non-attributional exercise the name is shown to the room only while you are connected and is not recorded; in a named exercise, names are recorded.
4. **Join exercise.** If the seat was taken in the meantime the page says so and you pick another.

Small print on the join screen shows the page version and the protocol version; **About** repeats them.

## The room

The header shows the exercise clock (it ticks on the device while the facilitator has it running and shows "paused" otherwise), the scenario title, your seat, and the connection state as a dot with text: **Connected**, **Reconnecting…** or **Offline**.

- **Inbox** holds what was addressed to your role, your team or this device, newest exercise time on top, with an unread marker and a count on the tab. A new inbox item is announced to screen readers; the device vibrates if it can and you left that on, and plays a short sound only if you turned sound on in Settings (off by default: rooms are loud enough).
- **Feed** holds what everyone saw: items sent to the whole room, controller notices (dismissible unless the facilitator marked them otherwise), clock changes ("Time jump to 2:00") and announcements that a vote, survey or the hot wash opened or closed.
- **Messages** (to the SimCell) comes with a later update. The tab is shown disabled rather than hidden so the layout does not change when it opens.
- **More** holds Votes, Hot wash, Surveys and Evaluate (each shown disabled with a one-line reason until its feature lands or when the exercise does not use it), **Settings** (theme: system, light or dark; text size; sound; vibration) and **About** (versions, which connection the page uses, what is and is not recorded, and **Forget this device**).

On phones the tabs are at the bottom; on wide screens they become a left rail.

Every inject's exact text is on the card, including the image description, so nothing depends on reading pixels. Media and receipts for injects, and the other features, are added by their own updates.

## Losing and regaining the connection

The page reconnects by itself. When the device sleeps, changes network or loses Wi-Fi:

- the header keeps saying Connected for two seconds (short drops are invisible), then says **Reconnecting…** or **Offline** with a banner;
- the page retries with growing pauses (half a second up to thirty seconds), and at once when the screen turns back on, the network comes back, or the tab is restored;
- after reconnecting it asks the server for what it missed and shows **You're back** for three seconds; everything missed appears in the inbox and feed in order, once.

A reload keeps your seat and history. A late joiner gets the whole history for their seat and the room.

## When the facilitator acts

- **Moved to another seat:** the header changes and the inbox rebuilds for the new seat from what the page already holds; a notice in the feed says so.
- **Removed from the exercise:** the page shows "The facilitator removed this device from the exercise" and stops reconnecting. The key was rotated, so the old link no longer opens anything; a new link from the facilitator does.
- **Session ended:** the end screen shows the facilitator's closing message. The page drops its keys and material; it can be closed.
- **Update needed:** if the page is older than the server, it asks you to reload.
- **This device id is in use:** another browser connected with the id this page saved (for example the same link restored on another device). **Join as a new device** continues with a fresh id.

## Injects on your device

- **Inbox and feed.** An inject for your seat (or your team) lands in the inbox; one for everyone lands in the feed. **Open** shows it in full.
- **The artifact and its text.** The picture, video or audio is the same one the facilitator has. **Text version** (collapsed) holds the exact text of the inject; screen readers read it as the image's description. **Open full size** shows the larger image in a window you close with Close or Escape. Audio does not play by itself; it has a transcript, and video has captions when the inject has voice lines.
- **Read and actioned.** The facilitator sees that your device received the inject, that you read it (the detail was open for a second) and, if you press **Mark as actioned**, that you acted on it. Receipts are by seat, not by person, unless the session records names.
- **Withdrawn.** If the facilitator takes an inject back, it leaves your inbox and the feed says "Withdrawn by the facilitator".
- **Evaluators and observers** see every inject, marked "Not addressed to you".

## Privacy

The page makes requests only to the computer or server that served it: no fonts, scripts, images or trackers from anywhere else, and the content security policy the page ships with forbids them. Exercise traffic is end-to-end encrypted (ADR-0027); the servers hold no key. The browser keeps the device id and the position in the stream for this tab only (`sessionStorage`), the theme and cue preferences for this browser (`localStorage`), and the display name in memory. **About → Forget this device** clears the id and keys for the session from this browser.

## For developers

- Build: `pnpm build:player` writes `out/player/` (index.html, assets/, manifest.json) and checks the gzipped size budget; `pnpm build:app` and the installers include it as `app-resources/player/`.
- Try it without the app: `pnpm dev:player` serves the built page from a scripted session on `http://127.0.0.1:8485` and prints the players and staff links, a per-role card, and `curl` lines for notices, injects, clock changes, reseat, kick and end. Set `PLAYER_NO_WS=1` to exercise the fetch fallback. Open the links in a phone browser on the same machine or through the browser's device emulation.
- Tests: `pnpm exec vitest run src/player` (state, reconnect, catch-up, screens) and `pnpm exec playwright test e2e/live/` (five simulated devices against the harness, plus the axe-core audit in light and dark at 100 % and 200 %). Screenshots land in `.tmp/live/`.
- Where features plug in: `src/player/app/items.ts` turns an opened frame into an inbox or feed item (the generic text card is the fallback), `src/player/screens/MoreScreen.tsx` lists the tabs, `src/player/features/<name>/` is each sub-spec's folder. Design: [ADR-0033](../adr/0033-player-page-bundle.md); spec: [0411](../specs/0411-player-page.md).

## Delivering injects to devices

With a session running, **Deliver** on a row also sends the inject to the devices of the people it is for, in the Inject panel's **Devices** section:

- **Targets.** Computed from the MSEL row: the row's roles (a whole team becomes the team), everyone for "All" or an inject shown on the main screen. **Edit targets** changes them before delivering. **Send to devices** off keeps the inject off the devices (the rest of Deliver is unchanged).
- **Expected actions.** **Show expected actions to evaluators** adds the row's expected action to the evaluators' copy only, sealed with the staff key. Players never receive it, nor the instructor note.
- **Receipts.** The timeline shows "to 3 · 3 delivered · 2 read · 1 actioned" and the panel lists each seat with times. **Resend** sends the same inject to another role or team. **Undo deliver** also withdraws it from devices.
- **Media.** Files are sealed on this computer and staged when the session starts ("Staging media 14/26" in the Live tab). Template pages go as a phone-sized picture plus the full-size original. A file over the connection's limit is left out and the device is told it is shown on the main screen.
- **Not covered by Deliver.** Printing and reading aloud are still done by you; players cannot send injects to each other.

## Choosing the connection

Each live session starts by choosing how devices reach this computer. The Live tab shows three options and what each one sends where, side by side with the Start button. Nothing contacts a network until you press **Test connection** or **Start session** on a connection you chose. The choice is remembered per exercise; **Settings > Live play** sets the one a new exercise opens on.

**This computer.**

```text
Your computer listens on the Wi-Fi at the address shown. Players' devices load the player page from it and exchange encrypted session messages with it. Nothing is sent to the internet. Stops when you end the session.
```

**Action Stations relay.**

```text
Your computer connects to relay.actionstations.ai, run by the Action Stations project on Cloudflare. It sends the session id, encrypted messages and media, their sizes and timing, and your IP address. The relay cannot read session content and keeps encrypted messages only for late joiners, deleting them when you end the session or after 72 hours. Limits: 60 devices, 8 MB per media file, 25 sessions per day for everyone; when the free limit is reached it stops with an error and nothing is ever billed.
```

**Your server.**

```text
Your computer connects to the server address you enter, run by your organization. It sends the same things as to the relay: session id, encrypted messages and media, sizes and timing, your IP address, plus the server key you were given. The server cannot read session content. Its retention and limits are set by whoever runs it.
```

- **Test connection** runs a checklist without starting a session: for This computer, your network addresses and whether the port is free (no traffic leaves the computer); for the relay and for a server, one health request, the protocol, the limits, and for a server the certificate and whether it accepts your server key. A failed line says what to do next.
- **The first time an exercise uses the relay or a server**, the Live tab repeats what is sent and asks you to continue. Test and Start stay off until you do. The answer is saved in the exercise's folder.
- **Your server** needs its address (https), and the server key whoever runs it gave you. The key is stored encrypted on this computer, never in the exercise folder, and is entered again on each computer. A server with its own certificate shows a fingerprint after the first test: compare it with the one your IT team gave you and press **Confirm this fingerprint**. The app then accepts only that certificate and stops with "The server's certificate changed" if it ever differs. **This server has no TLS** is for a reverse proxy or a trusted network and allows http only for this computer or a private address.
- **Remembered servers** (Settings > Live play) can be renamed, tested again or forgotten. Forgetting a server also deletes its stored key.

## In the room: this computer

Your laptop serves the player page and relays the session's encrypted messages to the devices on the room's Wi-Fi. No internet, no account, no IT ticket. Nothing listens until you start a session, and nothing listens after you stop it or quit the app.

### Start a session

1. Open a scenario and choose **Facilitate**.
2. In the side panel, open the **Live** tab.
3. **Network address**: the list shows this computer's IPv4 addresses with the interface each one belongs to. The Wi-Fi address is marked **recommended**; pick another if the phones are on a different network (an Ethernet segment, for example). VPN and virtual adapters are listed last and never recommended. If the list is empty, the computer is not on a network; if it shows only a self-assigned address (169.254.x.x), the network did not hand out an address and phones will not reach it.
4. **Connection security**: keep **HTTPS with a certificate made for this session** unless you have a reason not to. Each phone shows one certificate warning the first time it opens the page; the fingerprint shown under the QR code lets a player compare. **Plain HTTP** shows no warning, but anyone on the same network can change the page players load and, through that page, read and impersonate everything in the session; the app asks you to confirm before starting on HTTP and shows a warning for as long as the session runs. Use it only on a network where you trust every device.
   The address list marks a **public** address (one that is not a local network address) with a warning and asks before starting on it: devices beyond the room could reach the session.
5. **Attribution**: **By role** (the HSEEP default) keeps roles and never names in the record. **Named** also records the display name each player typed.
6. Read the firewall note (below) and press **Start session**.

The status line shows the address and port, HTTPS or HTTP, and how many devices are connected; it updates as devices join and leave. The computer is kept awake while the session runs.

### Join links and QR codes

Two links exist per session, each with its QR code:

- **Players link**: show it on the main screen. Every player scans it.
- **Staff link**: for controllers, evaluators and SimCell helpers only. It opens expected actions and evaluator material, so never show it on the main screen; use **Show staff link** and hand it over directly.

The key that decrypts the session travels only in the part of the link after `#`, which browsers never send to any server. **Copy link** puts the full link on the clipboard.

**Switch address** restarts the listener on another address with a new certificate and new QR codes; devices reconnect by scanning again.

### Firewall prompts

The first time the app listens, your operating system asks:

- **macOS**: "Do you want the application Action Stations to accept incoming network connections?" Choose **Allow**. If you chose Deny, open System Settings → Network → Firewall → Options, find Action Stations and set it to "Allow incoming connections", then start the session again. Unsigned builds may ask on every launch.
- **Windows**: "Windows Defender Firewall has blocked some features of this app." Tick **Private networks** and choose **Allow access**. If the room's Wi-Fi is set to **Public**, Windows blocks incoming connections regardless: Settings → Network & Internet → Wi-Fi → the network → Network profile → **Private**, or ask IT.
- **Linux**: most desktops ask nothing. With `ufw` enabled, allow the port shown in the status line (`sudo ufw allow 8485/tcp`).

When no device has connected a minute after the QR code went up, the Live tab shows these recovery steps again. The usual causes: the phones are on a different network (guest networks often keep devices apart; a phone hotspot from the laptop or the relay are the workarounds), the firewall prompt was denied, or the QR code shows an address this computer no longer has.

### Certificate warnings per phone

- **Android, Chrome**: "Your connection is not private" → **Advanced** → **Proceed to 192.168.x.x (unsafe)**. **Certificate details** shows the fingerprint to compare.
- **iPhone, Safari**: "This Connection Is Not Private" → **Show Details** → **visit this website** → **Visit Website**. Safari shows no fingerprint. Safari also refuses the page's live connection on a certificate it has not trusted, so the page falls back to a fetch-based connection automatically; nothing to do.
- **Desktop browsers**: as Chrome on Android; Firefox has **Advanced** → **Accept the Risk and Continue**.

### What is served, to whom

The listener is bound to the one address you chose, on port 8485 (or the next free port up to 8495, else one the system assigns; the QR code always carries the real one). It serves: the player page and its files, `/v1/health` (server kind, version, protocol, caps; nothing about the session), and the session endpoints, which need the join token from the invite (sent in a header or the WebSocket handshake, never in the address, so it cannot land in a log). Requests that name another host, or WebSocket connections opened by a page from another origin, are refused. Anything else is a 404. Every response carries a strict content security policy and no-store caching. The server makes no outbound connection. Session messages are ciphertext to the server; it stores them in memory for late joiners and drops them at the end. Each device is limited to 60 messages a minute and 8 MiB of uploads per session, an address to four devices, and uploads that never finish are dropped after two minutes; the session holds at most 512 MiB of media.

### Logs

- `scenarios/<scenario>/live/<session>/log.jsonl` in the project folder: the session record (who joined by role, what happened), written by the app. It never contains client ids, join tokens, keys, IP addresses or, in a **By role** session, names. `session.json` beside it describes the session.
- `userData/live/lan.log` (rotated at 5 MB × 3): connection events with time, remote address, client id and close code; never a message.
- `userData/live/sessions/<session>.json`: the session's keys, encrypted with the operating system's keychain, deleted when the session ends.

### Stop

**Stop session** sends "Session ended" to every device, closes the port and writes the end time into the session folder. Quitting the app does the same first.

### Troubleshooting

| Symptom                                           | Check                                                                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "This computer is not on a network"               | Join a Wi-Fi network or plug in Ethernet, then reopen the Live tab.                                                                            |
| Phones cannot open the page                       | Same Wi-Fi? Firewall allowed (above)? Does the address in the QR code match the computer's current one (use **Switch address**)?               |
| The page opens but never connects                 | On Safari the fetch fallback should take over by itself. Elsewhere, the certificate warning must be accepted on the page first. Try reloading. |
| "A live session is already running"               | One session per app. Stop it from the scenario where it runs, or quit and reopen the app.                                                      |
| Port 8485 is busy                                 | The app moves to the next free port automatically; the status line and the QR code show it. Firewall rules written for 8485 need the new port. |
| "could not store the session keys" in the app log | The operating system keychain is unavailable (common on Linux without a keyring). The session runs; it cannot be resumed after a crash.        |

## Remote and hybrid: the Action Stations relay

The relay is a small service the project runs on Cloudflare's free plan. It forwards encrypted
messages between your app and the players' browsers, keeps them only so a player who joins late
or reconnects can catch up, and deletes them when you end the session or after 72 hours at the
latest.

**What the relay sees:** session ids, device ids, connection times and IP addresses, the size
and timing of messages, and opaque destinations. **What it cannot see:** any content: inject text
or media, messages, votes, notes, names, or the keys. Its source is in this repository under
[`relay/`](../../relay/README.md).

### Limits, in plain numbers

The relay costs nothing to run and stays that way because every session is capped:

- 60 devices in a session.
- Messages up to 64 KiB; media files up to 8 MiB each and 64 MiB per session. The app tells you
  which injects are too large for the relay and offers to show them on the main screen instead.
- 30 messages a minute per participant (short bursts are fine); 1,500 stored messages kept for
  players who join late or reconnect.
- 3 sessions a day from one address, and 25 a day across everyone who uses the relay (the day
  resets at 00:00 UTC).

### If you see "The Action Stations relay has reached today's free limit"

The shared daily allowance is used up. Nothing is wrong with your exercise and nothing is
billed to anyone. You can:

1. Switch the session to **This computer** if everyone is in the room, or to **Your server** if
   your organization runs one.
2. Try again after 00:00 UTC.

Other messages you may see: **Session is full (60 devices)**: a device must leave before another
can join. **Too many messages; slow down**: a device sent more than its share; it continues after
a short pause.

### Privacy

The relay never contacts your computer on its own, and the app never contacts the relay unless
you chose it for a session. Cloudflare, like any internet host, sees the TLS connection and IP
addresses. Players' browsers load the player page from the relay; the app checks the page's
published hash when you press **Test** and warns if it differs from the one this version shipped
with.

## Your own server

For networks without internet or where no third party is acceptable, the same server runs on
your hardware. The install guide lands with issue #409; the design is in spec
[0409](../specs/0409-live-self-hosted-server.md).

## Decision-point votes

On your device, a **Vote now** bar appears under the header when the facilitator opens a vote for your seat. Open it, pick one option (the options are a radio group with large targets) and press **Cast vote**. You can change your vote with **Change vote** until it closes, unless the facilitator turned that off. If the facilitator asked for a reason, a box takes up to 280 characters; it is anonymous like the vote. When the vote closes you see the result, with your own choice marked, or a line saying the facilitator will show it on the main screen. If you were offline when it closed, the page says the vote closed before your ballot arrived and that it was not counted. A countdown, when there is one, is read out at 30 and 10 seconds. Evaluators, observers and players the vote is not for see "Vote in progress" and no ballot.

For the facilitator, in the **Votes** tab beside **Live** (a session must be running):

- **Open a vote.** Start from an MSEL row that has a decision, or write a new question with two to eight options (one per line). Choose who votes (everyone, or roles and teams), whether people may change their vote, whether to ask why, whether devices show the running tally (off by default: seeing the tally before voting changes votes), and a countdown. On a row with a decision, **Open vote** in the Inject panel opens it with one click. Only one vote is open at a time.
- **Show on screen** opens the presentation window on the vote: the question, a bar per option with its count and percent as text, "N of M voted" and the status. **Close** freezes the tally and sends the result to devices. **Reopen** is offered for two minutes after closing.
- **Record as decision** adds the result to the decision log on the vote's row, so the hot wash and the AAR can use it without reading the session log.
- **Decisions that fork the exercise** (branching) open as votes from here too: the vote uses the decision's own options, its anonymous or by-role mode and its voting roles, and the Decisions tab reads the tally from it when it closes the decision by its rule.

### Anonymity and the group-size guard

- **Anonymous** (default). The session log has the final tally and one line per ballot with the option and the time: no device, no seat, no role. To let people change their vote, the app keeps a list of which device voted what in memory only; it is dropped two minutes after the vote closes (the reopen window) and is never written to disk. A changed ballot is a second line that names the option it replaced.
- **By role** shows the result split by role. Before it opens, the form warns when a role in scope has fewer devices than the group size; a role under that size is shown and logged as **Other** (so a principal and a deputy cannot be told apart from a larger group). The group size is 3 by default and never below 2. If the people folded into Other would be a single device, that row is left out of the split (their vote still counts in the totals).
- **Reasons** are logged as separate lines with the option and the text, never with who wrote them.
- A vote that is still open when the session ends is closed as **ended early** with the tally so far.

## Messages with the SimCell

On your device:

- **Messages tab.** Write to the SimCell to call the vendor, answer the reporter or ask for something. Enter sends; Shift+Enter starts a new line. **Reply to SimCell** on an inject quotes it above your message.
- **Photos.** Add up to three. Each is shrunk on your device to fit the connection and loses its location data before it is sent. Describe it in the box that appears (optional).
- **Answers** come from whoever the facilitator is playing ("Channel 5 newsroom"), with "played by SimCell" under them unless the facilitator turned it off. A ✓ means the controller has your message. If you are offline, text waits and goes when you are back; a message with a photo shows **Not sent** and **Try again**.
- You only see your own conversations (your role, your team, or a call to your device).

For the facilitator, in the **Messages** tab beside **Live**:

- **Threads** are listed by last activity with how long the oldest unanswered message has waited. **Message a role, team or device** starts one.
- **Reply as** picks who is speaking: the SimCell scripts' roles, the senders in the MSEL, SimCell, Controller, or any name. The scripts for that persona appear under the thread; **Insert** puts a question or concession in the box without sending it.
- **Mark handled** clears the waiting time for a message that needs no answer. **Star** marks it for the AAR. **Pin to hot wash** records it in the session log for the hot wash. Players never see these marks.
- The log keeps each message with the role (never the name at attribution by role) and exercise time; the controller is always recorded as the sender of an answer.

## The Room and the session log

The **Room** tab in Facilitate is the one place to see how a live session is going. It follows the session as it happens and also opens for a past one (**View** in the Live tab).

- **Seats** shows how many devices are connected in each seat. A player seat nobody has joined is marked **Empty**.
- **Released injects** lists each inject you released with how many devices have it delivered, read and acted on, how long the median device took to read it, and what answered it.
- **Unanswered injects** lists a release that expects a response and has had none after 10 minutes. It counts as answered when a targeted seat marks it acted on, when a player in a targeted seat sends a message after the release, or when you press **Mark answered**. Each newly unanswered inject is announced once by the screen reader's status region.
- **Messages**, **Votes**, **Hot wash** and **Evaluation** give one line each. The line at the top shows connected devices, dropped frames by reason and the size of the log.

**Log** opens the newest 200 entries of the session log with a kind filter and a search box. **Load earlier** adds older entries. **Star** marks a message for the after-action report.

### Past sessions

The Live tab lists the scenario's earlier sessions with their length and counts. A session that was never ended (the app closed or the computer lost power) is marked **Interrupted**; **Close as ended** ends it at the time of its last entry. This version cannot reconnect devices to an interrupted session.

- **Export JSON** and **Export CSV** write the log to a file you choose. The CSV opens in a spreadsheet. Names are left out unless the session was run with display names and you tick **Include display names**.
- **Delete session data** removes the session's log, attachments and staged media from the project folder. It cannot be undone. The facilitator notes and the evaluation for the scenario are not touched.

The log is a plain file in the project folder (`scenarios/<id>/live/<sessionId>/log.jsonl`). It holds the exercise content in the clear, like the rest of the project; protect the folder as you protect the scenario.

## Evaluators

Evaluators join with the **staff link** (Live tab, **Show staff link**) and choose the Evaluator seat. A player's link cannot open it, and a player's device never receives the evaluators' material.

**On the evaluator's device.** Open **More > Evaluate**. The form lists the critical tasks from the exercise's Exercise Evaluation Guides, grouped by Core Capability, each with the plan section it comes from, the role expected to do it, the timing and the inject rows to watch. If expected actions are shown (the default), each inject's own expected action is also listed. Rate each task **Met**, **Partial**, **Not met** or **Not observed**, add a note, check the exercise time (filled from the clock) and the linked inject. Write about roles and procedures, never names.

- **Watch for** appears when an inject is released and lists the tasks it should trigger, until you rate them or dismiss the entry.
- **My watch list** shows the roles and capabilities the facilitator gave you; **All tasks**, **Unrated** and **Due now** change the view.
- **Add an observation not tied to a task** records something the guides did not expect.
- A line at the bottom says how many observations are waiting to send.

**Offline.** Keep rating with no signal. Observations are kept on the device and sent, once each and in order, when it reconnects. Editing a rating sends a new revision; the controller keeps the latest and logs every one.

**After the exercise.** The page shows your observations, read-only. Copy what you need: a later visit to the link does not keep them. Without a device, use the printed EEG packet and type the results into the Evaluation tab afterwards.

**For the facilitator.** In the Live tab, **Evaluators** lists who has joined, lets you set each one's watch list (empty means everything) and turns **Show expected actions to evaluators** on or off. In the Facilitate Evaluation tab, **Live observations** shows a coverage matrix (task by evaluator), the latest observations with filters, **Ask to watch** (a notice to one evaluator's device) and every recorded observation with its source. Live observations are saved in `scenarios/<id>/evaluation.json` as `source: 'live'`, labelled "Evaluator 1", "Evaluator 2" in join order.
