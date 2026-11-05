# ADR-0091: Grade passback by LTI 1.3 is not built yet; CSV export ships first

Date: 2026-11-05 · Status: Proposed (needs the owner's decision) · Issue: #794 · Spec: [0453](../specs/0453-classroom.md) FR-9 · Related: ADR-0090 (named students), project rules 1 and 3 (cost, no telemetry)

## Context

Instructors want scores in the LMS gradebook without retyping. Spec 0453 FR-9 asks whether LTI 1.3 with Assignment and Grade Services (AGS: line item, score and result services; OpenID Connect launch; OAuth 2.0 client assertion; HTTPS) can fit a local-first desktop app, and names the obstacle: the LMS has to reach a registered tool over public HTTPS, and a desktop app has none. No LTI code ships before this ADR is accepted.

The statements below come from the 1EdTech LTI 1.3 and AGS 2.0 specifications as understood when this ADR was written. How each LMS implements registration (pasted public keys, localhost redirect URLs, who may register a tool) was not tested here and is marked **to verify** where a decision depends on it.

## What LTI 1.3 needs, and what a desktop app can do

| Step                                                                     | Who connects to whom                                                                           | Desktop app                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool registration                                                        | An LMS administrator enters the tool's login URL, redirect URL and public key (or key set URL) | Needs an administrator at the institution; many instructors cannot register a tool themselves (**to verify** per LMS)                                                                                    |
| Launch (OIDC login, then a signed `id_token` posted to the redirect URL) | The instructor's browser, sent by the LMS                                                      | Possible only if the app listens on a URL the browser can reach, typically `https://localhost:<port>` with a local certificate; the LMS may refuse non-public or non-HTTPS redirect URLs (**to verify**) |
| Key verification                                                         | The LMS fetches the tool's key set                                                             | Needs a public key set URL, unless the LMS accepts a pasted key (**to verify**)                                                                                                                          |
| Token request and score posting (AGS)                                    | The tool calls the LMS over the internet with a signed client assertion                        | An outbound call; no public endpoint needed. It is the only network call this feature would add, and it goes to the LMS the instructor named                                                             |

So the spec's constraint is partly right: the app cannot be a registered tool by itself in the general case, but only two pieces need something reachable (launch and key publication), and both have partial workarounds that depend on the LMS.

## Options compared

1. **Stay with CSV.** Already built (ADR scope of #733). Works with every LMS that imports a gradebook file, needs no registration, no hosting and no network. Cost: the instructor uploads a file.
2. **A small relay or hosted tool** that is the registered tool, receives the launch, holds one launch's grade payload and posts scores. Works with any LMS, but moves student scores through a server we run: it needs a privacy review, hosting cost (rule 1), a data-processing story for education records, and an ADR of its own. It conflicts with "the app never offers to send student records to a service" (FR-12) unless the instructor runs it themselves.
3. **OneRoster CSV.** 1EdTech's OneRoster defines CSV files for rosters and for results. Where an LMS or student information system imports it, it is a file exchange with the same properties as option 1 and a standard layout. Which products accept results this way, and which version, is **to verify**.
4. **Local launch receiver plus pasted key** (a variant of LTI 1.3 with no hosting). The app listens on `https://localhost` for the launch, the administrator pastes the app's public key at registration, and scores are posted from the desktop. No server of ours, no student data leaves the instructor's computer except to their own LMS. Risks: certificate warnings, administrator effort for every instructor, and LMS policies on localhost redirects. Feasible on paper; **not verified** against any LMS.

## Decision (proposed)

- Ship the **generic gradebook CSV** now. Add a named layout for an LMS only after its current import rules are checked, one task per LMS.
- **Do not build LTI** until a spike (an afternoon per LMS, with a test instance and an administrator) shows option 4 works with at least two LMSs. If it does not, keep CSV and consider OneRoster results (option 3).
- **Reject the hosted relay** (option 2) unless an institution asks for it and funds the hosting; it would need its own ADR and privacy review.

## Consequences

- Instructors upload a CSV; there is no automatic passback in this release.
- The spike's open questions are listed above as **to verify**, so the work is bounded.
- Nothing in the app opens a listening port or an outbound LMS connection.
