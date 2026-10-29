# Deploying the Action Stations relay

By hand, from a developer's machine, never from a workflow (a workflow would need a Cloudflare
API token in GitHub and would push to production on its own; ADR-0023 and spec 0408 keep both
out). Read the whole page once before the first deploy.

## 0. Before anything: the account must be unable to spend money

The relay runs on the **Workers Free** plan of a Cloudflare account that has **no payment
method**. Past a daily allowance Cloudflare fails the operation with an error and bills nothing;
with a card on file, some products would bill instead. Check both every time, in the dashboard
(dash.cloudflare.com), before `wrangler deploy`:

1. **Plan.** Open the account, then **Workers & Pages**, then **Plans** (also shown under
   **Manage Account → Billing → Subscriptions**). It must say the Workers plan is **Free**. If it
   shows "Workers Paid" or an upgrade is pending, stop and ask the owner.
2. **Payment method.** **Manage Account → Billing → Payment info** must show no card and no
   PayPal account ("No payment method on file" or equivalent). If one is listed, stop: remove
   it or ask the owner before deploying.
3. **Paid add-ons off.** Under the Worker's **Settings** (after a first deploy) and the
   account's **Workers & Pages → Observability**: Logpush off, no paid observability retention,
   no Rate Limiting rules, no Argo or paid zone features on `actionstations.ai`. The repository's
   `wrangler.toml` turns nothing paid on; the dashboard must agree.
4. **Durable Objects on the SQLite backend.** The free plan offers only SQLite-backed Durable
   Objects; `wrangler.toml` declares `new_sqlite_classes`. A deploy that asks for the
   key-value backend fails on the free plan, which is the right outcome.

Record the date and who checked in the release notes (see step 5).

## 1. What protects the shared daily allowance

Every session is capped so one busy or hostile session cannot spend the day's free allowance,
and every address is capped so one person cannot take the day (spec 0408, "Allowance budget"):

- Per session (`RELAY_HUB_OPTIONS` in `src/env.ts`): 60 devices; 64 KiB per message; 30 messages
  a minute per participant; 1,500 stored messages and 12 MiB of them; a lifetime budget of 3,600
  row writes (a stored message is two, a media chunk two, a device one); blobs up to 8 MiB each
  and 64 MiB per session. Controllers are bound by the same store caps: past them their frames
  still reach connected devices but are not kept for late joiners, and the app is told.
- Per address: **3 sessions a day** (IPv6 counted by /64); per account: **25 sessions a day**
  (UTC), both counted durably by the `QuotaObject`. Session creation is accepted only as
  `application/json` without an `Origin` header, so a web page cannot spend the quota; the
  desktop app sends neither a browser `Origin` nor another content type.
- Worst day: 25 × 3,600 = 90,000 row writes, under the plan's 100,000; catch-up reads stay
  under the 5,000,000 rows read.

Past a cap the client gets `relay.error` (`RATE_LIMITED`, `STORE_FULL`, `BLOB_QUOTA`,
`SESSION_FULL`), `429` for an address that has created its share, or `503 DAILY_LIMIT` for the
26th session, and the app says what to do. Change the caps only with the budget table in the spec.

A Turnstile challenge on session creation was considered and not adopted: the controller is a
desktop app, not a browser, and the caps above with no payment method bound the harm. Revisit if
the metrics (step 4) show creations being refused on ordinary days.

## 2. Build

From the repository root, on a machine with the dependencies installed:

```
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test                      # the relay's tests run with the app's
pnpm --filter @actionstations/relay-cloudflare build
```

`build` runs `scripts/build-public.mjs`: it copies the player page from `out/player/` (built by
`pnpm build:player`, issue #411) into `public/` and writes `public/manifest.json` with
`playerBundleSha256`. Without a player build it hashes the placeholder page; `/v1/health` reports
that hash either way. Then bundle without deploying:

```
pnpm --filter @actionstations/relay-cloudflare bundle:check   # wrangler deploy --dry-run --outdir dist
```

`wrangler` is not a dependency of the repository; `pnpm dlx wrangler@4.155.0` fetches that
pinned version into pnpm's cache. Nothing in this step talks to the Cloudflare account. Wrangler
sends anonymous usage telemetry to Cloudflare unless told not to: export
`WRANGLER_SEND_METRICS=false` in the shell you deploy from (the package scripts set it).

## 3. Deploy

```
cd relay/cloudflare
export WRANGLER_SEND_METRICS=false
pnpm dlx wrangler@4.155.0 login          # browser OAuth to the project's account; no API token is stored anywhere
pnpm dlx wrangler@4.155.0 whoami         # confirm the account name before going on
pnpm dlx wrangler@4.155.0 deploy
```

The first deploy creates the Worker `actionstations-relay`, the two Durable Object classes
(migration `v1`) and the static assets. `wrangler.toml` routes the custom domain
`relay.actionstations.ai`; the zone's DNS is on Cloudflare's free plan in the same account, and
Workers custom domains are free. Deploying from an account that does not hold the zone fails on
that route: comment the `[[routes]]` block out and use the `workers.dev` hostname the deploy
prints.

Log out when finished (`pnpm dlx wrangler@4.155.0 logout`) so no long-lived credential stays on
the machine.

## 4. After the deploy

- `curl https://relay.actionstations.ai/v1/health` → `{ "kind": "relay", "version": …,
"protocol": [1], "caps": {…}, "playerBundleSha256": … }`. The hash must equal the one
  `build` printed.
- Dashboard: **Workers & Pages → actionstations-relay → Metrics** shows the day's requests and
  errors; **Durable Objects** shows requests, duration and SQLite rows. Read them after the first
  week and before raising any cap (spec 0408, open question 3).
- Plan and payment method again (step 0). A deploy cannot change them, but the check is cheap.
- `pnpm dlx wrangler@4.155.0 tail` only while debugging: it streams connection events (session
  and client ids, close codes, request URLs) to your terminal and nowhere else. Nothing is
  persisted. Payloads never appear in it, and neither do tokens: the connection contract carries
  the join and resume tokens in the WebSocket subprotocol and the controller token in the
  `Authorization` header, and the relay refuses any token in a query string.

## 5. Release notes

Each app release that changes the relay lists the Worker version id (`wrangler deployments
list`), the `playerBundleSha256`, and the date of the step 0 checks. The app's
`RELAY_PLAYER_BUNDLE_SHA256` constant (issue #410) is updated in the same release so **Test**
can say whether the relay serves the bundle this app shipped with.

## When a limit is reached

Nothing to do on the account: it cannot be billed, and the allowance resets at 00:00 UTC. The
app tells facilitators to switch the session to **This computer** or **Your server** or to try
after midnight UTC. If sessions hit `DAILY_LIMIT` on ordinary days, read the metrics and adjust
the caps through the spec's budget table, not by upgrading the plan.

## Rolling back

`pnpm dlx wrangler@4.155.0 rollback` returns to the previous deployment. Sessions in flight lose
their sockets and reconnect; stored frames are in the Durable Objects and survive a deploy.
