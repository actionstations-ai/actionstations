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

## Privacy

The page makes requests only to the computer or server that served it: no fonts, scripts, images or trackers from anywhere else, and the content security policy the page ships with forbids them. Exercise traffic is end-to-end encrypted (ADR-0027); the servers hold no key. The browser keeps the device id and the position in the stream for this tab only (`sessionStorage`), the theme and cue preferences for this browser (`localStorage`), and the display name in memory. **About → Forget this device** clears the id and keys for the session from this browser.

## For developers

- Build: `pnpm build:player` writes `out/player/` (index.html, assets/, manifest.json) and checks the gzipped size budget; `pnpm build:app` and the installers include it as `app-resources/player/`.
- Try it without the app: `pnpm dev:player` serves the built page from a scripted session on `http://127.0.0.1:8485` and prints the players and staff links, a per-role card, and `curl` lines for notices, injects, clock changes, reseat, kick and end. Set `PLAYER_NO_WS=1` to exercise the fetch fallback. Open the links in a phone browser on the same machine or through the browser's device emulation.
- Tests: `pnpm exec vitest run src/player` (state, reconnect, catch-up, screens) and `pnpm exec playwright test e2e/live/` (five simulated devices against the harness, plus the axe-core audit in light and dark at 100 % and 200 %). Screenshots land in `.tmp/live/`.
- Where features plug in: `src/player/app/items.ts` turns an opened frame into an inbox or feed item (the generic text card is the fallback), `src/player/screens/MoreScreen.tsx` lists the tabs, `src/player/features/<name>/` is each sub-spec's folder. Design: [ADR-0033](../adr/0033-player-page-bundle.md); spec: [0411](../specs/0411-player-page.md).
