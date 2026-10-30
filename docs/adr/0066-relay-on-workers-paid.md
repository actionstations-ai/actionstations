# ADR-0066: The relay moves to Cloudflare Workers Paid; its caps are the cost cap

## Context

ADR-0034 put the public relay on Cloudflare's free Workers plan with no payment method, so a busy
or hostile day could only stop the relay, never bill anyone. The free plan allows 100,000 SQLite
row writes a day for the whole account. To keep the worst day under that, the relay allowed 25
sessions a day (3 per address) with 3,600 row writes each, about 1,800 stored messages. That is
too tight for real use: about 20 organizations running an exercise on the same day fill the
account's day, an office behind one address gets 3 sessions including rehearsals, and one large
exercise (30 or more devices, 40 injects, receipts from each device) can run out of writes partway
through.

## Decision

- The relay's Cloudflare account moves to Workers Paid ($5 a month), which includes 50 million
  SQLite row writes, 1 million Durable Object requests and 5 GB-month of storage each month.
- Workers Paid has no spending cap, so the relay's own quotas are the cost cap. They are sized so
  the worst abused month stays inside the included allowance:
  - 100 sessions a day for the account and 10 per address (IPv6 by /64);
  - per session, 15,000 row writes, 7,500 stored messages and 24 MiB stored;
  - worst day 100 × 15,000 = 1.5M row writes, worst month 45M of the included 50M.
- Everything else in ADR-0034 stands: one Durable Object per session on the SQLite backend,
  hibernation, 72-hour retention, no `Origin` on session creation, per-address edge windows,
  60 devices and 30 messages a minute per participant, no paid add-ons (Logpush, observability
  retention, Rate Limiting rules, Argo).

## Consequences

- The project pays $5 a month. Incoming WebSocket messages bill as requests at 20:1 and are
  bounded by the per-participant rate, so a fully abused month may run a few dollars over the
  included requests. Storage is bounded by the 72-hour retention and the per-session byte cap.
- When the daily cap is reached the relay still answers `DAILY_LIMIT` and the app offers this
  computer or the organization's own server.
- Raising any cap means redoing the worst-month sum against the included allowance first.
- Spec 0408 FR-4 ("free plan only") is superseded by this record.
